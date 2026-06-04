import type { FollowupStatus } from '@/lib/types';
import type { FollowupUrgencia } from '@/lib/constants/followup';

export type FollowupBucket = 'atrasadas' | 'hoje' | 'proximos_7_dias' | 'depois' | 'concluidas';

export function parseFollowupDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFollowupUrgencia(
  task: { status: FollowupStatus; vencimento_em: string },
  now: Date = new Date()
): FollowupUrgencia {
  if (task.status === 'concluida') return 'concluida';
  const vencimento = parseFollowupDateTime(task.vencimento_em);
  if (!vencimento) return 'futura';
  if (vencimento.getTime() < now.getTime()) return 'atrasada';
  if (isSameLocalDay(vencimento, now)) return 'hoje';
  return 'futura';
}

export function getFollowupBucket(
  task: { status: FollowupStatus; vencimento_em: string },
  now: Date = new Date()
): FollowupBucket {
  if (task.status === 'concluida') return 'concluidas';

  const vencimento = parseFollowupDateTime(task.vencimento_em);
  if (!vencimento) return 'depois';
  if (vencimento.getTime() < now.getTime()) return 'atrasadas';
  if (isSameLocalDay(vencimento, now)) return 'hoje';

  const limite = new Date(now);
  limite.setDate(limite.getDate() + 7);
  if (vencimento.getTime() <= limite.getTime()) return 'proximos_7_dias';
  return 'depois';
}
