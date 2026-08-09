import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne } from '@/lib/db';
import { optionalPositiveInteger, optionalText, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, prepared, readJsonObject, requireProfessionalInUnit, requireScopedEntity, uuid, withV2, type V2Context } from '../../../_shared';

export const POST = withV2(
  ['admin', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const { id: atendimentoId } = (await context.params) as { id: string };
    const atendimento = await requireScopedEntity<{ id: string; cliente_id: number; status: string }>('atendimentos_clinicos', atendimentoId, context.unidadeId);
    if (atendimento.status === 'finalizado' || atendimento.status === 'cancelado') {
      throw new V2DomainError('O atendimento não aceita uma nova avaliação.', 409, 'atendimento_encerrado');
    }
    const existing = await queryOne('SELECT * FROM avaliacoes WHERE atendimento_clinico_id = ?', [atendimentoId]);
    if (existing) return NextResponse.json(existing);
    const body = await readJsonObject(request);
    const requestedEvaluator = optionalPositiveInteger(body.avaliador_id, 'avaliador_id');
    const avaliadorId = requestedEvaluator ?? context.user.sub;
    await requireProfessionalInUnit(avaliadorId, context.unidadeId, ['avaliador']);
    const avaliacaoId = uuid();
    const orcamentoId = uuid();
    await getDb().batch([
      prepared(
        `INSERT INTO avaliacoes (id, atendimento_clinico_id, cliente_id, unidade_id, avaliador_id, observacoes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [avaliacaoId, atendimentoId, atendimento.cliente_id, context.unidadeId, avaliadorId, optionalText(body.observacoes, 'observacoes')],
      ),
      prepared(
        `INSERT INTO orcamentos (id, avaliacao_id, cliente_id, unidade_id, avaliador_id, observacoes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orcamentoId, avaliacaoId, atendimento.cliente_id, context.unidadeId, avaliadorId, optionalText(body.observacoes_orcamento, 'observacoes_orcamento')],
      ),
      prepared(
        "UPDATE atendimentos_clinicos SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        [atendimentoId],
      ),
      domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId: atendimento.cliente_id,
        entityType: 'avaliacao',
        entityId: avaliacaoId,
        eventType: 'avaliacao_iniciada',
        actorId: context.user.sub,
        data: { atendimentoId, orcamentoId, avaliadorId },
      }),
    ]);
    return NextResponse.json({ id: avaliacaoId, orcamento_id: orcamentoId, status: 'em_andamento' }, { status: 201 });
  },
);
