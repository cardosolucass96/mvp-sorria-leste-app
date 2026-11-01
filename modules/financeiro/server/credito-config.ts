import 'server-only';
import { queryOne } from '@/lib/db';

export async function existeSchemaCredito() {
  const row = await queryOne<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='financeiro_configuracao'");
  return row?.name === 'financeiro_configuracao';
}

// Uma conta já migrada nunca volta ao escritor antigo, mesmo com a unidade desligada.
export async function usarCreditoRastreavel(clienteId: number, unidadeId?: number) {
  if (!await existeSchemaCredito()) return false;
  if (await queryOne('SELECT cliente_id FROM financeiro_contas WHERE cliente_id=?', [clienteId])) return true;
  const flag = await queryOne<{ ativo: number }>(`SELECT 1 ativo FROM financeiro_configuracao
    WHERE creditos_rastreaveis=1 ${unidadeId === undefined ? '' : 'AND unidade_id=?'} LIMIT 1`, unidadeId === undefined ? [] : [unidadeId]);
  return flag?.ativo === 1;
}

export async function atendimentoTemCreditoRastreado(atendimentoId: number) {
  if (!await existeSchemaCredito()) return false;
  return !!await queryOne(`SELECT f.item_id FROM financeiro_itens f
    JOIN itens_atendimento i ON i.id=f.item_id WHERE i.atendimento_id=? LIMIT 1`, [atendimentoId]);
}
