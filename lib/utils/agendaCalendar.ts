import {
  CLINIC_TIME_ZONE,
  addDaysToClinicDateKey,
  getClinicDateKey,
  getClinicTimeLabel,
  getDatePartsInTimeZone,
  isDateOnlyString,
  parseClinicLocalDateTime,
  parseStoredUtcInstant,
} from '@/lib/time';

export type AgendaCalendarView = 'mes' | 'semana';

const EXPLICIT_TIME_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseClinicDateKeyAsMidday(dateKey: string): Date {
  const parsed = parseClinicLocalDateTime(`${dateKey}T12:00:00`);
  if (!parsed) {
    throw new Error(`Data inválida para agenda: ${dateKey}`);
  }
  return parsed;
}

function getClinicWeekday(date: Date): number {
  const label = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: CLINIC_TIME_ZONE,
  }).format(date);

  return WEEKDAY_INDEX[label] ?? 0;
}

export function parseAgendaDateTime(data: string | null | undefined): Date | null {
  if (!data) return null;

  const value = data.trim();
  if (!value) return null;

  if (isDateOnlyString(value)) {
    return parseClinicLocalDateTime(`${value}T12:00:00`);
  }

  return parseStoredUtcInstant(value);
}

export function hasAgendaExplicitTime(data: string | null | undefined): boolean {
  if (!data) return false;
  return EXPLICIT_TIME_REGEX.test(data.trim());
}

export function formatAgendaDateKey(date: Date): string {
  return getClinicDateKey(date);
}

export function parseAgendaDateKey(dateKey: string): Date {
  return parseClinicDateKeyAsMidday(dateKey);
}

export function getAgendaDateKey(data: string | null | undefined): string | null {
  const parsed = parseAgendaDateTime(data);
  if (!parsed) return null;
  return formatAgendaDateKey(parsed);
}

export function getAgendaTimeLabel(data: string | null | undefined): string {
  const parsed = parseAgendaDateTime(data);
  if (!parsed || !hasAgendaExplicitTime(data)) return 'Sem hora';
  return getClinicTimeLabel(parsed);
}

export function getAgendaHourNumber(data: string | null | undefined): number | null {
  const parsed = parseAgendaDateTime(data);
  if (!parsed || !hasAgendaExplicitTime(data)) return null;
  return Number(getDatePartsInTimeZone(parsed).hour);
}

export function getAgendaSortMinutes(data: string | null | undefined): number {
  const parsed = parseAgendaDateTime(data);
  if (!parsed || !hasAgendaExplicitTime(data)) return -1;

  const parts = getDatePartsInTimeZone(parsed);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function startOfAgendaMonth(date: Date): Date {
  const [year, month] = formatAgendaDateKey(date).split('-').map(Number);
  return parseClinicDateKeyAsMidday(`${year}-${String(month).padStart(2, '0')}-01`);
}

export function endOfAgendaMonth(date: Date): Date {
  const [year, month] = formatAgendaDateKey(date).split('-').map(Number);
  const nextMonthStart = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return parseClinicDateKeyAsMidday(addDaysToClinicDateKey(nextMonthStart, -1));
}

export function startOfAgendaWeek(date: Date): Date {
  const dateKey = formatAgendaDateKey(date);
  const anchor = parseClinicDateKeyAsMidday(dateKey);
  return parseClinicDateKeyAsMidday(addDaysToClinicDateKey(dateKey, -getClinicWeekday(anchor)));
}

export function endOfAgendaWeek(date: Date): Date {
  const start = startOfAgendaWeek(date);
  return parseClinicDateKeyAsMidday(addDaysToClinicDateKey(formatAgendaDateKey(start), 6));
}

export function isAgendaDateInRange(date: Date, start: Date, end: Date): boolean {
  const target = formatAgendaDateKey(date);
  return target >= formatAgendaDateKey(start) && target <= formatAgendaDateKey(end);
}

export function formatAgendaRangeStart(date: Date): string {
  return formatAgendaDateKey(date);
}

export function formatAgendaRangeEnd(date: Date): string {
  return `${formatAgendaDateKey(date)}T23:59:59`;
}
