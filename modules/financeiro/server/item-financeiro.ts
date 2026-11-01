import 'server-only';
import { batch, execute, query, queryOne } from '@/lib/db';
import { coberturaRastreada, comandosRecalcularCredito, itemTemCoberturaRastreada } from './credito-cobertura';
import type { EtapaModeloFinanceiro } from '../contracts';
import { ajustarEtapasAoValorDoItem, obterValorEfetivoItem, obterValorEfetivoAgendamento, parseEtapasValores, roundMoney } from '../public';

interface ItemFinanceiroRow {
  id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  status: string;
  procedimento_id: number;
  etapas_valores: string | null;
}

interface SomaRow { total: number | null; }

export async function buscarEtapasComValor(item: {
  procedimento_id: number;
  etapas_valores: string | null;
  valor?: number | null;
  valor_final?: number | null;
}) {
  const etapas = await buscarEtapasModelo(item.procedimento_id);
  const overrides = parseEtapasValores(item.etapas_valores);
  const etapasComValor = etapas.map((etapa) => ({
    ...etapa,
    valor: Number(overrides[String(etapa.id)] ?? etapa.valor ?? 0),
  }));

  return ajustarEtapasAoValorDoItem(etapasComValor, obterValorEfetivoItem(item));
}

export async function buscarEtapasModelo(procedimentoId: number): Promise<EtapaModeloFinanceiro[]> {
  return query<EtapaModeloFinanceiro>(
    'SELECT id, nome, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
    [procedimentoId]
  );
}

export async function somarAlocacoesAtivasPorItem(itemId: number): Promise<number> {
  const credito = await coberturaRastreada(itemId);
  if (credito !== null) return credito;
  const result = await queryOne<SomaRow>(
    `SELECT COALESCE(SUM(pa.valor_alocado), 0) as total
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos p ON p.id = pa.pagamento_id
     WHERE pa.item_atendimento_id = ? AND p.cancelado = 0`,
    [itemId]
  );
  return roundMoney(result?.total ?? 0);
}

export async function somarAlocacoesAtivasPorAgendamento(agendamentoId: number): Promise<number> {
  const result = await queryOne<SomaRow>(
    `SELECT COALESCE(SUM(pa.valor_alocado), 0) as total
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos p ON p.id = pa.pagamento_id
     WHERE pa.agendamento_id = ? AND p.cancelado = 0`,
    [agendamentoId]
  );
  return roundMoney(result?.total ?? 0);
}

export async function somarAlocacoesAtivasDaEtapa(itemId: number, etapaModeloId: number): Promise<number> {
  const credito = await coberturaRastreada(itemId, etapaModeloId);
  if (credito !== null) return credito;
  const result = await queryOne<SomaRow>(
    `SELECT COALESCE(SUM(pa.valor_alocado), 0) as total
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos p ON p.id = pa.pagamento_id
     WHERE pa.item_atendimento_id = ? AND pa.etapa_modelo_id = ? AND p.cancelado = 0`,
    [itemId, etapaModeloId]
  );
  return roundMoney(result?.total ?? 0);
}

export async function recalcularFinanceiroItem(itemId: number): Promise<void> {
  if (await itemTemCoberturaRastreada(itemId)) {
    await batch(comandosRecalcularCredito(itemId));
    return;
  }
  const item = await queryOne<ItemFinanceiroRow>(
    `SELECT id, valor, valor_final, valor_pago, status, procedimento_id, etapas_valores
     FROM itens_atendimento
     WHERE id = ?`,
    [itemId]
  );

  if (!item) return;

  const valorPago = await somarAlocacoesAtivasPorItem(itemId);
  const valorBase = obterValorEfetivoItem(item);
  const statusFinanceiro = valorPago >= valorBase && valorBase > 0 ? 'pago' : 'pendente';
  const statusFinal = ['executando', 'concluido'].includes(item.status) ? item.status : statusFinanceiro;

  await execute(
    `UPDATE itens_atendimento
     SET valor_pago = ?, status = ?
     WHERE id = ?`,
    [valorPago, statusFinal, itemId]
  );
}

export async function recalcularFinanceiroAgendamento(agendamentoId: number): Promise<void> {
  const agendamento = await queryOne<{
    id: number;
    valor: number | null;
    procedimento_id: number | null;
    etapa_modelo_id: number | null;
    procedimento_valor: number | null;
  }>(
    `SELECT
       ag.id,
       ag.valor,
       ag.procedimento_id,
       ag.etapa_modelo_id,
       p.valor as procedimento_valor
     FROM agendamentos ag
     LEFT JOIN procedimentos p ON p.id = ag.procedimento_id
     WHERE ag.id = ?`,
    [agendamentoId]
  );
  if (!agendamento) return;

  const valorPago = await somarAlocacoesAtivasPorAgendamento(agendamentoId);
  const etapasModelo = agendamento.procedimento_id && agendamento.etapa_modelo_id
    ? await buscarEtapasModelo(agendamento.procedimento_id)
    : [];
  const valorTotal = obterValorEfetivoAgendamento({
    valor: agendamento.valor,
    valor_pago: valorPago,
    procedimento_valor: agendamento.procedimento_valor,
    etapa_modelo_id: agendamento.etapa_modelo_id,
    etapas_modelo: etapasModelo,
  });
  await execute(
    `UPDATE agendamentos
     SET valor = ?, valor_pago = ?, pago = ?
     WHERE id = ?`,
    [valorTotal, valorPago, valorTotal > 0 && valorPago >= valorTotal ? 1 : 0, agendamentoId]
  );
}

export async function recalcularFinanceiroItens(itemIds: number[]): Promise<void> {
  for (const itemId of [...new Set(itemIds)]) {
    await recalcularFinanceiroItem(itemId);
  }
}

export async function recalcularFinanceiroAgendamentos(agendamentoIds: number[]): Promise<void> {
  for (const agendamentoId of [...new Set(agendamentoIds)]) {
    await recalcularFinanceiroAgendamento(agendamentoId);
  }
}
