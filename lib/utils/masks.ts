/**
 * Máscaras para inputs — aplicadas em tempo real enquanto o usuário digita.
 */

/** Aplica máscara de CPF: 123.456.789-00 */
export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** Aplica máscara de telefone: (11) 91234-5678 */
export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.replace(/(\d{0,2})/, '($1');
  if (digits.length <= 6) return digits.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  if (digits.length <= 10)
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** Aplica máscara de moeda: R$ 1.234,56 */
export function maskMoeda(value: string): string {
  // Remove tudo que não é dígito
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';

  // Converte para centavos
  const centavos = parseInt(digits, 10);
  const reais = (centavos / 100).toFixed(2);

  // Formata
  const [inteira, decimal] = reais.split('.');
  const inteiraFormatada = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${inteiraFormatada},${decimal}`;
}

/** Remove máscara, retornando apenas dígitos */
export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

/** Remove máscara de moeda, retornando número */
export function unmaskMoeda(value: string): number {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}
