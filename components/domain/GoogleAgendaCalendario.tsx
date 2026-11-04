'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { ExternalEvent } from '@/modules/google-calendar/contracts';
import { externalEventDays, googleWindow } from '@/modules/google-calendar/calendar-display';
import { formatAgendaDateKey } from '@/lib/utils/agendaCalendar';
import AgendaCalendario, { type AgendaCalendarioProps } from './AgendaCalendario';

type CalendarAppointment = {
  id: number; cliente_id: number; cliente_nome: string; data_agendada: string | null; status: string;
};
export default function GoogleAgendaCalendario<T extends CalendarAppointment>(props: AgendaCalendarioProps<T>) {
  const { hasRole, currentUnidade, viewMode } = useAuth();
  const allowed = hasRole(['admin', 'atendente']) && viewMode !== 'dentista';
  const unitFetch = useUnitFetch();
  const window = googleWindow(props.focusedDate, props.view);
  const key = `${currentUnidade}:${allowed}:${window.start}:${window.end}`;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; items: ExternalEvent[]; warning: string }>({ key: '', items: [], warning: '' });
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    let running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const response = await unitFetch(`/api/integracoes/google/events?${new URLSearchParams({ from: `${window.start}T00:00:00-03:00`, to: `${window.end}T23:59:59.999-03:00` })}`);
        if (!response.ok) throw new Error('Google Agenda indisponível.');
        const data = await response.json();
        if (active) setResult({ key, items: data.items ?? [], warning: data.stale
          ? 'Google Agenda: exibindo dados salvos; a atualização está indisponível.'
          : data.truncated ? 'Google Agenda: há mais eventos neste período do que foi possível carregar.' : '' });
      } catch {
        if (active) setResult(previous => ({ key, items: previous.key === key ? previous.items : [], warning: 'Não foi possível atualizar os eventos do Google Agenda.' }));
      } finally { running = false; }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    const onFocus = () => { if (!document.hidden) void load(); };
    globalThis.window.addEventListener('focus', onFocus);
    return () => { active = false; clearInterval(timer); globalThis.window.removeEventListener('focus', onFocus); };
  }, [allowed, key, unitFetch, window.start, window.end, retry]);
  const items = allowed && result.key === key ? result.items : [];
  const day = props.selectedDay ? formatAgendaDateKey(props.selectedDay) : null;
  const selected = items.filter(event => externalEventDays(event, props.focusedDate, props.view).some(entry => entry.dateKey === day));
  return <div className="space-y-3">
    {allowed && result.key === key && result.warning && <p role="status" className="text-sm text-muted-foreground">{result.warning} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p>}
    <AgendaCalendario {...props} externalEvents={items} />
    {selected.length > 0 && <section className="card space-y-2" aria-label="Eventos do Google no dia selecionado">
      <h3 className="font-semibold">Google Agenda · dia selecionado</h3>
      <p className="text-sm text-muted-foreground">Eventos externos. Para alterar, use o Google Agenda. Para associar a uma consulta, use o painel Google Agenda acima.</p>
      {selected.map(event => <div key={event.event_id} className="text-sm"><strong>{event.summary}</strong> · {event.all_day ? 'Dia inteiro' : externalEventDays(event, props.focusedDate, props.view).find(entry => entry.dateKey === day)?.time}</div>)}
    </section>}
  </div>;
}
