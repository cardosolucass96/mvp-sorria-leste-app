'use client';

import { useMemo } from 'react';
import { Calendar as ShadCalendar } from '@/components/ui/_shadcn/calendar';
import {
  FOLLOWUP_URGENCIA_CONFIG,
  FOLLOWUP_URGENCIA_ORDER,
  type FollowupUrgencia,
} from '@/lib/constants/followup';
import { formatLocalDateKey, getFollowupUrgencia } from '@/lib/utils/followup';

interface FollowupMinimal {
  vencimento_em: string;
  status: 'aberta' | 'concluida';
}

export interface FollowupCalendarioProps<T extends FollowupMinimal> {
  tarefas: T[];
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date | null) => void;
}

function parseDataKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export default function FollowupCalendario<T extends FollowupMinimal>({
  tarefas,
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
}: FollowupCalendarioProps<T>) {
  const porDia = useMemo(() => {
    const map = new Map<string, { total: number; urgencia: FollowupUrgencia }>();
    for (const tarefa of tarefas) {
      const vencimento = tarefa.vencimento_em.slice(0, 10);
      if (!vencimento) continue;
      const urgencia = getFollowupUrgencia(tarefa);
      const existente = map.get(vencimento);

      if (!existente) {
        map.set(vencimento, { total: 1, urgencia });
        continue;
      }

      existente.total += 1;
      const prioridadeAtual = FOLLOWUP_URGENCIA_ORDER.indexOf(existente.urgencia);
      const prioridadeNova = FOLLOWUP_URGENCIA_ORDER.indexOf(urgencia);
      if (prioridadeNova >= 0 && prioridadeNova < prioridadeAtual) {
        existente.urgencia = urgencia;
      }
    }
    return map;
  }, [tarefas]);

  const modifiers = useMemo(() => {
    const acc: Record<FollowupUrgencia, Date[]> = {
      atrasada: [],
      hoje: [],
      futura: [],
      concluida: [],
    };
    for (const [key, info] of porDia.entries()) {
      acc[info.urgencia].push(parseDataKey(key));
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
          onSelect={(day) => onSelectDay(day ?? null)}
          weekStartsOn={0}
          showOutsideDays
          className="w-full [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(12)] mx-auto"
          modifiers={modifiers}
          modifiersClassNames={{
            atrasada: FOLLOWUP_URGENCIA_CONFIG.atrasada.ringClass,
            hoje: FOLLOWUP_URGENCIA_CONFIG.hoje.ringClass,
            futura: FOLLOWUP_URGENCIA_CONFIG.futura.ringClass,
            concluida: FOLLOWUP_URGENCIA_CONFIG.concluida.ringClass,
          }}
          components={{
            DayButton: ({ day, modifiers, className, ...rest }) => {
              const key = formatLocalDateKey(day.date);
              const info = porDia.get(key);
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
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${FOLLOWUP_URGENCIA_CONFIG[info.urgencia].dotColor}`}
                      />
                      <span className="text-[10px] font-semibold leading-none">{info.total}</span>
                    </span>
                  )}
                </button>
              );
            },
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {FOLLOWUP_URGENCIA_ORDER.map((urgencia) => (
          <span key={urgencia} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${FOLLOWUP_URGENCIA_CONFIG[urgencia].dotColor}`} />
            {FOLLOWUP_URGENCIA_CONFIG[urgencia].label}
          </span>
        ))}
      </div>
    </div>
  );
}
