import { NextRequest, NextResponse } from 'next/server';
import { getDb, query } from '@/lib/db';
import { requireText, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, readJsonObject, requireScopedEntity, withV2, type V2Context } from '../../_shared';

interface AttendanceRow {
  id: string;
  cliente_id: number;
  status: string;
  agenda_compromisso_id: string | null;
}

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (_request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const atendimento = await requireScopedEntity<AttendanceRow>('atendimentos_clinicos', id, context.unidadeId);
    const [avaliacoes, procedimentos, evolucoes] = await Promise.all([
      query('SELECT * FROM avaliacoes WHERE atendimento_clinico_id = ?', [id]),
      query(
        `SELECT ap.*, p.nome_snapshot, p.status_comercial, p.status_clinico,
          op.status_financeiro, op.valor_final_centavos, op.valor_recebido_centavos, u.nome AS executor_nome
         FROM atendimento_procedimentos ap
         JOIN procedimentos_cliente p ON p.id = ap.procedimento_cliente_id
         JOIN v_procedimentos_cliente_operacional op ON op.id = p.id
         LEFT JOIN usuarios u ON u.id = ap.executor_id
         WHERE ap.atendimento_clinico_id = ?`,
        [id],
      ),
      query(
        `SELECT e.*, u.nome AS profissional_nome,
          GROUP_CONCAT(pc.nome_snapshot, ', ') AS procedimentos_resumo
         FROM evolucoes_clinicas e
         JOIN usuarios u ON u.id = e.profissional_id
         LEFT JOIN evolucao_procedimentos ep ON ep.evolucao_id = e.id
         LEFT JOIN procedimentos_cliente pc ON pc.id = ep.procedimento_cliente_id
         WHERE e.atendimento_clinico_id = ? GROUP BY e.id ORDER BY e.created_at DESC`,
        [id],
      ),
    ]);
    return NextResponse.json({ ...atendimento, avaliacoes, procedimentos, evolucoes });
  },
);

export const PATCH = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const atendimento = await requireScopedEntity<AttendanceRow>('atendimentos_clinicos', id, context.unidadeId);
    const body = await readJsonObject(request);
    const acao = requireText(body.acao, 'acao', 20);
    const transitions: Record<string, { from: string[]; to: string; timestamp: string }> = {
      iniciar: { from: ['aguardando'], to: 'em_andamento', timestamp: 'iniciado_em' },
      finalizar: { from: ['em_andamento'], to: 'finalizado', timestamp: 'finalizado_em' },
      cancelar: { from: ['aguardando', 'em_andamento'], to: 'cancelado', timestamp: 'cancelado_em' },
    };
    const transition = transitions[acao];
    if (!transition) throw new V2DomainError('Ação inválida. Use iniciar, finalizar ou cancelar.');
    if (!transition.from.includes(atendimento.status)) {
      throw new V2DomainError(`Não é possível ${acao} um atendimento ${atendimento.status}.`, 409, 'transicao_invalida');
    }
    if (acao === 'finalizar') {
      const incomplete = await query<{ id: string }>(
        `SELECT id FROM avaliacoes
         WHERE atendimento_clinico_id = ? AND status = 'em_andamento' LIMIT 1`,
        [id],
      );
      if (incomplete.length > 0) {
        throw new V2DomainError('Conclua ou cancele a avaliação antes de finalizar o atendimento.', 409, 'avaliacao_em_andamento');
      }
    }
    const now = nowIso();
    const motivo = acao === 'cancelar' ? requireText(body.motivo, 'motivo', 500) : null;
    const statements = [
      prepared(
        `UPDATE atendimentos_clinicos SET status = ?, ${transition.timestamp} = ?,
          cancelado_por_id = CASE WHEN ? = 'cancelar' THEN ? ELSE cancelado_por_id END,
          motivo_cancelamento = CASE WHEN ? = 'cancelar' THEN ? ELSE motivo_cancelamento END,
          updated_at = ? WHERE id = ?`,
        [transition.to, now, acao, context.user.sub, acao, motivo, now, id],
      ),
    ];
    if (acao === 'finalizar' && atendimento.agenda_compromisso_id) {
      statements.push(prepared(
        "UPDATE agenda_compromissos SET status = 'realizado', updated_at = ? WHERE id = ? AND status = 'agendado'",
        [now, atendimento.agenda_compromisso_id],
      ));
    }
    statements.push(domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: atendimento.cliente_id,
      entityType: 'atendimento_clinico',
      entityId: id,
      eventType: `atendimento_${transition.to}`,
      actorId: context.user.sub,
      data: motivo ? { motivo } : {},
    }));
    await getDb().batch(statements);
    return NextResponse.json({ id, status: transition.to });
  },
);
