import { NextRequest, NextResponse } from 'next/server';
import { getDb, query } from '@/lib/db';
import { requireText, V2DomainError } from '@/lib/v2/domain';
import { domainEventStatement, getIdempotencyKey, nowIso, prepared, readJsonObject, requireScopedEntity, uuid, withV2, type V2Context } from '../../../_shared';

interface ReceiptRow {
  id: string;
  cliente_id: number;
  status: string;
  valor_total_centavos: number;
}

interface AllocationRow {
  id: string;
  procedimento_cliente_id: string;
  valor_centavos: number;
  valor_estornado_centavos: number;
}

export const POST = withV2(['admin'], async (request: NextRequest, context: V2Context) => {
  const { id } = (await context.params) as { id: string };
  const idempotencyKey = getIdempotencyKey(request)!;
  const receipt = await requireScopedEntity<ReceiptRow>('recebimentos', id, context.unidadeId);
  if (receipt.status === 'estornado') return NextResponse.json(receipt);
  const body = await readJsonObject(request);
  const motivo = requireText(body.motivo, 'motivo', 500);
  const allocations = await query<AllocationRow>('SELECT * FROM recebimento_alocacoes WHERE recebimento_id = ?', [id]);
  const now = nowIso();
  const statements = [];
  for (const allocation of allocations) {
    const active = allocation.valor_centavos - allocation.valor_estornado_centavos;
    if (active <= 0) continue;
    statements.push(
      prepared(
        `UPDATE recebimento_alocacoes SET valor_estornado_centavos = valor_centavos,
          estornado_em = ?, estornado_por_id = ?, motivo_estorno = ? WHERE id = ?`,
        [now, context.user.sub, motivo, allocation.id],
      ),
      prepared(
        `INSERT INTO cliente_saldo_movimentos (
          id, cliente_id, unidade_id, recebimento_id, procedimento_cliente_id,
          tipo, valor_centavos, criado_por_id, motivo
        ) VALUES (?, ?, ?, ?, ?, 'estorno_alocacao', ?, ?, ?)`,
        [uuid(), receipt.cliente_id, context.unidadeId, id, allocation.procedimento_cliente_id, active, context.user.sub, motivo],
      ),
      prepared(
        `INSERT INTO procedimento_cliente_followups (
          id, procedimento_cliente_id, cliente_id, unidade_id, tipo, criado_por_id, descricao
        )
        SELECT ?, p.id, p.cliente_id, p.unidade_id, 'cobranca', ?, ?
        FROM procedimentos_cliente p
        WHERE p.id = ? AND p.status_comercial = 'aceito'
          AND NOT EXISTS (
            SELECT 1 FROM procedimento_cliente_followups f
            WHERE f.procedimento_cliente_id = p.id AND f.tipo = 'cobranca' AND f.status = 'aberto'
          )`,
        [uuid(), context.user.sub, `Cobrança reaberta após estorno: ${motivo}`, allocation.procedimento_cliente_id],
      ),
    );
    const commissions = await query<{ id: string; base_centavos: number; taxa_bps: number; valor_centavos: number; usuario_id: number; tipo: string }>(
      "SELECT * FROM comissoes_v2 WHERE recebimento_alocacao_id = ? AND evento = 'credito'",
      [allocation.id],
    );
    for (const commission of commissions) {
      statements.push(prepared(
        `INSERT INTO comissoes_v2 (
          id, procedimento_cliente_id, recebimento_alocacao_id, comissao_origem_id,
          unidade_id, usuario_id, tipo, evento, base_centavos, taxa_bps,
          valor_centavos, criado_por_id, motivo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reversao', ?, ?, ?, ?, ?)`,
        [
          uuid(), allocation.procedimento_cliente_id, allocation.id, commission.id,
          context.unidadeId, commission.usuario_id, commission.tipo, commission.base_centavos,
          commission.taxa_bps, -Math.abs(commission.valor_centavos), context.user.sub, motivo,
        ],
      ));
    }
  }
  statements.push(
    prepared(
      `UPDATE recebimentos SET status = 'estornado', estornado_em = ?, estornado_por_id = ?,
        motivo_estorno = ?, updated_at = ? WHERE id = ?`,
      [now, context.user.sub, motivo, now, id],
    ),
    prepared(
      `INSERT INTO cliente_saldo_movimentos (
        id, cliente_id, unidade_id, recebimento_id, tipo, valor_centavos,
        criado_por_id, motivo, idempotency_key
      ) VALUES (?, ?, ?, ?, 'estorno_credito', ?, ?, ?, ?)`,
      [uuid(), receipt.cliente_id, context.unidadeId, id, -receipt.valor_total_centavos, context.user.sub, motivo, `estorno:${idempotencyKey}`],
    ),
    domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: receipt.cliente_id,
      entityType: 'recebimento',
      entityId: id,
      eventType: 'recebimento_estornado',
      actorId: context.user.sub,
      data: { motivo, valorCentavos: receipt.valor_total_centavos },
      idempotencyKey: `evento:estorno:${idempotencyKey}`,
    }),
  );
  if (statements.length === 0) throw new V2DomainError('Nada a estornar.', 409, 'sem_saldo_estorno');
  await getDb().batch(statements);
  return NextResponse.json({ id, status: 'estornado', estornado_em: now });
});
