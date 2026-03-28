/**
 * Utilitários de formatação — fonte única de verdade.
 * Substitui as 11+ cópias espalhadas pelas páginas.
 */

/** Formata número como moeda brasileira (R$ 1.234,56) */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Converte string de data do SQLite para objeto Date tratando como horário local.
 * SQLite retorna "YYYY-MM-DD HH:MM:SS" (sem fuso) ou "YYYY-MM-DD".
 * new Date("YYYY-MM-DD") interpreta como UTC, causando bug de dia errado no Brasil (UTC-3).
 */
function parseSqliteDate(data: string | null | undefined): Date | null {
  if (!data) return null;
  const s = data.trim();
  // Só data "YYYY-MM-DD" → adiciona T00:00:00 para forçar horário local
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
  // Datetime "YYYY-MM-DD HH:MM:SS" → substitui espaço por T (sem Z = horário local)
  return new Date(s.replace(' ', 'T'));
}

/** Formata data como dd/mm/aaaa */
export function formatarData(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formata data como dd/mm/aaaa HH:mm */
export function formatarDataHora(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formata data completa com segundos (para logs/prontuário) */
export function formatarDataCompleta(data: string | null | undefined): string {
  const d = parseSqliteDate(data);
  if (!d || isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
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
