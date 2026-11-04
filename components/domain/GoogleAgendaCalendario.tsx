'use client';
import { useGoogleCalendarData } from './GoogleCalendarProvider';
import { externalEventDays, externalEventTime } from '@/modules/google-calendar/calendar-display';
import { formatAgendaDateKey } from '@/lib/utils/agendaCalendar';
import GoogleEventLink from './GoogleEventLink';
import AgendaCalendario, { type AgendaCalendarioProps } from './AgendaCalendario';

type CalendarAppointment = {
  id: number; cliente_id: number; cliente_nome: string; data_agendada: string | null; status: string;
};
export default function GoogleAgendaCalendario<T extends CalendarAppointment>(props: AgendaCalendarioProps<T>) {
  const { data, refresh } = useGoogleCalendarData();
  const items = data.items;
  const warning = data.error || data.warning;
  const day = props.selectedDay ? formatAgendaDateKey(props.selectedDay) : null;
  const selected = items.filter(event => externalEventDays(event, props.focusedDate, props.view).some(entry => entry.dateKey === day));
  return <div className="space-y-3">
    {warning && <p role="status" className="text-sm text-muted-foreground">{warning} <button type="button" className="underline" onClick={() => void refresh()}>Tentar novamente</button></p>}
    <AgendaCalendario {...props} externalEvents={items} />
    {selected.length > 0 && <section className="card space-y-2" aria-label="Eventos do Google no dia selecionado">
      <h3 className="font-semibold">Google Agenda · dia selecionado</h3>
      {selected.map(event => <div key={event.event_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2 last:border-0">
        <div><p className="text-sm font-medium">{event.summary}</p><p className="text-sm text-muted-foreground">{externalEventTime(event)}</p></div>
        {!event.all_day && !event.recurring && <GoogleEventLink event={event} />}
      </div>)}
    </section>}
  </div>;
}
