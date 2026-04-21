'use client';

import { useMemo } from 'react';
import { Calendar as ShadCalendar } from '@/components/ui/_shadcn/calendar';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';

interface AgendamentoMinimal {
  data_agendada: string | null;
  status: string;
}

export interface AgendaCalendarioProps<T extends AgendamentoMinimal> {
  agendamentos: T[];
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date | null) => void;
}

const STATUS_PRIORIDADE = ['faltou', 'pendente', 'agendado', 'realizado', 'cancelado'] as const;

const STATUS_DOT_BG: Record<string, string> = {
  faltou: 'bg-warning-500',
  pendente: 'bg-neutral-400',
  agendado: 'bg-primary-500',
  realizado: 'bg-success-500',
  cancelado: 'bg-error-500',
};

function keyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDataKey(s: string): Date {
  return new Date(s + 'T00:00:00');
}

export default function AgendaCalendario<T extends AgendamentoMinimal>({
  agendamentos,
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
}: AgendaCalendarioProps<T>) {
  const porDia = useMemo(() => {
    const map = new Map<string, { total: number; statusDom: string }>();
    for (const ag of agendamentos) {
      if (!ag.data_agendada) continue;
      const key = ag.data_agendada.slice(0, 10);
      const entry = map.get(key);
      if (!entry) {
        map.set(key, { total: 1, statusDom: ag.status });
      } else {
        entry.total += 1;
        const curIdx = STATUS_PRIORIDADE.indexOf(entry.statusDom as (typeof STATUS_PRIORIDADE)[number]);
        const newIdx = STATUS_PRIORIDADE.indexOf(ag.status as (typeof STATUS_PRIORIDADE)[number]);
        if (newIdx !== -1 && (curIdx === -1 || newIdx < curIdx)) {
          entry.statusDom = ag.status;
        }
      }
    }
    return map;
  }, [agendamentos]);

  const modifiers = useMemo(() => {
    const acc: Record<string, Date[]> = { faltou: [], pendente: [], agendado: [], realizado: [], cancelado: [] };
    for (const [key, { statusDom }] of porDia.entries()) {
      if (acc[statusDom]) acc[statusDom].push(parseDataKey(key));
    }
    return acc;
  }, [porDia]);

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-surface p-2 sm:p-4">
        <ShadCalendar
          mode="single"
          month={month}
          onMonthChange={onMonthChange}
          selected={selectedDay ?? undefined}
          onSelect={(d) => onSelectDay(d ?? null)}
          weekStartsOn={0}
          showOutsideDays
          className="w-full [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(12)] mx-auto"
          modifiers={modifiers}
          modifiersClassNames={{
            faltou: '[&_button]:ring-1 [&_button]:ring-warning-300',
            pendente: '[&_button]:ring-1 [&_button]:ring-neutral-300',
            agendado: '[&_button]:ring-1 [&_button]:ring-primary-300',
            realizado: '[&_button]:ring-1 [&_button]:ring-success-300',
            cancelado: '[&_button]:ring-1 [&_button]:ring-error-300',
          }}
          components={{
            DayButton: ({ day, modifiers, className, ...rest }) => {
              const dateKey = keyFromDate(day.date);
              const info = porDia.get(dateKey);
              const isSelected =
                modifiers.selected &&
                !modifiers.range_start &&
                !modifiers.range_end &&
                !modifiers.range_middle;
              return (
                <button
                  {...rest}
                  data-selected-single={isSelected ? true : undefined}
                  className={
                    'relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md text-sm font-normal aspect-square min-w-(--cell-size) ' +
                    'hover:bg-primary-50 data-[selected-single=true]:bg-primary-600 data-[selected-single=true]:text-white ' +
                    (className ?? '')
                  }
                >
                  <span>{day.date.getDate()}</span>
                  {info && (
                    <span className="flex items-center gap-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_BG[info.statusDom] ?? 'bg-neutral-400'}`} />
                      <span className="text-[10px] font-semibold leading-none">{info.total}</span>
                    </span>
                  )}
                </button>
              );
            },
          }}
        />
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {(['agendado', 'pendente', 'faltou', 'realizado', 'cancelado'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT_BG[s]}`} />
            {AGENDAMENTO_STATUS_CONFIG[s as keyof typeof AGENDAMENTO_STATUS_CONFIG]?.label ?? s}
          </span>
        ))}
      </div>
    </div>
  );
}
