import { roundMoney } from '@/shared/money';

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
