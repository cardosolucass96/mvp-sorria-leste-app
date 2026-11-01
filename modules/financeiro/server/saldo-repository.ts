import 'server-only';
import { existeSchemaCredito } from './credito-config';
import { query, queryOne, batch } from '@/lib/db';
import type { SaldoRow, ItemSaldo, ItemSaldoComOrigem, ItemEstorno, MovimentacaoSaldo } from '../contracts/saldo';

async function batchSaldoLegado(clientes: number[], comandos: Parameters<typeof batch>[0]) {
  if (await existeSchemaCredito()) {
    const id = crypto.randomUUID();
    comandos.unshift({
      sql: `INSERT INTO financeiro_operacoes(id,chave,assinatura,tipo,cliente_id,resposta,status,validado)
        VALUES (?,?,?,'saldo_legado',?,'{}',200,CASE WHEN NOT EXISTS
          (SELECT 1 FROM financeiro_contas WHERE cliente_id IN (${clientes.map(()=>'?').join(',')})) THEN 1 ELSE 0 END)`,
      params: [id,id,'legado',clientes[0],...clientes],
    });
  }
  try { await batch(comandos); return true; }
  catch (error) { if (/financeiro_conflito/.test(String(error))) return false; throw error; }
}

export function buscarClienteSaldo(clienteId: number | string) {
  return queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]);
}
export function buscarSaldo(clienteId: number) {
  return queryOne<SaldoRow>('SELECT saldo FROM saldo_clientes WHERE cliente_id = ?', [clienteId]);
}
export function buscarSaldoDetalhado(clienteId: number | string) {
  return queryOne<SaldoRow>('SELECT saldo, updated_at FROM saldo_clientes WHERE cliente_id = ?', [clienteId]);
}
export function buscarMovimentacoesSaldo(clienteId: number | string) {
  return query<MovimentacaoSaldo>(`SELECT * FROM movimentacoes_saldo WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 20`, [clienteId]);
}
export function buscarValorPagoDisponivel(clienteId: number | string) {
  return queryOne<{ saldo_calculado: number }>(`SELECT COALESCE(SUM(ia.valor_pago), 0) AS saldo_calculado
  FROM itens_atendimento ia JOIN atendimentos a ON a.id = ia.atendimento_id
  WHERE a.cliente_id = ? AND ia.status != 'concluido' AND ia.valor_pago > 0`, [clienteId]);
}
export function buscarItemSaldo(itemId: number, atendimentoId: number) {
  return queryOne<ItemSaldoComOrigem>(`SELECT ia.id, ia.atendimento_id, ia.valor, ia.valor_final, ia.valor_pago, ia.status,
    a.cliente_id AS atendimento_cliente_id, a.unidade_id
  FROM itens_atendimento ia JOIN atendimentos a ON a.id = ia.atendimento_id
  WHERE ia.id = ? AND ia.atendimento_id = ?`, [itemId, atendimentoId]);
}
export function buscarItemSaldoAtualizado(itemId: number) {
  return queryOne<ItemSaldo>('SELECT id, atendimento_id, COALESCE(valor_final, valor) as valor, valor_final, valor_pago, status FROM itens_atendimento WHERE id = ?', [itemId]);
}
export function buscarItemEstorno(itemId: number) {
  return queryOne<ItemEstorno>(`SELECT ia.id, ia.valor_pago, ia.status, p.nome AS procedimento_nome, a.cliente_id AS atendimento_cliente_id, a.unidade_id
  FROM itens_atendimento ia JOIN atendimentos a ON a.id = ia.atendimento_id
  JOIN procedimentos p ON p.id = ia.procedimento_id WHERE ia.id = ?`, [itemId]);
}

export function buscarPagamentoSaldo(pagamentoId: number) {
  return queryOne<{ cliente_id: number; unidade_id: number; cancelado: number }>(
  `SELECT a.cliente_id, a.unidade_id, p.cancelado FROM pagamentos p
   JOIN atendimentos a ON a.id = p.atendimento_id WHERE p.id = ?`, [pagamentoId]);
}

export async function persistirCreditarSaldo({ clienteId, valor, saldoAnterior, saldoNovo, pagamento_id, observacoes, timestamp }: { clienteId: number; valor: number; saldoAnterior: number; saldoNovo: number; pagamento_id?: number | null; observacoes?: string | null; timestamp: string; }) {
  return batchSaldoLegado([clienteId], [
    {
      sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET
              saldo = ROUND(saldo + excluded.saldo, 2),
              updated_at = ?`,
      params: [clienteId, valor, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, pagamento_id, observacoes)
            VALUES (?, 'credito', ?, ?, ?, ?, ?)`,
      params: [clienteId, valor, saldoAnterior, saldoNovo, pagamento_id ?? null, observacoes ?? null],
    },
  ]);
}

