/**
 * Funções de validação — usadas em formulários e API.
 */

/** Valida CPF (11 dígitos + dígitos verificadores) */
export function validarCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  // Rejeita CPFs com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // Validação dos dígitos verificadores
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) {
      sum += parseInt(digits[i]) * (t + 1 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (remainder !== parseInt(digits[t])) return false;
  }

  return true;
}

/** Valida formato de email */
export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Valida telefone (10-11 dígitos) */
export function validarTelefone(telefone: string): boolean {
  const digits = telefone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

/** Valida que string não está vazia (após trim) */
export function validarObrigatorio(valor: string): boolean {
  return valor.trim().length > 0;
}

/** Valida valor monetário > 0 */
export function validarValor(valor: number): boolean {
  return typeof valor === 'number' && valor > 0 && isFinite(valor);
}
