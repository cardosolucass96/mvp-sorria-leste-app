import { NextRequest, NextResponse } from 'next/server';
import { getDb, queryOne } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/middleware';
import { assertEvaluationCanFinish, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, readJsonObject, requireScopedEntity, withV2, type V2Context } from '../../../_shared';

interface EvaluationRow {
  id: string;
  cliente_id: number;
  avaliador_id: number;
  status: string;
}

export const POST = withV2(['admin', 'avaliador'], async (request: NextRequest, context: V2Context) => {
  const { id } = (await context.params) as { id: string };
  const evaluation = await requireScopedEntity<EvaluationRow>('avaliacoes', id, context.unidadeId);
  if (evaluation.status !== 'em_andamento') {
    throw new V2DomainError('A avaliação já foi encerrada.', 409, 'avaliacao_encerrada');
  }
  if (!getUserRoles(context.user).includes('admin') && evaluation.avaliador_id !== context.user.sub) {
    throw new V2DomainError('Somente o avaliador responsável pode concluir esta avaliação.', 403, 'avaliador_nao_responsavel');
  }
  const body = await readJsonObject(request);
  const count = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM procedimentos_cliente WHERE avaliacao_id = ? AND status_comercial <> ?',
    [id, 'cancelado'],
  );
  const motivo = assertEvaluationCanFinish((count?.total ?? 0) > 0, body.motivo_sem_orcamento);
  const now = nowIso();
  await getDb().batch([
    prepared(
      "UPDATE avaliacoes SET status = 'concluida', motivo_sem_orcamento = ?, concluida_em = ?, updated_at = ? WHERE id = ?",
      [motivo, now, now, id],
    ),
    domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: evaluation.cliente_id,
      entityType: 'avaliacao',
      entityId: id,
      eventType: 'avaliacao_concluida',
      actorId: context.user.sub,
      data: { procedimentosPropostos: count?.total ?? 0, motivoSemOrcamento: motivo },
    }),
  ]);
  return NextResponse.json({ id, status: 'concluida', motivo_sem_orcamento: motivo });
});
