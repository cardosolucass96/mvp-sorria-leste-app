import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/middleware';
import { V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, requireScopedEntity, withV2, type V2Context } from '../../../_shared';

interface BudgetRow {
  id: string;
  cliente_id: number;
  avaliador_id: number;
  status: string;
}

export const POST = withV2(['admin', 'avaliador'], async (_request: NextRequest, context: V2Context) => {
  const { id } = (await context.params) as { id: string };
  const budget = await requireScopedEntity<BudgetRow>('orcamentos', id, context.unidadeId);
  if (!getUserRoles(context.user).includes('admin') && budget.avaliador_id !== context.user.sub) {
    throw new V2DomainError('Somente o avaliador responsável pode apresentar este orçamento.', 403, 'avaliador_nao_responsavel');
  }
  if (budget.status !== 'rascunho') {
    throw new V2DomainError('Somente orçamentos em rascunho podem ser apresentados.', 409, 'orcamento_nao_apresentavel');
  }
  const count = await queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM procedimentos_cliente WHERE orcamento_id = ?', [id]);
  if ((count?.total ?? 0) === 0) {
    throw new V2DomainError('Adicione ao menos um procedimento antes de apresentar o orçamento.', 409, 'orcamento_vazio');
  }
  const now = nowIso();
  await getDb().batch([
    prepared("UPDATE orcamentos SET status = 'apresentado', apresentado_em = ?, updated_at = ? WHERE id = ?", [now, now, id]),
    domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: budget.cliente_id,
      entityType: 'orcamento',
      entityId: id,
      eventType: 'orcamento_apresentado',
      actorId: context.user.sub,
      data: { procedimentos: count?.total ?? 0 },
    }),
  ]);
  return NextResponse.json({ id, status: 'apresentado', apresentado_em: now });
});
