import { roundMoney } from '@/shared/money';

export function isSaldoId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isSaldoBody(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizarValorSaldo(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const cents = Math.round((value + Number.EPSILON) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? roundMoney(value) : null;
}

export function observacoesSaldoValidas(value: unknown): boolean {
  return value == null || typeof value === 'string';
}
