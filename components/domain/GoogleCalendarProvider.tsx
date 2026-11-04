'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { ConnectionStatus, ExternalEvent } from '@/modules/google-calendar/contracts';
import { formatAgendaDateKey } from '@/lib/utils/agendaCalendar';

type Range = { start: string; end: string };
type Data = { status: ConnectionStatus | null; items: ExternalEvent[]; warning: string; stale: boolean; error: string };
const empty: Data = { status: null, items: [], warning: '', stale: false, error: '' };
const Context = createContext<{
  data: Data; loading: boolean; range: Range; calendarMode: boolean;
  setRange: (range: Range) => void; refresh: () => Promise<void>;
} | null>(null);

export function useGoogleCalendarData() {
  const context = useContext(Context);
  if (!context) throw new Error('GoogleCalendarProvider necessário.');
  return context;
}

export default function GoogleCalendarProvider({ children, calendarRange }: { children: ReactNode; calendarRange?: Range }) {
  const { currentUnidade, user, hasRole, viewMode } = useAuth();
  const allowed = hasRole(['admin', 'atendente']) && viewMode !== 'dentista';
  const unitFetch = useUnitFetch();
  const [listRange, setRange] = useState<Range>(() => ({ start: formatAgendaDateKey(new Date()), end: formatAgendaDateKey(new Date(Date.now() + 30 * 86400000)) }));
  const range = calendarRange ?? listRange;
  const scope = `${user?.id ?? ''}:${currentUnidade}:${allowed}:${viewMode}`;
  const key = `${scope}:${range.start}:${range.end}`;
  const [result, setResult] = useState<{ key: string; data: Data; loading: boolean }>({ key: '', data: empty, loading: false });
  const control = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const cache = useRef(new Map<string, { at: number; data: Data }>());
  const cacheScope = useRef(scope);
  const refresh = useCallback(() => control.current(true), []);

  useEffect(() => {
    if (cacheScope.current !== scope) { cache.current.clear(); cacheScope.current = scope; }
    if (!allowed) { control.current = async () => {}; return; }
    let active = true;
    let inFlight: Promise<void> | null = null;
    let queued = false;
    let lastAttempt = 0;
    let latest = cache.current.get(key)?.data ?? empty;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(range.start) && /^\d{4}-\d{2}-\d{2}$/.test(range.end)
      && range.start <= range.end && Date.parse(range.end) - Date.parse(range.start) < 93 * 86400000;
    async function request() {
      lastAttempt = Date.now();
      setResult({ key, data: latest, loading: true });
      try {
        const response = await unitFetch('/api/integracoes/google');
        if (!response.ok) {
          if ([401, 403].includes(response.status)) latest = empty;
          throw new Error('connection');
        }
        const status = await response.json() as ConnectionStatus;
        if (!active) return;
        latest = { ...latest, status, error: '' };
        if (!status.connected || status.status === 'disconnecting' || status.status === 'reconnect') {
          latest = { ...empty, status }; cache.current.clear();
        } else if (!valid) {
          latest = { ...latest, items: [], warning: 'Selecione um período válido de até 93 dias.', stale: false };
        } else {
          const events = await unitFetch(`/api/integracoes/google/events?${new URLSearchParams({ from: `${range.start}T00:00:00-03:00`, to: `${range.end}T23:59:59.999-03:00` })}`);
          if (!events.ok) {
            if ([401, 403].includes(events.status)) latest = { ...latest, items: [] };
            throw new Error('events');
          }
          const body = await events.json();
          if (!active) return;
          latest = { ...latest, items: body.items ?? [], stale: Boolean(body.stale), warning: body.stale
            ? 'Google Agenda: exibindo dados salvos; a atualização está indisponível.'
            : body.truncated ? 'Há mais eventos disponíveis. Reduza o período para visualizar todos.' : '' };
        }
        if (!active) return;
        if (!latest.warning && status.status !== 'error') {
          if (cache.current.size >= 6) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(key, { at: Date.now(), data: latest });
        } else cache.current.delete(key);
      } catch (error) {
        if (!active) return;
        cache.current.delete(key);
        latest = { ...latest, error: error instanceof Error && error.message === 'connection'
          ? 'Google Agenda ainda não está disponível neste ambiente.' : 'Não foi possível atualizar os eventos do Google.' };
      } finally { if (active) setResult({ key, data: latest, loading: false }); }
    }
    function load(force = false): Promise<void> {
      if (!active) return Promise.resolve();
      if (force) cache.current.clear();
      if (inFlight) { if (force) queued = true; return inFlight; }
      const cached = cache.current.get(key);
      if (!force && cached && Date.now() - cached.at < 15000) {
        latest = cached.data; setResult({ key, data: latest, loading: false }); return Promise.resolve();
      }
      if (!force && Date.now() - lastAttempt < 5000) return Promise.resolve();
      inFlight = request().finally(async () => {
        inFlight = null;
        if (queued && active) { queued = false; await load(true); }
      });
      return inFlight;
    }
    control.current = load;
    void load();
    const visible = () => { if (!document.hidden) void load(); };
    const timer = setInterval(visible, 60000);
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [allowed, scope, key, range.start, range.end, unitFetch]);

  return <Context.Provider value={{ data: allowed && result.key === key ? result.data : empty,
    loading: allowed && (result.key !== key || result.loading), range, setRange, calendarMode: Boolean(calendarRange), refresh }}>{children}</Context.Provider>;
}
