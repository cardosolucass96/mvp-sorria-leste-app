export interface ItemStatusFinanceiro {
  status: string;
  adicionado_em_execucao?: number | boolean | null;
  valor?: number | string | null;
  valor_final?: number | string | null;
  valor_pago?: number | string | null;
}

function numberOrZero(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isAcrescimoEmExecucaoACobrar(item: ItemStatusFinanceiro): boolean {
  const adicionadoEmExecucao =
    item.adicionado_em_execucao === true || Number(item.adicionado_em_execucao ?? 0) === 1;

  if (item.status !== 'pago' || !adicionadoEmExecucao) {
    return false;
  }

  const valorBase = numberOrZero(item.valor_final ?? item.valor);
  if (valorBase <= 0) {
    return false;
  }

  return numberOrZero(item.valor_pago) + 0.001 < valorBase;
}
