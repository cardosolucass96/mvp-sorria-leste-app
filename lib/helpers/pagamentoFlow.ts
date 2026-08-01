import { execute, query, queryOne } from '@/lib/db';

interface ItemFinanceiroRow {
  id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  status: string;
  procedimento_id: number;
  etapas_valores: string | null;
}

export interface EtapaModeloFinanceiro {
  id: number;
  nome: string;
  valor: number | null;
}

interface ItemComValorEfetivo {
  valor?: number | null;
  valor_final?: number | null;
}

interface AgendamentoComValorEfetivo {
  valor: number | null;
  valor_pago?: number | null;
  procedimento_valor: number | null;
  etapa_modelo_id?: number | null;
  etapas_modelo?: Array<{ id: number; valor: number | null }>;
}

interface SomaRow {
  total: number | null;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function obterValorEfetivoItem(item: ItemComValorEfetivo): number {
  const valor = Number(item.valor_final ?? item.valor ?? 0);
  return roundMoney(Number.isFinite(valor) ? Math.max(0, valor) : 0);
}

export function parseEtapasValores(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function ajustarEtapasAoValorDoItem<T extends { valor: number }>(
  etapas: T[],
  valorItem?: number | null
): T[] {
  if (etapas.length === 0) return [];

  const valoresAtuais = etapas.map((etapa) => ({
    ...etapa,
    valor: Math.max(0, Number(etapa.valor) || 0),
  }));
  const totalDesejado = Number(valorItem);

  if (valorItem == null || !Number.isFinite(totalDesejado) || totalDesejado < 0) {
    return valoresAtuais.map((etapa) => ({ ...etapa, valor: roundMoney(etapa.valor) }));
  }

  const totalEmCentavos = Math.round((totalDesejado + Number.EPSILON) * 100);
  const somaAtual = valoresAtuais.reduce((sum, etapa) => sum + etapa.valor, 0);
  const pesos = somaAtual > 0
    ? valoresAtuais.map((etapa) => etapa.valor / somaAtual)
    : valoresAtuais.map(() => 1 / valoresAtuais.length);
  let centavosRestantes = totalEmCentavos;

  return valoresAtuais.map((etapa, index) => {
    const valorEmCentavos = index === valoresAtuais.length - 1
      ? centavosRestantes
      : Math.max(0, Math.min(
          centavosRestantes,
          Math.round(pesos[index] * totalEmCentavos)
        ));
    centavosRestantes -= valorEmCentavos;

    return {
      ...etapa,
      valor: valorEmCentavos / 100,
    };
  });
}

export function obterValorEfetivoAgendamento({
  valor,
  valor_pago,
  procedimento_valor,
  etapa_modelo_id,
  etapas_modelo = [],
}: AgendamentoComValorEfetivo): number {
  const valorProcedimento = roundMoney(Math.max(0, Number(procedimento_valor) || 0));
  const valorSalvoNumero = Number(valor);
  const valorSalvo = valor != null && Number.isFinite(valorSalvoNumero)
    ? roundMoney(Math.max(0, valorSalvoNumero))
    : null;
  const valorPago = roundMoney(Math.max(0, Number(valor_pago) || 0));

  if (!etapa_modelo_id || etapas_modelo.length === 0) {
    return Math.max(valorSalvo ?? valorProcedimento, valorPago);
  }

  const etapasNormalizadas = ajustarEtapasAoValorDoItem(
    etapas_modelo.map((etapa) => ({
      ...etapa,
      valor: Math.max(0, Number(etapa.valor) || 0),
    })),
    valorProcedimento
  );
  const etapaOriginal = etapas_modelo.find((etapa) => etapa.id === etapa_modelo_id);
  const etapaNormalizada = etapasNormalizadas.find((etapa) => etapa.id === etapa_modelo_id);

  if (!etapaNormalizada) {
    return Math.max(valorSalvo ?? valorProcedimento, valorPago);
  }

  const valorEtapaNormalizado = roundMoney(etapaNormalizada.valor);
  const valorEtapaOriginal = etapaOriginal?.valor == null
    ? null
    : roundMoney(Math.max(0, Number(etapaOriginal.valor) || 0));
  const somaPesos = etapas_modelo.reduce((sum, etapa) => sum + Math.max(0, Number(etapa.valor) || 0), 0);
  const pareceRateioLegadoExplicito = valorSalvo != null
    && valorEtapaOriginal != null
    && Math.abs(valorSalvo - valorEtapaOriginal) < 0.005
    && Math.abs(valorEtapaNormalizado - valorEtapaOriginal) >= 0.005;
  const pareceRateioLegadoSemPesos = valorSalvo != null
    && somaPesos === 0
    && etapas_modelo.length > 1
    && Math.abs(valorSalvo - valorProcedimento) < 0.005
    && Math.abs(valorEtapaNormalizado - valorSalvo) >= 0.005;
  const valorBase = valorSalvo == null || pareceRateioLegadoExplicito || pareceRateioLegadoSemPesos
    ? valorEtapaNormalizado
    : valorSalvo;

  return Math.max(valorBase, valorPago);
}

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
