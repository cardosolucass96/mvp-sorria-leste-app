'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { ConnectionStatus, ExternalEvent } from '@/modules/google-calendar/contracts';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatarDataAgendada } from '@/lib/utils/formatters';

export default function GoogleCalendarPanel() {
  const { hasRole, currentUnidade, viewMode } = useAuth();
  const allowed = hasRole(['admin', 'atendente']) && viewMode !== 'dentista';
  const admin = hasRole('admin');
  const unitFetch = useUnitFetch();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [events, setEvents] = useState<ExternalEvent[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [open, setOpen] = useState(false);
  const [stale, setStale] = useState(false);
  const [from, setFrom] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }));
  const [to, setTo] = useState(() => new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }));
  const [selected, setSelected] = useState('');
  const [appointment, setAppointment] = useState('');
  const [appointments, setAppointments] = useState<{ value: string; label: string }[]>([]);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    const response = await unitFetch('/api/integracoes/google');
    const data = await response.json() as ConnectionStatus & { error?: string };
    if (ticket !== generation.current) return;
    if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a conexão.');
    setStatus(data);
  }, [unitFetch]);
  useEffect(() => {
    generation.current++;
    setStatus(null); setEvents([]); setSelected(''); setAppointment(''); setOpen(false); setError(''); setMessage('');
    if (!allowed) return;
    let active = true;
    void refresh().catch(() => { if (active) setError('Google Agenda ainda não está disponível neste ambiente.'); });
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(() => {}); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [allowed, currentUnidade, refresh]);
  useEffect(() => { if (status?.default_duration) setMinutes(String(status.default_duration)); }, [status?.default_duration]);
  useEffect(() => {
    if (!allowed) return;
    const result = new URLSearchParams(window.location.search).get('google');
    if (result === 'connected') setMessage('Conta conectada. A sincronização inicial começará em instantes.');
    if (result === 'error') setError('Não foi possível conectar. Verifique a autorização e tente novamente.');
  }, [allowed]);
  async function request(path: string, method = 'POST', body?: unknown) {
    const response = await unitFetch(`/api/integracoes/google${path}`, { method,
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
    return data;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha na operação.'); }
    finally { setBusy(false); }
  }
  async function loadEvents() {
    const data = await request(`/events?${new URLSearchParams({ from: `${from}T00:00:00-03:00`, to: `${to}T23:59:59-03:00` })}`, 'GET');
    setEvents(data.items); setStale(Boolean(data.stale)); setOpen(true);
    if (data.truncated) setMessage('Há mais eventos disponíveis. Reduza o período para visualizar todos.');
  }
  async function selectEvent(event: ExternalEvent) {
    setSelected(event.event_id); setAppointment('');
    const response = await unitFetch('/api/agendamentos?status=agendado&data_inicio=' + from + '&data_fim=' + to);
    if (!response.ok) throw new Error('Não foi possível buscar agendamentos.');
    const rows = await response.json() as { id: number; cliente_nome: string; data_agendada: string }[];
    setAppointments(rows.map(row => ({ value: String(row.id), label: `#${row.id} · ${row.cliente_nome} · ${formatarDataAgendada(row.data_agendada)}` })));
  }
  if (!allowed) return null;
  return <section className="card space-y-3" aria-label="Integração Google Agenda">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Google Agenda</h2>
        <p className="text-sm text-muted-foreground">{status?.connected ? `${status.email} · ${status.status === 'disconnecting' ? 'Desconectando' : status.status === 'reconnect' ? 'Reconexão necessária' : status.status === 'error' ? 'Nova tentativa pendente' : 'Conectado'}` : 'Sincronize a agenda desta unidade com o Google.'}</p>
        {status?.last_sync_at && <p className="text-xs text-muted-foreground">Última sincronização: {formatarDataAgendada(status.last_sync_at)} · Pendentes: {status.pending ?? 0}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {admin && status?.status !== 'disconnecting' && <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
          const data = await request('/authorize'); window.location.assign(data.url);
        })}>{status?.connected ? 'Reconectar Google' : 'Conectar Google'}</Button>}
        {status?.connected && <Button disabled={busy} variant="secondary" onClick={() => void act(async () => { await request('/sync'); setMessage('Sincronização solicitada.'); })}>Sincronizar agora</Button>}
        {admin && status?.connected && <Button disabled={busy} variant="ghost" onClick={() => {
          if (window.confirm('Desconectar esta unidade? Os compromissos já criados no Google serão preservados.')) void act(async () => { await request('', 'DELETE'); });
        }}>Desconectar</Button>}
      </div>
    </div>
    {error && <Alert type="error">{error}</Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {status?.last_error && <Alert type="warning">{status.last_error}</Alert>}
    {status?.connected && <>
      {admin && <div className="flex flex-wrap items-end gap-3">
        <div className="w-52"><Input name="google_duration" label="Duração padrão (min)" type="number" min={5} max={480} value={minutes} onChange={setMinutes} /></div>
        <Button disabled={busy} variant="secondary" onClick={() => void act(async () => { await request('', 'PATCH', { default_duration: Number(minutes) }); setMessage('Duração padrão salva.'); })}>Salvar duração</Button>
        <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
          const preview = await request('/backfill', 'GET');
          if (!preview.total) { setMessage('Nenhum agendamento futuro pendente de importação.'); return; }
          if (window.confirm(`Enviar ${preview.total} agendamentos futuros desta unidade para o Google? Eventos semelhantes criados manualmente devem ser vinculados antes.`)) {
            await request('/backfill', 'POST', { confirm: true }); setMessage('Agendamentos adicionados à fila de sincronização.');
          }
        })}>Importar agendamentos existentes</Button>
      </div>}
      {(status.conflicts ?? []).map(conflict => <div key={conflict.agendamento_id} className="rounded border border-warning-500 p-3 space-y-2">
        <p className="text-sm">Agendamento #{conflict.agendamento_id}: {conflict.conflict}</p>
        <div className="flex gap-2">{(['local', 'google'] as const).map(choice => <Button key={choice} disabled={busy} variant="outline" onClick={() => {
          if (window.confirm(`Manter a versão ${choice === 'local' ? 'do Sorria Leste' : 'do Google'} para este compromisso?`)) void act(async () => { await request('/resolve', 'POST', { agendamento_id: conflict.agendamento_id, choice }); });
        }}>Manter {choice === 'local' ? 'Sorria' : 'Google'}</Button>)}</div>
      </div>)}
      <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">Eventos externos do Google</summary>
        <p className="my-2 text-sm text-muted-foreground">Eventos sem paciente vinculado. Ocorrências recorrentes são apenas para consulta.</p>
        {stale && <Alert type="warning">Google indisponível. Exibindo a última cópia disponível; recorrências mostram apenas o início da série.</Alert>}
        <div className="flex flex-wrap items-end gap-3">
          <Input label="De" name="google_from" type="date" value={from} onChange={setFrom} />
          <Input label="Até" name="google_to" type="date" value={to} onChange={setTo} />
          <Button disabled={busy} onClick={() => void act(loadEvents)}>Buscar eventos</Button>
        </div>
        <ul className="mt-3 space-y-3">{events.map(event => <li key={event.event_id} className="rounded border border-border p-3">
          <p className="font-medium">{event.summary}</p><p className="text-sm text-muted-foreground">{event.all_day ? `${event.start_at} · Dia inteiro` : event.start_at && formatarDataAgendada(event.start_at)}{event.recurring ? ' · Recorrente' : ''}</p>
          {!event.all_day && !event.recurring && <Button variant="ghost" disabled={busy} onClick={() => void act(() => selectEvent(event))}>Vincular a agendamento</Button>}
          {selected === event.event_id && <div className="mt-2 space-y-2">
            <Select label="Agendamento desta unidade" name="google_link_appointment" value={appointment} onChange={setAppointment} options={appointments} />
            <p className="text-sm text-muted-foreground">O evento do Google passará a usar o horário e a identificação do agendamento selecionado.</p>
            <Button disabled={!appointment || busy} onClick={() => void act(async () => {
              await request('/link', 'POST', { event_id: selected, agendamento_id: Number(appointment) }); setSelected(''); await loadEvents();
            })}>Confirmar vínculo</Button>
          </div>}
        </li>)}</ul>
        {open && events.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Busque um período para consultar eventos sem vínculo.</p>}
      </details>
    </>}
  </section>;
}
