import 'server-only';
import { query, queryOne } from '@/lib/db';
import { CreditoErro, transacionarCredito } from './credito-transacao';

export function cancelarComCredito(clienteId: number, unidadeId: number, atendimentoId: number, pagamentoId: number, motivo: string, chave?: string, rastrear = true) {
  return transacionarCredito(clienteId, 'cancelamento_pagamento', { unidadeId, atendimentoId, pagamentoId, motivo }, chave, async tx => {
    if (rastrear) await tx.conta(clienteId);
    const pagamento = await queryOne<{ pagamento_grupo_id: number | null; cancelado: number }>(`SELECT p.pagamento_grupo_id,p.cancelado FROM pagamentos p JOIN atendimentos a ON a.id=p.atendimento_id
      WHERE p.id=? AND a.id=? AND a.cliente_id=? AND a.unidade_id=?`, [pagamentoId, atendimentoId, clienteId, unidadeId]);
    if (!pagamento) throw new CreditoErro('Pagamento não encontrado', 404);
    if (pagamento.cancelado) throw new CreditoErro('Pagamento já está cancelado', 400);
    const ids = pagamento.pagamento_grupo_id ? (await query<{ id: number }>('SELECT id FROM pagamentos WHERE pagamento_grupo_id=?', [pagamento.pagamento_grupo_id])).map(p=>p.id) : [pagamentoId];
    const marks = ids.map(()=>'?').join(',');
    const alocacoes = await query<{ id: number; item_atendimento_id: number | null; agendamento_id: number | null }>(`SELECT id,item_atendimento_id,agendamento_id FROM pagamentos_alocacoes WHERE pagamento_id IN (${marks})`, ids);
    const legado = await queryOne(`SELECT m.id FROM movimentacoes_saldo m WHERE
      (m.pagamento_id IN (${marks}) OR (m.tipo='estorno' AND m.item_atendimento_id IN
        (SELECT item_atendimento_id FROM pagamentos_alocacoes WHERE pagamento_id IN (${marks}))))
      AND NOT EXISTS(SELECT 1 FROM financeiro_creditos c WHERE c.movimento_id=m.id) LIMIT 1`, [...ids, ...ids]);
    if (legado) throw new CreditoErro('Existe crédito legado sem origem conciliada; regularize antes de cancelar o pagamento');
    const usado = await queryOne(`SELECT u.id FROM financeiro_consumos u JOIN financeiro_creditos c ON c.id=u.credito_id
      WHERE c.pagamento_origem_id IN (${marks}) AND u.tipo!='cancelamento' LIMIT 1`, ids);
    if (usado) throw new CreditoErro('O crédito deste pagamento já foi usado, transferido ou devolvido; não é possível cancelar');
    const creditos = await query<{ id: string; cliente_id: number; pagamento_origem_id: number; valor_centavos: number }>(`SELECT id,cliente_id,pagamento_origem_id,valor_centavos FROM financeiro_creditos WHERE pagamento_origem_id IN (${marks})`, ids);
    for (const credito of creditos) {
      await tx.conta(credito.cliente_id);
      tx.add("INSERT INTO financeiro_consumos VALUES (?,?,?,'cancelamento',?)", [crypto.randomUUID(), credito.id, credito.valor_centavos, tx.id]);
      await tx.movimento(credito.cliente_id, 'estorno', -credito.valor_centavos, { pagamentoId: credito.pagamento_origem_id, observacoes: `Reversão automática de crédito: ${motivo}` });
    }
    tx.add(`UPDATE pagamentos SET cancelado=1,motivo_cancelamento=? WHERE id IN (${marks})`, [motivo, ...ids]);
    if (pagamento.pagamento_grupo_id) tx.add('UPDATE pagamentos_grupos SET cancelado=1,motivo_cancelamento=? WHERE id=?', [motivo, pagamento.pagamento_grupo_id]);
    tx.add(`DELETE FROM comissoes WHERE pagamento_alocacao_id IN (SELECT id FROM pagamentos_alocacoes WHERE pagamento_id IN (${marks}))`, ids);
    for (const itemId of new Set(alocacoes.map(a=>a.item_atendimento_id).filter((id): id is number=>id !== null))) tx.recalcular(itemId, rastrear);
    for (const agId of new Set(alocacoes.map(a=>a.agendamento_id).filter((id): id is number=>id !== null))) {
      const sum = `COALESCE((SELECT SUM(pa.valor_alocado) FROM pagamentos_alocacoes pa JOIN pagamentos p ON p.id=pa.pagamento_id
        WHERE pa.agendamento_id=agendamentos.id AND p.cancelado=0 AND NOT EXISTS(SELECT 1 FROM financeiro_liberacoes l WHERE l.alocacao_id=pa.id)),0)`;
      tx.add(`UPDATE agendamentos SET valor_pago=${sum},pago=CASE WHEN valor>0 AND ${sum}>=valor THEN 1 ELSE 0 END WHERE id=?`, [agId]);
    }
    return { body: { success: true }, status: 200 };
  });
}
