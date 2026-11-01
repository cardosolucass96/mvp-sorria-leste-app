export function criarChavesOperacao() {
  const chaves = new Map<string, string>();
  return {
    obter(rota: string, body: string) {
      const request = `${rota}:${body}`;
      if (!chaves.has(request)) chaves.set(request, crypto.randomUUID());
      return chaves.get(request)!;
    },
    concluir(rota: string, body: string) { chaves.delete(`${rota}:${body}`); },
  };
}
