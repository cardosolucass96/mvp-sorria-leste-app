import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { optionalText, requireText, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, readJsonObject, withV2, type V2Context } from '../../../_shared';

interface ProcedureRow {
  id: string;
  cliente_id: number;
  orcamento_id: string | null;
  status_comercial: string;
  origem: string;
}

export const POST = withV2(
  ['admin', 'atendente', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const body = await readJsonObject(request);
    const decisao = requireText(body.decisao, 'decisao', 20);
    if (!['aceitar', 'recusar', 'cancelar'].includes(decisao)) {
      throw new V2DomainError('decisao deve ser aceitar, recusar ou cancelar.');
    }
    const current = await queryOne<ProcedureRow>(
      'SELECT id, cliente_id, orcamento_id, status_comercial, origem FROM procedimentos_cliente WHERE id = ? AND unidade_id = ?',
      [id, context.unidadeId],
    );
    if (!current) throw new V2DomainError('Procedimento não encontrado.', 404, 'procedimento_nao_encontrado');
    if (current.status_comercial !== 'proposto') {
      throw new V2DomainError('Somente procedimentos propostos podem receber uma decisão.', 409, 'decisao_ja_registrada');
    }

    const now = nowIso();
    const statements = [];
    let nextStatus: string;
    if (decisao === 'aceitar') {
      nextStatus = 'aceito';
      statements.push(prepared(
        `UPDATE procedimentos_cliente
         SET status_comercial = 'aceito', aceite_tipo = 'orcamento', aceito_por_id = ?, aceito_em = ?, updated_at = ?
         WHERE id = ?`,
        [context.user.sub, now, now, id],
      ));
    } else if (decisao === 'recusar') {
      const motivo = requireText(body.motivo, 'motivo', 500);
      nextStatus = 'recusado';
      statements.push(prepared(
        `UPDATE procedimentos_cliente
         SET status_comercial = 'recusado', recusado_por_id = ?, recusado_em = ?, motivo_recusa = ?, updated_at = ?
         WHERE id = ?`,
        [context.user.sub, now, motivo, now, id],
      ));
    } else {
      const motivo = requireText(body.motivo, 'motivo', 500);
      nextStatus = 'cancelado';
      statements.push(prepared(
        `UPDATE procedimentos_cliente
         SET status_comercial = 'cancelado', status_clinico = CASE WHEN status_clinico = 'nao_iniciado' THEN 'cancelado' ELSE status_clinico END,
             cancelado_por_id = ?, cancelado_em = ?, motivo_cancelamento = ?, updated_at = ?
         WHERE id = ?`,
        [context.user.sub, now, motivo, now, id],
      ));
    }

    if (current.orcamento_id) {
      const siblingRows = await query<{ status_comercial: string }>(
        'SELECT status_comercial FROM procedimentos_cliente WHERE orcamento_id = ? AND id <> ?',
        [current.orcamento_id, id],
      );
      const statuses = [...siblingRows.map((row) => row.status_comercial), nextStatus];
      const active = statuses.filter((status) => status !== 'cancelado');
      const budgetStatus = active.length === 0
        ? 'cancelado'
        : active.every((status) => status === 'aceito')
          ? 'aceito'
          : active.every((status) => status === 'recusado')
            ? 'recusado'
            : active.some((status) => status === 'aceito')
              ? 'parcialmente_aceito'
              : 'apresentado';
      statements.push(prepared('UPDATE orcamentos SET status = ?, updated_at = ? WHERE id = ?', [budgetStatus, now, current.orcamento_id]));
    }

    statements.push(domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: current.cliente_id,
      entityType: 'procedimento_cliente',
      entityId: id,
      eventType: `procedimento_${nextStatus}`,
      actorId: context.user.sub,
      data: { motivo: optionalText(body.motivo, 'motivo', 500) },
    }));
    await getDb().batch(statements);
    return NextResponse.json({ id, status_comercial: nextStatus });
  },
);
