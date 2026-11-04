import type { Appointment, GoogleConnection, GoogleEvent } from '../contracts';
export function duration(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 480 ? value : null;
}
export function localSnapshot(event: Appointment): string {
  return JSON.stringify([event.data_agendada, event.duracao_minutos, event.status, event.cliente_id, event.executor_id, event.unidade_id, event.procedimento_id ?? null, event.observacoes ?? null]);
}
function normalizedTime(value?: { dateTime?: string; date?: string }): string | null {
  if (value?.dateTime && Number.isFinite(Date.parse(value.dateTime))) return new Date(value.dateTime).toISOString();
  return value?.date ?? null;
}
export function remoteSnapshot(event: GoogleEvent): string {
  return JSON.stringify([event.status === 'cancelled', normalizedTime(event.start), normalizedTime(event.end), Boolean(event.start?.date), Boolean(event.recurrence?.length || event.recurringEventId)]);
}
export function remoteInterval(event: GoogleEvent): { start: string; minutes: number } | null {
  if (event.recurrence?.length || event.recurringEventId || !event.start?.dateTime || !event.end?.dateTime) return null;
  const start = Date.parse(event.start.dateTime);
  const end = Date.parse(event.end.dateTime);
  const minutes = (end - start) / 60000;
  return Number.isFinite(start) && duration(minutes) ? { start: new Date(start).toISOString(), minutes } : null;
}
export function shouldPublish(event: Appointment | null): event is Appointment {
  return Boolean(event?.data_agendada && ['agendado', 'realizado', 'faltou'].includes(event.status));
}
export function toGoogle(event: Appointment, connection: GoogleConnection, eventId: string, baseUrl: string): GoogleEvent & { description: string } {
  const start = new Date(event.data_agendada!).toISOString();
  const minutes = event.duracao_minutos ?? connection.default_duration;
  const unit = event.unidade_nome?.trim() || `Unidade ${event.unidade_id}`;
  const text = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const details = [
    event.procedimento_nome?.trim() ? `Procedimentos:\n${text(event.procedimento_nome.trim())}` : '',
    event.observacoes?.trim() ? `Observações:\n${text(event.observacoes.trim())}` : '',
  ].filter(Boolean);
  const description = [`Agendamento #${event.id}\n${baseUrl}/agenda`, ...details].join('\n\n');
  return {
    id: eventId, summary: `${unit} • ${event.cliente_nome}`,
    location: '',
    status: 'confirmed',
    description,
    start: { dateTime: start, timeZone: 'America/Fortaleza' },
    end: { dateTime: new Date(Date.parse(start) + minutes * 60000).toISOString(), timeZone: 'America/Fortaleza' },
    extendedProperties: { private: { sorriaConnection: connection.id, sorriaAppointment: String(event.id) } },
  };
}
