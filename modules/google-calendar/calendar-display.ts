import type { ExternalEvent } from './contracts';
import { addDaysToClinicDateKey } from '@/lib/time';
import { type AgendaCalendarView, startOfAgendaWeek, endOfAgendaWeek, startOfAgendaMonth, endOfAgendaMonth,
  formatAgendaDateKey, parseAgendaDateKey, getAgendaDateKey, getAgendaHourNumber, getAgendaSortMinutes, getAgendaTimeLabel } from '@/lib/utils/agendaCalendar';

export function googleWindow(focusedDate: Date, view: AgendaCalendarView) {
  return { start: formatAgendaDateKey(startOfAgendaWeek(view === 'mes' ? startOfAgendaMonth(focusedDate) : focusedDate)),
    end: formatAgendaDateKey(endOfAgendaWeek(view === 'mes' ? endOfAgendaMonth(focusedDate) : focusedDate)) };
}
export function externalEventTime(event: ExternalEvent): string {
  if (event.all_day) return 'Dia inteiro';
  if (!event.start_at || !event.end_at) return 'Horário indisponível';
  const start = getAgendaDateKey(event.start_at); const end = getAgendaDateKey(event.end_at);
  const time = `${getAgendaTimeLabel(event.start_at)}–${getAgendaTimeLabel(event.end_at)}`;
  if (start === end) return time;
  const date = (key: string | null) => key?.split('-').reverse().join('/') ?? '';
  return `${date(start)} ${getAgendaTimeLabel(event.start_at)} – ${date(end)} ${getAgendaTimeLabel(event.end_at)}`;
}
export function externalEventDays(event: ExternalEvent, focusedDate: Date, view: AgendaCalendarView) {
  if (!event.start_at || !event.end_at || !Number.isFinite(Date.parse(event.end_at))) return [];
  const first = getAgendaDateKey(event.start_at);
  const last = event.end_at && (event.all_day ? addDaysToClinicDateKey(event.end_at, -1) : getAgendaDateKey(new Date(Date.parse(event.end_at) - 1).toISOString()));
  if (!first || !last || last < first) return [];
  const window = googleWindow(focusedDate, view);
  const days = [];
  for (let key = first > window.start ? first : window.start; key <= last && key <= window.end; key = addDaysToClinicDateKey(key, 1)) {
    const startsToday = key === first;
    days.push({ dateKey: key, date: parseAgendaDateKey(key),
      hour: event.all_day ? null : startsToday ? getAgendaHourNumber(event.start_at) : 0,
      minutes: event.all_day ? -1 : startsToday ? getAgendaSortMinutes(event.start_at) : 0,
      time: event.all_day ? 'Dia inteiro' : `${startsToday ? getAgendaTimeLabel(event.start_at) : '00:00'}–${key === getAgendaDateKey(event.end_at) ? getAgendaTimeLabel(event.end_at) : '24:00'}` });
  }
  return days;
}
