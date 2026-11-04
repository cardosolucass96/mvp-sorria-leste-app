'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useGoogleCalendarData } from './GoogleCalendarProvider';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatarDataAgendada } from '@/lib/utils/formatters';

export default function GoogleCalendarPanel() {
  const { currentUnidade, user } = useAuth();
  const allowed = Boolean(user);
  const unitFetch = useUnitFetch();
  const { data, refresh, apiPath, ownerId } = useGoogleCalendarData();
  const { status, stale, warning: eventError } = data;
  const admin = Boolean(status?.can_manage);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [calendars, setCalendars] = useState<{ value: string; label: string; writable: boolean }[]>([]);
  const [visibleCalendars, setVisibleCalendars] = useState<string[]>([]);
  const [calendar, setCalendar] = useState('');
  const [needsAuthorization, setNeedsAuthorization] = useState(false);
  const [minutes, setMinutes] = useState('30');
  useEffect(() => { setError(''); setMessage(''); setCalendars([]); setVisibleCalendars([]); setNeedsAuthorization(false); }, [currentUnidade, ownerId]);
  useEffect(() => { setCalendar(status?.calendar_id ?? 'primary'); }, [status?.calendar_id]);
  useEffect(() => { if (status?.default_duration) setMinutes(String(status.default_duration)); }, [status?.default_duration]);
  useEffect(() => {
    if (!allowed) return;
    const result = new URLSearchParams(window.location.search).get('google');
    if (result === 'connected') setMessage('Conta conectada. A sincronização inicial começará em instantes.');
    if (result === 'error') setError('Não foi possível conectar. Verifique a autorização e tente novamente.');
  }, [allowed]);
  async function request(path: string, method = 'POST', body?: unknown) {
    const response = await unitFetch(apiPath(path), { method,
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
  if (!allowed) return null;
  return <section className="card space-y-3" aria-label="Integração Google Agenda">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Google Agenda{status?.owner_name ? ` · ${status.owner_name}` : ''}</h2>
        <p className="text-sm text-muted-foreground">{status?.connected ? `${status.email} · ${status.status === 'disconnecting' ? 'Desconectando' : status.status === 'reconnect' ? 'Reconexão necessária' : status.status === 'error' ? 'Nova tentativa pendente' : 'Atualização automática'}` : 'Conecte a agenda Google deste responsável.'}</p>
        {status?.connected && <p className="text-xs text-muted-foreground">Destino dos agendamentos: {status.calendar_name || 'Agenda principal'}</p>}
        {status?.last_sync_at && <p className="text-xs text-muted-foreground">Última sincronização: {formatarDataAgendada(status.last_sync_at)} · Pendentes: {status.pending ?? 0}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {admin && (!status?.connected || status?.status === 'reconnect' || needsAuthorization) && <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
          const data = await request('/authorize'); window.location.assign(data.url);
        })}>{status?.connected ? 'Reconectar Google' : 'Conectar Google'}</Button>}
        {(status?.status === 'error' || error || data.error || stale || eventError) && <Button disabled={busy} variant="secondary" onClick={() => void act(async () => {
          if (status?.status === 'error') await request('/sync');
          setMessage('Atualização solicitada.');
        })}>Tentar novamente</Button>}
      </div>
    </div>
    {(error || data.error) && <Alert type="error">{error || data.error}</Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {eventError && <Alert type="warning">{eventError}</Alert>}
    {status?.last_error && <Alert type="warning">{status.last_error}</Alert>}
    {status?.connected && <>
      {admin && <details><summary className="cursor-pointer text-sm font-medium">Configurações da integração</summary><div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-full space-y-2">
          <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
            const response = await unitFetch(apiPath('/calendars'));
            const result = await response.json();
            if (!response.ok) { setNeedsAuthorization(response.status === 403); throw new Error(result.error || 'Não foi possível listar as agendas.'); }
            setNeedsAuthorization(false);
            setCalendars(result.items.map((item: { id: string; name: string; writable: boolean }) => ({ value: item.id, label: item.name, writable: item.writable })));
            setVisibleCalendars(result.visible_calendar_ids ?? [status.calendar_id ?? 'primary']);
            if (!result.items.length) setMessage('Nenhuma agenda com permissão de leitura disponível nesta conta.');
          })}>Escolher agendas do Google</Button>
          {calendars.length > 0 && <>
            <fieldset className="space-y-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">Agendas para visualizar no app</legend>
              <p className="text-xs text-muted-foreground">Marque até 10 agendas para ver os horários ocupados deste responsável.</p>
              {calendars.map(item => <label key={item.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={visibleCalendars.includes(item.value)} disabled={busy}
                  onChange={event => setVisibleCalendars(previous => event.target.checked ? [...previous, item.value] : previous.filter(id => id !== item.value))} />
                {item.label}{!item.writable && <span className="text-xs text-muted-foreground">(somente leitura)</span>}
              </label>)}
              <Button disabled={busy || visibleCalendars.length > 10} variant="outline" onClick={() => void act(async () => {
                await request('/calendars', 'PATCH', { visible_calendar_ids: visibleCalendars });
                setMessage('Agendas de visualização salvas.');
              })}>Salvar visualização</Button>
            </fieldset>
            <Select label="Agenda para receber os agendamentos" name="google_calendar" value={calendar} onChange={setCalendar} options={calendars.filter(item => item.writable)} />
            <p className="text-xs text-muted-foreground">Novos agendamentos serão enviados somente para esta agenda. Eventos da agenda anterior serão preservados e não serão movidos.</p>
            <Button disabled={busy || !calendar || calendar === status.calendar_id} onClick={() => {
              if (window.confirm('Usar esta agenda para sincronização? Os eventos da agenda anterior serão preservados, sem transferência automática.')) void act(async () => {
                await request('/calendars', 'PATCH', { calendar_id: calendar }); setMessage('Agenda selecionada. A sincronização começará em instantes.');
              });
            }}>Salvar destino</Button>
          </>}
        </div>
        <div className="w-52"><Input name="google_duration" label="Duração padrão (min)" type="number" min={5} max={480} value={minutes} onChange={setMinutes} /></div>
        <Button disabled={busy} variant="secondary" onClick={() => void act(async () => { await request('', 'PATCH', { default_duration: Number(minutes) }); setMessage('Duração padrão salva.'); })}>Salvar duração</Button>
        <Button disabled={busy} variant="outline" onClick={() => void act(async () => {
          const preview = await request('/backfill', 'GET');
          if (!preview.total) { setMessage('Nenhum agendamento futuro pendente de importação.'); return; }
          if (window.confirm(`Enviar ${preview.total} agendamentos futuros desta unidade para o Google? Eventos semelhantes criados manualmente devem ser vinculados antes.`)) {
            await request('/backfill', 'POST', { confirm: true }); setMessage('Agendamentos adicionados à fila de sincronização.');
          }
        })}>Importar agendamentos existentes</Button>
        <Button disabled={busy || status.status === 'disconnecting'} variant="ghost" onClick={() => {
          if (window.confirm('Desconectar a agenda deste responsável? Os compromissos já criados no Google serão preservados.')) void act(async () => { await request('', 'DELETE'); });
        }}>Desconectar</Button>
      </div></details>}
      {(status.conflicts ?? []).map(conflict => <div key={conflict.agendamento_id} className="rounded border border-warning-500 p-3 space-y-2">
        <p className="text-sm">Agendamento #{conflict.agendamento_id}: {conflict.conflict}</p>
        <div className="flex gap-2">{(['local', 'google'] as const).map(choice => <Button key={choice} disabled={busy} variant="outline" onClick={() => {
          if (window.confirm(`Manter a versão ${choice === 'local' ? 'do Sorria Leste' : 'do Google'} para este compromisso?`)) void act(async () => { await request('/resolve', 'POST', { agendamento_id: conflict.agendamento_id, choice }); });
        }}>Manter {choice === 'local' ? 'Sorria' : 'Google'}</Button>)}</div>
      </div>)}

    </>}
  </section>;
}
