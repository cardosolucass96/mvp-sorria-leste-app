/**
 * Utilitários de formatação — fonte única de verdade.
 * Substitui as 11+ cópias espalhadas pelas páginas.
 */

/** Formata número como moeda brasileira (R$ 1.234,56) */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata data como dd/mm/aaaa */
export function formatarData(data: string): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Formata data como dd/mm/aaaa HH:mm */
export function formatarDataHora(data: string): string {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formata data completa com segundos (para logs/prontuário) */
export function formatarDataCompleta(data: string): string {
  return new Date(data).toLocaleString('pt-BR');
}

/** Formata CPF: 123.456.789-00 */
export function formatarCPF(cpf: string | null): string {
  if (!cpf) return '-';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

/** Formata telefone: (11) 91234-5678 ou (11) 1234-5678 */
export function formatarTelefone(telefone: string | null): string {
  if (!telefone) return '-';
  const digits = telefone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return telefone;
}

/** Formata porcentagem: 15% */
export function formatarPorcentagem(valor: number): string {
  return `${valor}%`;
}

/** Retorna iniciais do nome (para avatar): "Lucas Cardoso" → "LC" */
export function obterIniciais(nome: string): string {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
