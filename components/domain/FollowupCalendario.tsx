'use client';

import { useMemo } from 'react';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Calendar as ShadCalendar } from '@/components/ui/_shadcn/calendar';
import { cn } from '@/lib/utils';
import {
  FOLLOWUP_URGENCIA_CONFIG,
  FOLLOWUP_URGENCIA_ORDER,
  type FollowupUrgencia,
} from '@/lib/constants/followup';
import {
  formatLocalDateKey,
  getFollowupDateKey,
  getFollowupUrgencia,
  parseFollowupDateTime,
} from '@/lib/utils/followup';
import { getClinicTimeLabel } from '@/lib/time';

interface FollowupMinimal {
  titulo: string;
  vencimento_em: string;
  status: 'aberta' | 'concluida';
}

interface FollowupDayInfo<T extends FollowupMinimal> {
  total: number;
  urgencia: FollowupUrgencia;
  items: T[];
}

export interface FollowupCalendarioProps<T extends FollowupMinimal> {
  tarefas: T[];
  month: Date;
  onMonthChange: (d: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (d: Date | null) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, delta: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay));
}

function sortByDueDate<T extends FollowupMinimal>(a: T, b: T) {
  return a.vencimento_em.localeCompare(b.vencimento_em);
}

function isSameMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function formatMonthLabel(date: Date): string {
  const label = startOfMonth(date).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getUrgenciaSurfaceClass(urgencia?: FollowupUrgencia): string {
  if (!urgencia) {
    return 'border-border/70 bg-background/90 hover:border-primary/30 hover:bg-primary/20';
  }

  return {
    atrasada: 'border-error-200/80 bg-error-50/82 hover:bg-error-100/88 dark:border-error-900/55 dark:bg-error-900/22',
    hoje: 'border-warning-200/80 bg-warning-50/88 hover:bg-warning-100/90 dark:border-warning-900/55 dark:bg-warning-900/22',
    futura: 'border-info-200/80 bg-info-50/82 hover:bg-info-100/88 dark:border-info-900/55 dark:bg-info-900/22',
    concluida: 'border-success-200/80 bg-success-50/82 hover:bg-success-100/88 dark:border-success-900/55 dark:bg-success-900/22',
  }[urgencia];
}

function getTaskLabel(task: FollowupMinimal): string {
  const parsed = parseFollowupDateTime(task.vencimento_em);
  if (!parsed) return task.titulo;

  const time = getClinicTimeLabel(parsed);
  return `${time} ${task.titulo}`;
}

export default function FollowupCalendario<T extends FollowupMinimal>({
  tarefas,
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
}: FollowupCalendarioProps<T>) {
  const porDia = useMemo(() => {
    const map = new Map<string, FollowupDayInfo<T>>();

    for (const tarefa of tarefas) {
      const vencimento = getFollowupDateKey(tarefa.vencimento_em);
      if (!vencimento) continue;

      const urgencia = getFollowupUrgencia(tarefa);
      const existente = map.get(vencimento);

      if (!existente) {
        map.set(vencimento, { total: 1, urgencia, items: [tarefa] });
        continue;
      }

      existente.total += 1;
      existente.items.push(tarefa);

      const prioridadeAtual = FOLLOWUP_URGENCIA_ORDER.indexOf(existente.urgencia);
      const prioridadeNova = FOLLOWUP_URGENCIA_ORDER.indexOf(urgencia);
      if (prioridadeNova >= 0 && prioridadeNova < prioridadeAtual) {
        existente.urgencia = urgencia;
      }
    }

    for (const info of map.values()) {
      info.items.sort(sortByDueDate);
    }

    return map;
  }, [tarefas]);

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
    <div className="w-full overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-b from-surface via-surface to-background shadow-[0_18px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(234,88,12,0.15),transparent_34%),linear-gradient(180deg,var(--color-surface),color-mix(in srgb,var(--color-surface) 88%, #000 12%))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              Calendário operacional
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {formatMonthLabel(month)}
            </h3>
            <p className="text-sm text-muted-foreground">
              Selecione um dia para ver a carga e as tarefas daquele vencimento com mais clareza.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
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

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Mês anterior"
                data-testid="followup-calendar-prev"
                onClick={() => onMonthChange(startOfMonth(shiftMonth(month, -1)))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Próximo mês"
                data-testid="followup-calendar-next"
                onClick={() => onMonthChange(startOfMonth(shiftMonth(month, 1)))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5">
        <ShadCalendar
          mode="single"
          hideNavigation
          locale={ptBR}
          month={startOfMonth(month)}
          onMonthChange={(nextMonth) => onMonthChange(startOfMonth(nextMonth))}
          selected={selectedDay ?? undefined}
          onSelect={(date) => {
            if (!date) {
              onSelectDay(null);
              return;
            }

            if (!isSameMonth(date, month)) {
              onMonthChange(startOfMonth(date));
            }

            onSelectDay(date);
          }}
          weekStartsOn={0}
          showOutsideDays
          className="w-full min-w-0 [--cell-size:--spacing(12)]"
          classNames={{
            root: '!w-full',
            month: 'w-full gap-3',
            month_caption: 'hidden',
            month_grid: 'w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-2.5',
            weekdays: 'flex w-full',
            weekday: 'flex-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
            week: 'mt-0 flex w-full',
            day: 'aspect-auto h-auto min-w-0 flex-1 p-0 align-top',
            outside: 'opacity-45',
            today: 'bg-transparent text-foreground',
          }}
          components={{
            DayButton: ({ day, modifiers, className, ...rest }) => {
              const key = formatLocalDateKey(day.date);
              const info = porDia.get(key);
              const config = info ? FOLLOWUP_URGENCIA_CONFIG[info.urgencia] : null;
              const topItems = info?.items.slice(0, 2) ?? [];
              const remaining = info ? info.total - topItems.length : 0;
              const isSelected =
                modifiers.selected
                && !modifiers.range_start
                && !modifiers.range_end
                && !modifiers.range_middle;
              const dayIsToday = isToday(day.date);

              return (
                <button
                  {...rest}
                  data-selected-single={isSelected ? true : undefined}
                  data-testid={`followup-month-day-${key}`}
                  className={cn(
                    'flex h-[92px] w-full min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-2.5 text-left transition-all duration-200 sm:h-[102px] sm:p-3 lg:h-[112px]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
                    getUrgenciaSurfaceClass(info?.urgencia),
                    isSelected && 'border-primary/45 bg-primary-50 ring-2 ring-primary/15 shadow-[0_12px_24px_-18px_rgba(37,99,235,0.8)] dark:border-primary/70 dark:bg-primary/20 dark:ring-primary/35',
                    className
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold shadow-sm ring-1 ring-border/65',
                        dayIsToday
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background/90 text-foreground',
                        isSelected && !dayIsToday && 'bg-primary/12 text-primary ring-primary/20'
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    {info ? (
                      <span className="rounded-full bg-background/88 px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm ring-1 ring-border/60">
                        {info.total}
                      </span>
                    ) : dayIsToday ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                        Hoje
                      </span>
                    ) : null}
                  </div>

                  <div className="flex w-full flex-col gap-1">
                    {info ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 rounded-full', config?.dotColor)} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/88">
                            {config?.label}
                          </span>
                        </div>

                        {topItems.map((task, index) => (
                          <span
                            key={`${key}-${task.vencimento_em}-${task.titulo}-${index}`}
                            className="truncate pl-3.5 text-[11px] font-medium text-foreground/85"
                            title={getTaskLabel(task)}
                          >
                            {getTaskLabel(task)}
                          </span>
                        ))}

                        {remaining > 0 ? (
                          <span className="truncate pl-3.5 text-[11px] font-medium text-muted-foreground">
                            +{remaining} outra(s)
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex h-7 items-end">
                        <span className="text-[11px] font-medium text-foreground/70 dark:text-foreground/75">
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

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {FOLLOWUP_URGENCIA_ORDER.map((urgencia) => {
            const config = FOLLOWUP_URGENCIA_CONFIG[urgencia];
            return (
              <span key={urgencia} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', config.dotColor)} />
                {config.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
