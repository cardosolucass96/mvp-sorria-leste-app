import 'server-only';
import { queryOne } from '@/lib/db';
import { existeSchemaCredito } from './credito-config';

// O vínculo com a alocação exata impede que um estorno antigo desconte pagamentos novos.
export const coberturaItemSql = `(COALESCE((SELECT SUM(ROUND(pa.valor_alocado*100))
  FROM pagamentos_alocacoes pa JOIN pagamentos p ON p.id=pa.pagamento_id
  WHERE pa.item_atendimento_id=itens_atendimento.id AND p.cancelado=0
    AND NOT EXISTS(SELECT 1 FROM financeiro_liberacoes l WHERE l.alocacao_id=pa.id)),0)
  +COALESCE((SELECT SUM(c.valor_centavos) FROM financeiro_coberturas c
    WHERE c.item_id=itens_atendimento.id AND c.liberada=0),0))/100.0`;

export async function coberturaRastreada(itemId: number, etapaId?: number): Promise<number | null> {
  if (!await existeSchemaCredito() || !await queryOne('SELECT item_id FROM financeiro_itens WHERE item_id=?', [itemId])) return null;
  const row = await queryOne<{ valor: number }>(`SELECT (
    COALESCE((SELECT SUM(ROUND(pa.valor_alocado*100)) FROM pagamentos_alocacoes pa
      JOIN pagamentos p ON p.id=pa.pagamento_id WHERE pa.item_atendimento_id=? AND p.cancelado=0
      AND NOT EXISTS(SELECT 1 FROM financeiro_liberacoes l WHERE l.alocacao_id=pa.id)
      ${etapaId === undefined ? '' : 'AND pa.etapa_modelo_id=?'}),0)
    +COALESCE((SELECT SUM(valor_centavos) FROM financeiro_coberturas WHERE item_id=? AND liberada=0
      ${etapaId === undefined ? '' : 'AND etapa_modelo_id=?'}),0))/100.0 valor`,
    etapaId === undefined ? [itemId, itemId] : [itemId, etapaId, itemId, etapaId]);
  return row?.valor ?? 0;
}

export function comandosRecalcularCredito(itemId: number) {
  const coberturaAgenda = coberturaItemSql.replaceAll('itens_atendimento.id', 'agendamentos.item_atendimento_origem_id')
    .replace('AND p.cancelado=0', 'AND p.cancelado=0 AND (agendamentos.etapa_modelo_id IS NULL OR pa.etapa_modelo_id=agendamentos.etapa_modelo_id)')
    .replace('AND c.liberada=0', 'AND c.liberada=0 AND (agendamentos.etapa_modelo_id IS NULL OR c.etapa_modelo_id=agendamentos.etapa_modelo_id)');
  return [
    { sql: `UPDATE itens_atendimento SET valor_pago=${coberturaItemSql},
      status=CASE WHEN status IN ('executando','concluido') THEN status
      WHEN ${coberturaItemSql} >= COALESCE(valor_final,valor) AND COALESCE(valor_final,valor)>0 THEN 'pago' ELSE 'pendente' END WHERE id=?`, params: [itemId] },
    { sql: `UPDATE agendamentos SET valor_pago=${coberturaAgenda},
      pago=CASE WHEN valor>0 AND ${coberturaAgenda}>=valor THEN 1 ELSE 0 END WHERE item_atendimento_origem_id=?`, params: [itemId] },
  ];
}

export async function itemTemCoberturaRastreada(itemId: number) {
  return await existeSchemaCredito() && !!await queryOne('SELECT item_id FROM financeiro_itens WHERE item_id=?', [itemId]);
}
