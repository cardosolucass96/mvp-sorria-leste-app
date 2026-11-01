import 'server-only';
import { execute, query, queryOne } from '@/lib/db';

export function buscarAtendimentoCancelamento(id: number) {
  return queryOne<{ id: number; unidade_id: number }>('SELECT id, unidade_id FROM atendimentos WHERE id = ?', [id]);
}

export function buscarPagamentoCancelamento(atendimentoId: number, pagamentoId: number) {
  return queryOne<{ id: number; atendimento_id: number; pagamento_grupo_id: number | null; valor: number; cancelado: number }>(
    `SELECT id, atendimento_id, pagamento_grupo_id, valor, cancelado
     FROM pagamentos
     WHERE id = ? AND atendimento_id = ?`, [pagamentoId, atendimentoId]);
}

export function buscarPagamentosDoGrupo(grupoId: number) {
  return query<{ id: number; cancelado: number }>('SELECT id, cancelado FROM pagamentos WHERE pagamento_grupo_id = ?', [grupoId]);
}

export async function marcarGrupoCancelado(grupoId: number, motivo: string) {
  await execute('UPDATE pagamentos_grupos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?', [motivo, grupoId]);
  await execute('UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE pagamento_grupo_id = ?', [motivo, grupoId]);
}

export function marcarPagamentoCancelado(id: number, motivo: string) {
  return execute('UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?', [motivo, id]);
}

export function buscarAlocacoesCancelamento(ids: number[]) {
  return ids.length > 0 ? query<{ id: number; item_atendimento_id: number | null; agendamento_id: number | null }>(
    `SELECT id, item_atendimento_id, agendamento_id
     FROM pagamentos_alocacoes
     WHERE pagamento_id IN (${ids.map(() => '?').join(',')})`, ids) : Promise.resolve([]);
}
