'use client';

import { useMemo } from 'react';
import { Calendar as ShadCalendar } from '@/components/ui/_shadcn/calendar';
import { cn } from '@/lib/utils';
import {
  FOLLOWUP_URGENCIA_CONFIG,
  FOLLOWUP_URGENCIA_ORDER,
  type FollowupUrgencia,
} from '@/lib/constants/followup';
import {
  formatLocalDateKey,
  getFollowupUrgencia,
  parseFollowupDateTime,
} from '@/lib/utils/followup';

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

function isSameMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
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

  const resumoMes = useMemo(() => {
    const stats: Record<FollowupUrgencia, number> = {
      atrasada: 0,
      hoje: 0,
      futura: 0,
      concluida: 0,
    };

    for (const tarefa of tarefas) {
      const vencimento = parseFollowupDateTime(tarefa.vencimento_em);
      if (!vencimento || !isSameMonth(vencimento, month)) continue;
      stats[getFollowupUrgencia(tarefa)] += 1;
    }

    return stats;
  }, [month, tarefas]);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-b from-surface via-surface to-background shadow-[0_18px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.82))] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-700/80">
                Calendário operacional
              </p>
              <h3 className="text-lg font-semibold text-foreground">
                Panorama do followup no mês
              </h3>
              <p className="text-sm text-muted-foreground">
                Selecione um dia para ver a carga e a urgência das tarefas com mais clareza.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {FOLLOWUP_URGENCIA_ORDER.map((urgencia) => {
                const config = FOLLOWUP_URGENCIA_CONFIG[urgencia];
                return (
                  <span
                    key={urgencia}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/88 px-3 py-1.5 text-xs text-foreground shadow-sm backdrop-blur"
                  >
                    <span className={cn('h-2 w-2 rounded-full', config.dotColor)} />
                    <span className="font-medium">{config.label}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {resumoMes[urgencia]}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-5">
          <ShadCalendar
            mode="single"
            month={month}
            onMonthChange={onMonthChange}
            selected={selectedDay ?? undefined}
            onSelect={(day) => onSelectDay(day ?? null)}
            weekStartsOn={0}
            showOutsideDays
            className="mx-auto w-full [--cell-size:--spacing(9)] lg:[--cell-size:--spacing(10)]"
            modifiers={modifiers}
            classNames={{
              root: 'w-full',
              month: 'w-full gap-3',
              table: 'w-full border-separate border-spacing-x-2 border-spacing-y-2.5',
              month_caption: 'mb-1 flex h-11 items-center justify-center px-14',
              caption_label: 'text-base font-semibold tracking-tight text-foreground',
              nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
              button_previous: 'h-10 w-10 rounded-full border border-border/70 bg-background/92 text-foreground shadow-sm hover:border-primary/30 hover:bg-primary-50',
              button_next: 'h-10 w-10 rounded-full border border-border/70 bg-background/92 text-foreground shadow-sm hover:border-primary/30 hover:bg-primary-50',
              weekdays: 'flex',
              weekday: 'flex-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500',
              week: 'mt-0 flex w-full',
              day: 'aspect-auto h-auto w-full p-0 align-top',
              outside: 'opacity-45',
              today: 'bg-transparent text-foreground',
            }}
            modifiersClassNames={{
              atrasada: '',
              hoje: '',
              futura: '',
              concluida: '',
            }}
            components={{
              DayButton: ({ day, modifiers, className, ...rest }) => {
                const key = formatLocalDateKey(day.date);
                const info = porDia.get(key);
                const config = info ? FOLLOWUP_URGENCIA_CONFIG[info.urgencia] : null;
                const isSelected =
                  modifiers.selected &&
                  !modifiers.range_start &&
                  !modifiers.range_end &&
                  !modifiers.range_middle;
                const isOutside = !isSameMonth(day.date, month);
                const dayIsToday = isToday(day.date);

                const surfaceClass = !info
                  ? 'border-border/60 bg-background/86 hover:border-primary/30 hover:bg-primary-50/55'
                  : ({
                      atrasada: 'border-error-200/80 bg-error-50/78 hover:bg-error-100/90',
                      hoje: 'border-warning-200/80 bg-warning-50/85 hover:bg-warning-100/90',
                      futura: 'border-info-200/80 bg-info-50/78 hover:bg-info-100/90',
                      concluida: 'border-success-200/80 bg-success-50/78 hover:bg-success-100/88',
                    }[info.urgencia]);

                return (
                  <button
                    {...rest}
                    data-selected-single={isSelected ? true : undefined}
                    className={cn(
                      'relative flex h-[86px] w-full min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-2.5 text-left transition-all duration-200 sm:h-[96px] sm:p-3 lg:h-[108px]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
                      surfaceClass,
                      isSelected && 'border-primary/55 bg-primary-50 ring-2 ring-primary/18 shadow-[0_12px_24px_-18px_rgba(37,99,235,0.8)]',
                      isOutside && 'bg-muted/18 text-muted-foreground',
                      className
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold',
                          dayIsToday
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-background/88 text-foreground shadow-sm ring-1 ring-border/65',
                          isSelected && !dayIsToday && 'bg-primary/12 text-primary-700 ring-primary/20'
                        )}
                      >
                        {day.date.getDate()}
                      </span>

                      {info ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-background/88 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm ring-1 ring-border/60">
                          <span className={cn('h-1.5 w-1.5 rounded-full', config?.dotColor)} />
                          {info.total}
                        </span>
                      ) : dayIsToday ? (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
                          Hoje
                        </span>
                      ) : null}
                    </div>

                    <div className="w-full">
                      {info ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('h-2 w-2 rounded-full', config?.dotColor)} />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/88">
                              {config?.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {info.total} {info.total === 1 ? 'tarefa' : 'tarefas'}
                          </p>
                        </div>
                      ) : (
                        <div className="flex h-6 items-end">
                          <span className="text-[11px] text-muted-foreground/75">
                            {dayIsToday ? 'Sem tarefas' : ' '}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              },
            }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {FOLLOWUP_URGENCIA_ORDER.map((urgencia) => {
          const config = FOLLOWUP_URGENCIA_CONFIG[urgencia];
          return (
            <span
              key={urgencia}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 shadow-sm"
            >
              <span className={cn('h-2 w-2 rounded-full', config.dotColor)} />
              <span>{config.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
