import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, getIdempotencyKey, nowIso, prepared, requireScopedEntity, uuid, withV2, type V2Context } from '../../../_shared';

export const POST = withV2(
  ['admin', 'atendente'],
  async (request: NextRequest, context: V2Context) => {
    const { id: agendaId } = (await context.params) as { id: string };
    const idempotencyKey = getIdempotencyKey(request);
    const existing = await queryOne('SELECT * FROM atendimentos_clinicos WHERE agenda_compromisso_id = ?', [agendaId]);
    if (existing) return NextResponse.json(existing);
    const agenda = await requireScopedEntity<{
      id: string;
      cliente_id: number;
      status: string;
      finalidade_avaliacao: number;
      avaliador_id: number | null;
    }>('agenda_compromissos', agendaId, context.unidadeId);
    if (agenda.status !== 'agendado') {
      throw new V2DomainError('O compromisso não está disponível para chegada.', 409, 'agenda_indisponivel');
    }
    const itens = await query<{
      procedimento_cliente_id: string;
      procedimento_cliente_etapa_id: string | null;
      profissional_id: number | null;
      observacoes: string | null;
    }>('SELECT procedimento_cliente_id, procedimento_cliente_etapa_id, profissional_id, observacoes FROM agenda_compromisso_itens WHERE agenda_compromisso_id = ?', [agendaId]);
    const atendimentoId = uuid();
    const now = nowIso();
    const statements = [
      prepared(
        `INSERT INTO atendimentos_clinicos (
          id, cliente_id, unidade_id, agenda_compromisso_id, status, criado_por_id,
          checkin_em, iniciado_em, idempotency_key
        ) VALUES (?, ?, ?, ?, 'em_andamento', ?, ?, ?, ?)`,
        [atendimentoId, agenda.cliente_id, context.unidadeId, agendaId, context.user.sub, now, now, idempotencyKey],
      ),
      ...itens.map((item) => prepared(
        `INSERT INTO atendimento_procedimentos (
          id, atendimento_clinico_id, procedimento_cliente_id,
          procedimento_cliente_etapa_id, executor_id, status, observacoes
        ) VALUES (?, ?, ?, ?, ?, 'planejado', ?)`,
        [uuid(), atendimentoId, item.procedimento_cliente_id, item.procedimento_cliente_etapa_id, item.profissional_id, item.observacoes],
      )),
    ];
    let avaliacaoId: string | null = null;
    let orcamentoId: string | null = null;
    if (agenda.finalidade_avaliacao === 1) {
      if (!agenda.avaliador_id) {
        throw new V2DomainError('Agendamento de avaliação precisa indicar um avaliador.', 409, 'avaliador_ausente');
      }
      avaliacaoId = uuid();
      orcamentoId = uuid();
      statements.push(
        prepared(
          `INSERT INTO avaliacoes (id, atendimento_clinico_id, cliente_id, unidade_id, avaliador_id)
           VALUES (?, ?, ?, ?, ?)`,
          [avaliacaoId, atendimentoId, agenda.cliente_id, context.unidadeId, agenda.avaliador_id],
        ),
        prepared(
          `INSERT INTO orcamentos (id, avaliacao_id, cliente_id, unidade_id, avaliador_id)
           VALUES (?, ?, ?, ?, ?)`,
          [orcamentoId, avaliacaoId, agenda.cliente_id, context.unidadeId, agenda.avaliador_id],
        ),
      );
    }
    statements.push(domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: agenda.cliente_id,
      entityType: 'atendimento_clinico',
      entityId: atendimentoId,
      eventType: 'paciente_chegou',
      actorId: context.user.sub,
      data: { agendaId, avaliacaoId, procedimentos: itens.map((item) => item.procedimento_cliente_id) },
      idempotencyKey: `evento:${idempotencyKey}`,
    }));
    await getDb().batch(statements);
    return NextResponse.json({ id: atendimentoId, agenda_compromisso_id: agendaId, avaliacao_id: avaliacaoId, orcamento_id: orcamentoId }, { status: 201 });
  },
);
