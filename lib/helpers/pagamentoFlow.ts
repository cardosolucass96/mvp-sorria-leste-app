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

interface EtapaModeloRow {
  id: number;
  nome: string;
  valor: number | null;
}

interface SomaRow {
  total: number | null;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

export async function buscarEtapasComValor(item: {
  procedimento_id: number;
  etapas_valores: string | null;
  valor?: number | null;
  valor_final?: number | null;
}) {
  const etapas = await query<EtapaModeloRow>(
    'SELECT id, nome, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
    [item.procedimento_id]
  );
  const overrides = parseEtapasValores(item.etapas_valores);
  const etapasComValor = etapas.map((etapa) => ({
    ...etapa,
    valor: Number(overrides[String(etapa.id)] ?? etapa.valor ?? 0),
  }));

  return ajustarEtapasAoValorDoItem(etapasComValor, item.valor_final ?? item.valor);
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
  const valorBase = roundMoney(item.valor_final ?? item.valor);
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
  const agendamento = await queryOne<{ id: number; valor: number | null }>(
    'SELECT id, valor FROM agendamentos WHERE id = ?',
    [agendamentoId]
  );
  if (!agendamento) return;

  const valorPago = await somarAlocacoesAtivasPorAgendamento(agendamentoId);
  const valorTotal = roundMoney(agendamento.valor ?? 0);
  await execute(
    `UPDATE agendamentos
     SET valor_pago = ?, pago = ?
     WHERE id = ?`,
    [valorPago, valorTotal > 0 && valorPago >= valorTotal ? 1 : 0, agendamentoId]
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
