export function resolverExecutorDestinoId(
  destinoExecutorId: number | null | undefined,
  executorAtualId: number | null | undefined
): number | null {
  return destinoExecutorId !== undefined ? (destinoExecutorId ?? null) : (executorAtualId ?? null);
}

export function getExecutorDestinoInicial(
  destinoStatus: string | null | undefined,
  destinoExecutorId: number | null | undefined,
  executorAtualId: number | null | undefined
): string {
  if (destinoStatus !== null && destinoStatus !== undefined) {
    return destinoExecutorId ? String(destinoExecutorId) : '';
  }

  return executorAtualId ? String(executorAtualId) : '';
}
