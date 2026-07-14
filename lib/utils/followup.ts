import type { FollowupStatus } from '@/lib/types';
import type { FollowupUrgencia } from '@/lib/constants/followup';
import {
  addDaysToClinicDateKey,
  getClinicDateKey,
  parseStoredUtcInstant,
} from '@/lib/time';

export type FollowupBucket = 'atrasadas' | 'hoje' | 'proximos_7_dias' | 'depois' | 'concluidas';

export function parseFollowupDateTime(value: string | null | undefined): Date | null {
  return parseStoredUtcInstant(value);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return getClinicDateKey(a) === getClinicDateKey(b);
}

export function formatLocalDateKey(date: Date): string {
  return getClinicDateKey(date);
}

export function getFollowupDateKey(value: string | null | undefined): string | null {
  const parsed = parseFollowupDateTime(value);
  return parsed ? formatLocalDateKey(parsed) : null;
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

  const limite = addDaysToClinicDateKey(formatLocalDateKey(now), 7);
  if (formatLocalDateKey(vencimento) <= limite) return 'proximos_7_dias';
  return 'depois';
}
