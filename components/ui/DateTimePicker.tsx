'use client';

import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Calendar } from './_shadcn/calendar';
import Select from './Select';

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function DateTimePicker({ label, name, value, onChange, min, hint }: {
  label: string; name: string; value: string; onChange: (value: string) => void; min?: string; hint?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const day = value.slice(0, 10);
  const hour = value.slice(11, 13) || '08';
  const minute = value.slice(14, 16) || '00';
  const selected = day ? new Date(`${day}T12:00:00`) : undefined;
  const minDay = min?.slice(0, 10);
  const minTime = day === minDay ? min?.slice(11, 16) : undefined;
  function chooseDate(date: Date | undefined) {
    if (!date) return;
    const nextDay = dateKey(date);
    let time = `${hour}:${minute}`;
    if (nextDay === minDay && min && time < min.slice(11, 16)) time = min.slice(11, 16);
    onChange(`${nextDay}T${time}`);
    setOpen(false);
    document.getElementById(id)?.focus();
  }
  return <fieldset className="min-w-0 space-y-2" aria-describedby={hint ? `${id}-hint` : undefined}>
    <legend className="mb-1 text-sm font-medium text-foreground">{label}</legend>
    <input type="hidden" name={name} value={value} />
    <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={id} className="mb-1 block text-sm font-medium">Data</label>
        <button id={id} type="button" aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => setOpen(!open)}
          className="field-control flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
          <span>{selected ? selected.toLocaleDateString('pt-BR') : 'Selecionar data'}</span>
          <CalendarDays size={18} className="shrink-0 text-primary" aria-hidden="true" />
        </button>
      </div>
      <Select label="Hora" name={`${name}_hora`} value={hour} disabled={!day}
        onChange={next => { if (next) onChange(`${day}T${next}:${minTime && next === minTime.slice(0, 2) && minute < minTime.slice(3) ? minTime.slice(3) : minute}`); }}
        options={Array.from({ length: 24 }, (_, i) => pad(i)).filter(h => !minTime || h >= minTime.slice(0, 2)).map(h => ({ value: h, label: h }))} />
      <Select label="Minutos" name={`${name}_minutos`} value={minute} disabled={!day}
        onChange={next => { if (next) onChange(`${day}T${hour}:${next}`); }}
        options={Array.from({ length: 60 }, (_, i) => pad(i)).filter(m => !minTime || `${hour}:${m}` >= minTime).map(m => ({ value: m, label: m }))} />
    </div>
    {open && <div id={`${id}-calendar`} className="w-fit max-w-full rounded-xl border border-border p-2" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); document.getElementById(id)?.focus(); }
    }}>
      <Calendar mode="single" locale={ptBR} labels={{ labelNext: () => 'Próximo mês', labelPrevious: () => 'Mês anterior' }} selected={selected} defaultMonth={selected ?? (minDay ? new Date(`${minDay}T12:00:00`) : undefined)}
        disabled={minDay ? { before: new Date(`${minDay}T00:00:00`) } : undefined} onSelect={chooseDate} className="[--cell-size:2.5rem]" />
    </div>}
    {value && <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => { onChange(''); setOpen(false); }}>Limpar data e horário</button>}
    {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
  </fieldset>;
}
