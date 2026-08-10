import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireText, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, readJsonObject, requireScopedEntity, withV2, type V2Context } from '../../_shared';

export const PATCH = withV2(
  ['admin', 'atendente'],
  async (request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const agenda = await requireScopedEntity<{ id: string; cliente_id: number; status: string }>('agenda_compromissos', id, context.unidadeId);
    const body = await readJsonObject(request);
    const acao = requireText(body.acao, 'acao', 20);
    if (!['cancelar', 'falta'].includes(acao)) throw new V2DomainError('Use cancelar ou falta.');
    if (agenda.status !== 'agendado') throw new V2DomainError('Somente compromissos agendados podem ser alterados.', 409, 'agenda_encerrada');
    const next = acao === 'cancelar' ? 'cancelado' : 'faltou';
    const motivo = acao === 'cancelar' ? requireText(body.motivo, 'motivo', 500) : null;
    const now = nowIso();
    await getDb().batch([
      prepared(
        `UPDATE agenda_compromissos SET status = ?, cancelado_por_id = ?, cancelado_em = ?, motivo_cancelamento = ?, updated_at = ? WHERE id = ?`,
        [next, acao === 'cancelar' ? context.user.sub : null, acao === 'cancelar' ? now : null, motivo, now, id],
      ),
      domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId: agenda.cliente_id,
        entityType: 'agenda_compromisso',
        entityId: id,
        eventType: acao === 'cancelar' ? 'compromisso_cancelado' : 'paciente_faltou',
        actorId: context.user.sub,
        data: motivo ? { motivo } : {},
      }),
    ]);
    return NextResponse.json({ id, status: next });
  },
);
