export type AgendaCalendarView = 'mes' | 'semana';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

export function parseAgendaDateTime(data: string | null | undefined): Date | null {
  if (!data) return null;

  const value = data.trim();
  if (!value) return null;

  if (DATE_ONLY_REGEX.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  if (LOCAL_DATE_TIME_REGEX.test(value)) {
    return new Date(value.replace(' ', 'T'));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hasAgendaExplicitTime(data: string | null | undefined): boolean {
  if (!data) return false;
  return LOCAL_DATE_TIME_REGEX.test(data.trim());
}

export function formatAgendaDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseAgendaDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function getAgendaDateKey(data: string | null | undefined): string | null {
  const parsed = parseAgendaDateTime(data);
  if (!parsed) return null;
  return formatAgendaDateKey(parsed);
}

export function getAgendaTimeLabel(data: string | null | undefined): string {
  const parsed = parseAgendaDateTime(data);
  if (!parsed) return 'Sem hora';
  if (!hasAgendaExplicitTime(data)) return 'Sem hora';
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
}

export function getAgendaHourNumber(data: string | null | undefined): number | null {
  const parsed = parseAgendaDateTime(data);
  if (!parsed || !hasAgendaExplicitTime(data)) return null;
  return parsed.getHours();
}

export function getAgendaSortMinutes(data: string | null | undefined): number {
  const parsed = parseAgendaDateTime(data);
  if (!parsed || !hasAgendaExplicitTime(data)) return -1;
  return parsed.getHours() * 60 + parsed.getMinutes();
}

export function startOfAgendaMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfAgendaMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function startOfAgendaWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export function endOfAgendaWeek(date: Date): Date {
  const result = startOfAgendaWeek(date);
  result.setDate(result.getDate() + 6);
  return result;
}

export function isAgendaDateInRange(date: Date, start: Date, end: Date): boolean {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const startAt = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endAt = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return target >= startAt && target <= endAt;
}

export function formatAgendaRangeStart(date: Date): string {
  return formatAgendaDateKey(date);
}

export function formatAgendaRangeEnd(date: Date): string {
  return `${formatAgendaDateKey(date)}T23:59:59`;
}
