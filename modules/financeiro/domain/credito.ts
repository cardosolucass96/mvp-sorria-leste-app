export const centavos = (value: number) => Math.round((value + Number.EPSILON) * 100);

export function distribuirCreditoFIFO<T extends { disponivel: number }>(lotes: T[], valor: number) {
  const partes: Array<{ lote: T; valor: number }> = [];
  let restante = valor;
  for (const lote of lotes) {
    const usado = Math.min(restante, lote.disponivel);
    if (usado <= 0) continue;
    partes.push({ lote, valor: usado });
    restante -= usado;
    if (!restante) break;
  }
  return { partes, restante };
}
