'use client';
import { useState } from 'react';
import type { ExternalEvent } from '@/modules/google-calendar/contracts';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useGoogleCalendarData } from './GoogleCalendarProvider';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { formatarDataAgendada } from '@/lib/utils/formatters';

export default function GoogleEventLink({ event }: { event: ExternalEvent }) {
  const unitFetch = useUnitFetch();
  const { range, refresh } = useGoogleCalendarData();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [appointment, setAppointment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try {
      const response = await unitFetch(`/api/agendamentos?${new URLSearchParams({ status: 'agendado', data_inicio: range.start, data_fim: range.end })}`);
      if (!response.ok) throw new Error();
      const rows = await response.json() as { id: number; cliente_nome: string; data_agendada: string }[];
      setOptions(rows.map(row => ({ value: String(row.id), label: `#${row.id} · ${row.cliente_nome} · ${formatarDataAgendada(row.data_agendada)}` })));
    } catch { setError('Não foi possível buscar agendamentos.'); }
    finally { setBusy(false); }
  }
  async function link() {
    setBusy(true); setError('');
    try {
      const response = await unitFetch('/api/integracoes/google/link', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.event_id, agendamento_id: Number(appointment) }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error || 'Não foi possível vincular.'); return; }
      await refresh();
    } catch { setError('Não foi possível vincular. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <details className="text-sm" onToggle={e => { if (e.currentTarget.open) void load(); }}>
    <summary className="cursor-pointer text-muted-foreground">Vincular a consulta</summary>
    <div className="mt-2 space-y-2">
      <Select label="Agendamento desta unidade" name={`google-link-${event.event_id}`} value={appointment} onChange={setAppointment} options={options} />
      <p className="text-xs text-muted-foreground">O evento passará a usar o horário e a identificação da consulta selecionada.</p>
      {error && <p role="alert">{error}</p>}
      <Button disabled={!appointment || busy} onClick={() => void link()}>Confirmar vínculo</Button>
    </div>
  </details>;
}
