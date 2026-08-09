import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireText } from '@/lib/v2/domain';
import { domainEventStatement, prepared, readJsonObject, requireScopedEntity, uuid, withV2, type V2Context } from '../../../_shared';

export const POST = withV2(['admin'], async (request: NextRequest, context: V2Context) => {
  const { id } = (await context.params) as { id: string };
  const body = await readJsonObject(request);
  const atendimentoId = requireText(body.atendimento_clinico_id, 'atendimento_clinico_id', 60);
  const motivo = requireText(body.motivo, 'motivo', 500);
  const procedimento = await requireScopedEntity<{ id: string; cliente_id: number }>('procedimentos_cliente', id, context.unidadeId);
  await requireScopedEntity('atendimentos_clinicos', atendimentoId, context.unidadeId);
  const liberacaoId = uuid();
  await getDb().batch([
    prepared(
      `INSERT INTO liberacoes_execucao (id, procedimento_cliente_id, atendimento_clinico_id, unidade_id, liberado_por_id, motivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [liberacaoId, id, atendimentoId, context.unidadeId, context.user.sub, motivo],
    ),
    domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: procedimento.cliente_id,
      entityType: 'procedimento_cliente',
      entityId: id,
      eventType: 'execucao_liberada_sem_quitacao',
      actorId: context.user.sub,
      data: { liberacaoId, atendimentoId, motivo },
    }),
  ]);
  return NextResponse.json({ id: liberacaoId, procedimento_cliente_id: id }, { status: 201 });
});