export async function persistirDebitarSaldo({ clienteId, saldoNovo, saldoAnterior, valorRestante, valorEfetivo, status, item_atendimento_id, atendimento_id, observacoes, timestamp }: { clienteId: number; saldoNovo: number; saldoAnterior: number; valorRestante: number; valorEfetivo: number; status: string; item_atendimento_id: number; atendimento_id: number; observacoes?: string | null; timestamp: string; }) {
  return batchSaldoLegado([clienteId], [
    {
      sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET
              saldo = ?, updated_at = ?`,
      params: [clienteId, saldoNovo, timestamp, saldoNovo, timestamp],
    },
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, item_atendimento_id, atendimento_id, observacoes)
            VALUES (?, 'debito', ?, ?, ?, ?, ?, ?)`,
      params: [clienteId, valorRestante, saldoAnterior, saldoNovo, item_atendimento_id, atendimento_id, observacoes ?? null],
    },
    {
      sql: `UPDATE itens_atendimento SET valor_pago = ?, status = ? WHERE id = ?`,
      params: [valorEfetivo, status, item_atendimento_id],
    },
  ]);
}

export async function persistirEstornarSaldo({ clienteId, valor, saldoAnterior, saldoNovo, observacoes, timestamp }: { clienteId: number; valor: number; saldoAnterior: number; saldoNovo: number; observacoes?: string | null; timestamp: string; }) {
  return batchSaldoLegado([clienteId], [
    {
      sql: `UPDATE saldo_clientes SET saldo = ?, updated_at = ? WHERE cliente_id = ?`,
      params: [saldoNovo, timestamp, clienteId],
    },
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, observacoes)
            VALUES (?, 'estorno', ?, ?, ?, ?)`,
      params: [clienteId, valor, saldoAnterior, saldoNovo, observacoes ?? null],
    },
  ]);
}

export async function persistirTransferirSaldo({ clienteOrigemId, cliente_destino_id, valor, saldoOrigemAnterior, saldoOrigemNovo, saldoDestinoAnterior, saldoDestinoNovo, observacoes, timestamp }: { clienteOrigemId: number; cliente_destino_id: number; valor: number; saldoOrigemAnterior: number; saldoOrigemNovo: number; saldoDestinoAnterior: number; saldoDestinoNovo: number; observacoes?: string | null; timestamp: string; }) {
  return batchSaldoLegado([clienteOrigemId, cliente_destino_id], [
    // Decrementar saldo da origem
    {
      sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET
              saldo = ?, updated_at = ?`,
      params: [clienteOrigemId, saldoOrigemNovo, timestamp, saldoOrigemNovo, timestamp],
    },
    // Incrementar saldo do destino (upsert)
    {
      sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET
              saldo = ROUND(saldo + excluded.saldo, 2),
              updated_at = ?`,
      params: [cliente_destino_id, valor, timestamp, timestamp],
    },
    // Movimentação de saída (origem)
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, cliente_destino_id, observacoes)
            VALUES (?, 'transferencia_saida', ?, ?, ?, ?, ?)`,
      params: [clienteOrigemId, valor, saldoOrigemAnterior, saldoOrigemNovo, cliente_destino_id, observacoes ?? null],
    },
    // Movimentação de entrada (destino)
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, cliente_destino_id, observacoes)
            VALUES (?, 'transferencia_entrada', ?, ?, ?, ?, ?)`,
      params: [cliente_destino_id, valor, saldoDestinoAnterior, saldoDestinoNovo, clienteOrigemId, observacoes ?? null],
    },
  ]);
}

export async function persistirEstornarProcedimento({ clienteId, item, saldoAnterior, saldoNovo, timestamp }: { clienteId: number; item: ItemEstorno; saldoAnterior: number; saldoNovo: number; timestamp: string; }) {
  return batchSaldoLegado([clienteId], [
    {
      sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cliente_id) DO UPDATE SET
              saldo = ROUND(saldo + excluded.saldo, 2),
              updated_at = ?`,
      params: [clienteId, item.valor_pago, timestamp, timestamp],
    },
    {
      sql: `INSERT INTO movimentacoes_saldo
            (cliente_id, tipo, valor, saldo_anterior, saldo_novo, item_atendimento_id, observacoes)
            VALUES (?, 'estorno', ?, ?, ?, ?, ?)`,
      params: [
        clienteId,
        item.valor_pago,
        saldoAnterior,
        saldoNovo,
        item.id,
        `Estorno: ${item.procedimento_nome}`,
      ],
    },
    {
      sql: `UPDATE itens_atendimento SET valor_pago = 0, status = 'pendente' WHERE id = ?`,
      params: [item.id],
    },
  ]);
}
