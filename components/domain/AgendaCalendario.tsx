'use client';

import { useMemo } from 'react';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar as ShadCalendar } from '@/components/ui/_shadcn/calendar';
import Button from '@/components/ui/Button';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';
import { cn } from '@/lib/utils';
import {
  type AgendaCalendarView,
  formatAgendaDateKey,
  getAgendaDateKey,
  getAgendaHourNumber,
  getAgendaSortMinutes,
  getAgendaTimeLabel,
  hasAgendaExplicitTime,
  isAgendaDateInRange,
  parseAgendaDateTime,
  startOfAgendaMonth,
  startOfAgendaWeek,
  endOfAgendaWeek,
} from '@/lib/utils/agendaCalendar';
import ViewModeToggle from './ViewModeToggle';

interface AgendamentoMinimal {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  data_agendada: string | null;
  status: string;
}

export interface AgendaCalendarioProps<T extends AgendamentoMinimal> {
  agendamentos: T[];
  view: AgendaCalendarView;
  onViewChange: (view: AgendaCalendarView) => void;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
  selectedDay: Date | null;
  onSelectDay: (date: Date | null) => void;
}

interface AgendaEventGroup<T extends AgendamentoMinimal> {
  key: string;
  date: Date;
  dateKey: string;
  hourNumber: number | null;
  sortMinutes: number;
  timeLabel: string;
  hasExplicitTime: boolean;
  clienteId: number;
  clienteNome: string;
  firstName: string;
  statusDom: string;
  total: number;
  items: T[];
}

const STATUS_PRIORIDADE = ['faltou', 'pendente', 'agendado', 'realizado', 'cancelado'] as const;
const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 20;
const LEGEND_STATUSES = ['agendado', 'faltou', 'realizado', 'cancelado'] as const;

const STATUS_EVENT_STYLES: Record<string, string> = {
  faltou: 'border-warning-200 bg-warning-50 text-warning-900 dark:border-warning-500/65 dark:bg-warning-500/18 dark:text-warning-50',
  pendente: 'border-muted bg-muted/65 text-muted-foreground dark:border-muted dark:bg-muted/55',
  agendado: 'border-primary/40 bg-primary/10 text-primary dark:border-primary/70 dark:bg-primary/18',
  realizado: 'border-success-200 bg-success-50 text-success-900 dark:border-success-500/65 dark:bg-success-500/18 dark:text-success-50',
  cancelado: 'border-error-200 bg-error-50 text-error-900 dark:border-error-900/45 dark:bg-error-900/25 dark:text-error-100',
};

const STATUS_LEGEND_DOT: Record<string, string> = {
  agendado: 'bg-primary-500',
  faltou: 'bg-warning-500',
  realizado: 'bg-success-500',
  cancelado: 'bg-error-500',
};

function getFirstName(nome: string): string {
  const [firstName = nome] = nome.trim().split(/\s+/);
  return firstName;
}

function formatMonthLabel(date: Date): string {
  const label = startOfAgendaMonth(date).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatWeekLabel(date: Date): string {
  const start = startOfAgendaWeek(date);
  const end = endOfAgendaWeek(date);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} de ${end.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`;
  }
  return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function shiftMonth(date: Date, delta: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay));
}

function getStatusStyle(status: string): string {
  return STATUS_EVENT_STYLES[status] ?? STATUS_EVENT_STYLES.agendado;
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatDayHeader(date: Date): string {
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${String(date.getDate()).padStart(2, '0')}`;
}

function renderEventLabel<T extends AgendamentoMinimal>(group: AgendaEventGroup<T>): string {
  if (!group.hasExplicitTime) {
    return group.firstName;
  }

  return `${group.timeLabel} ${group.firstName}`;
}

export default function AgendaCalendario<T extends AgendamentoMinimal>({
  agendamentos,
  view,
  onViewChange,
  focusedDate,
  onFocusedDateChange,
  selectedDay,
  onSelectDay,
}: AgendaCalendarioProps<T>) {
  const selectedDayKey = selectedDay ? formatAgendaDateKey(selectedDay) : null;

  const groupedEvents = useMemo(() => {
    const map = new Map<string, AgendaEventGroup<T>>();

    for (const agendamento of agendamentos) {
      if (!agendamento.data_agendada) continue;

      const parsed = parseAgendaDateTime(agendamento.data_agendada);
      if (!parsed) continue;

      const dateKey = getAgendaDateKey(agendamento.data_agendada);
      if (!dateKey) continue;

      const timeLabel = getAgendaTimeLabel(agendamento.data_agendada);
      const groupKey = `${agendamento.cliente_id}_${dateKey}_${timeLabel}`;
      const existing = map.get(groupKey);

      if (!existing) {
        map.set(groupKey, {
          key: groupKey,
          date: parsed,
          dateKey,
          hourNumber: getAgendaHourNumber(agendamento.data_agendada),
          sortMinutes: getAgendaSortMinutes(agendamento.data_agendada),
          timeLabel,
          hasExplicitTime: hasAgendaExplicitTime(agendamento.data_agendada),
          clienteId: agendamento.cliente_id,
          clienteNome: agendamento.cliente_nome,
          firstName: getFirstName(agendamento.cliente_nome),
          statusDom: agendamento.status,
          total: 1,
          items: [agendamento],
        });
        continue;
      }

      existing.total += 1;
      existing.items.push(agendamento);

      const currentPriority = STATUS_PRIORIDADE.indexOf(existing.statusDom as (typeof STATUS_PRIORIDADE)[number]);
      const nextPriority = STATUS_PRIORIDADE.indexOf(agendamento.status as (typeof STATUS_PRIORIDADE)[number]);
      if (nextPriority !== -1 && (currentPriority === -1 || nextPriority < currentPriority)) {
        existing.statusDom = agendamento.status;
      }
    }

    return Array.from(map.values()).sort((left, right) => (
      left.date.getTime() - right.date.getTime()
      || left.sortMinutes - right.sortMinutes
      || left.clienteNome.localeCompare(right.clienteNome)
    ));
  }, [agendamentos]);

  const monthEventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEventGroup<T>[]>();
    for (const group of groupedEvents) {
      const dayGroups = map.get(group.dateKey) ?? [];
      dayGroups.push(group);
      map.set(group.dateKey, dayGroups);
    }
    return map;
  }, [groupedEvents]);

  const weekDays = useMemo(() => {
    const start = startOfAgendaWeek(focusedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [focusedDate]);

  const weekEventGroups = useMemo(() => {
    const start = startOfAgendaWeek(focusedDate);
    const end = endOfAgendaWeek(focusedDate);
    return groupedEvents.filter((group) => isAgendaDateInRange(group.date, start, end));
  }, [focusedDate, groupedEvents]);

  const weekHours = useMemo(() => {
    let startHour = WEEK_START_HOUR;
    let endHour = WEEK_END_HOUR;

    for (const group of weekEventGroups) {
      if (group.hourNumber === null) continue;
      startHour = Math.min(startHour, group.hourNumber);
      endHour = Math.max(endHour, group.hourNumber);
    }

    return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  }, [weekEventGroups]);

  const weekUntimedGroups = useMemo(() => {
    const map = new Map<string, AgendaEventGroup<T>[]>();
    for (const group of weekEventGroups) {
      if (group.hourNumber !== null) continue;
      const groups = map.get(group.dateKey) ?? [];
      groups.push(group);
      map.set(group.dateKey, groups);
    }
    return map;
  }, [weekEventGroups]);

  const weekTimedGroups = useMemo(() => {
    const map = new Map<string, AgendaEventGroup<T>[]>();
    for (const group of weekEventGroups) {
      if (group.hourNumber === null) continue;
      const key = `${group.dateKey}_${group.hourNumber}`;
      const groups = map.get(key) ?? [];
      groups.push(group);
      map.set(key, groups);
    }
    return map;
  }, [weekEventGroups]);

  const hasUntimedWeekGroups = useMemo(
    () => Array.from(weekUntimedGroups.values()).some((groups) => groups.length > 0),
    [weekUntimedGroups]
  );

  const handleNavigate = (direction: -1 | 1) => {
    if (view === 'mes') {
      onFocusedDateChange(shiftMonth(focusedDate, direction));
      return;
    }

    const next = new Date(focusedDate);
    next.setDate(next.getDate() + (direction * 7));
    onFocusedDateChange(next);
  };

  return (
    <div className="w-full overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-b from-surface via-surface to-background shadow-[0_18px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(234,88,12,0.15),transparent_34%),linear-gradient(180deg,var(--color-surface),color-mix(in srgb,var(--color-surface) 88%, #000 12%))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              Calendário operacional
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {view === 'mes' ? formatMonthLabel(focusedDate) : formatWeekLabel(focusedDate)}
            </h3>
            <p className="text-sm text-muted-foreground">
              {view === 'mes'
                ? 'Veja o volume do mês e clique em um dia para abrir a lateral com os agendamentos.'
                : 'Acompanhe a semana por horário e clique em um bloco para focar o dia na lateral.'}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <ViewModeToggle
              options={[
                { key: 'mes', label: 'Mês' },
                { key: 'semana', label: 'Semana' },
              ]}
              active={view}
              onChange={(nextView) => onViewChange(nextView as AgendaCalendarView)}
              className="self-start sm:self-auto"
            />

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={view === 'mes' ? 'Mês anterior' : 'Semana anterior'}
                data-testid="agenda-calendar-prev"
                onClick={() => handleNavigate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={view === 'mes' ? 'Próximo mês' : 'Próxima semana'}
                data-testid="agenda-calendar-next"
                onClick={() => handleNavigate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5">
        {view === 'mes' ? (
          <ShadCalendar
            mode="single"
            hideNavigation
            locale={ptBR}
            month={startOfAgendaMonth(focusedDate)}
            onMonthChange={(nextMonth) => onFocusedDateChange(nextMonth)}
            selected={selectedDay ?? undefined}
            onSelect={(date) => {
              if (!date) {
                onSelectDay(null);
                return;
              }

              if (
                date.getMonth() !== focusedDate.getMonth()
                || date.getFullYear() !== focusedDate.getFullYear()
              ) {
                onFocusedDateChange(date);
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
                const dayKey = formatAgendaDateKey(day.date);
                const dayGroups = monthEventsByDay.get(dayKey) ?? [];
                const topGroups = dayGroups.slice(0, 2);
                const remaining = dayGroups.length - topGroups.length;
                const isSelected =
                  modifiers.selected
                  && !modifiers.range_start
                  && !modifiers.range_end
                  && !modifiers.range_middle;

                return (
                  <button
                    {...rest}
                    data-selected-single={isSelected ? true : undefined}
                    data-testid={`agenda-month-day-${dayKey}`}
                    className={cn(
                      'flex h-[92px] w-full min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-2.5 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary-50/55 dark:hover:border-primary/55 dark:hover:bg-primary/16 sm:h-[102px] sm:p-3 lg:h-[112px]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
                      isSelected && 'border-primary/45 bg-primary-50 ring-2 ring-primary/15 shadow-[0_12px_24px_-18px_rgba(37,99,235,0.8)] dark:border-primary/70 dark:bg-primary/20 dark:ring-primary/35',
                      className
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold shadow-sm ring-1 ring-border/65',
                          modifiers.today
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background/90 text-foreground',
                        isSelected && !modifiers.today && 'bg-primary/12 text-primary ring-primary/20 dark:bg-primary/25 dark:text-primary-50 dark:ring-primary/45'
                        )}
                      >
                        {day.date.getDate()}
                      </span>
                      {dayGroups.length > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                          {dayGroups.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex w-full flex-col gap-1">
                      {topGroups.map((group) => (
                        <span
                          key={group.key}
                          className={cn(
                            'inline-flex min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm',
                            getStatusStyle(group.statusDom)
                          )}
                        >
                          <span className="truncate">{renderEventLabel(group)}</span>
                          {group.total > 1 ? (
                            <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold">
                              +{group.total - 1}
                            </span>
                          ) : null}
                        </span>
                      ))}

                      {remaining > 0 ? (
                        <span className="truncate pl-1 text-[11px] font-medium text-muted-foreground">
                          +{remaining} outro(s)
                        </span>
                      ) : (
                        <span className="h-4" />
                      )}
                    </div>
                  </button>
                );
              },
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <div className="min-w-[880px] space-y-3">
                {hasUntimedWeekGroups ? (
                  <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-2">
                    <div className="flex items-start justify-end pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Sem hora
                    </div>
                    {weekDays.map((date) => {
                      const dateKey = formatAgendaDateKey(date);
                      const groups = weekUntimedGroups.get(dateKey) ?? [];
                      return (
                        <div
                          key={`untimed-${dateKey}`}
                          className={cn(
                            'min-h-16 rounded-2xl border border-border/70 bg-background/88 p-2',
                            selectedDayKey === dateKey && 'border-primary/40 bg-primary-50/55 dark:border-primary/60 dark:bg-primary/16'
                          )}
                          onClick={() => onSelectDay(date)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectDay(date);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="mb-2 text-xs font-semibold text-foreground">
                            {formatDayHeader(date)}
                          </div>
                          <div className="space-y-1.5">
                            {groups.map((group) => (
                              <button
                                key={group.key}
                                type="button"
                                className={cn(
                                  'flex w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] font-medium shadow-sm',
                                  getStatusStyle(group.statusDom)
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onSelectDay(date);
                                }}
                              >
                                <span className="truncate">{group.firstName}</span>
                                {group.total > 1 ? (
                                  <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold">
                                    {group.total}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-2">
                  <div />
                  {weekDays.map((date) => {
                    const dateKey = formatAgendaDateKey(date);
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        data-testid={`agenda-week-day-${dateKey}`}
                        onClick={() => onSelectDay(date)}
                        className={cn(
                          'rounded-2xl border border-border/70 bg-background/88 px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/35 hover:bg-primary-50/55 dark:hover:border-primary/55 dark:hover:bg-primary/16',
                          selectedDayKey === dateKey && 'border-primary/45 bg-primary-50 dark:border-primary/65 dark:bg-primary/20'
                        )}
                      >
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                        </span>
                        <span className="block text-base font-semibold text-foreground">
                          {String(date.getDate()).padStart(2, '0')}
                        </span>
                      </button>
                    );
                  })}

                  {weekHours.map((hour) => (
                    <div key={`hour-${hour}`} className="contents">
                      <div className="flex items-start justify-end pt-3 pr-2 text-xs font-semibold text-muted-foreground">
                        {formatHourLabel(hour)}
                      </div>
                      {weekDays.map((date) => {
                        const dateKey = formatAgendaDateKey(date);
                        const cellGroups = weekTimedGroups.get(`${dateKey}_${hour}`) ?? [];

                        return (
                          <div
                            key={`${dateKey}-${hour}`}
                            data-testid={`agenda-week-cell-${dateKey}-${hour}`}
                            className={cn(
                              'min-h-20 rounded-2xl border border-border/70 bg-background/88 p-2 shadow-sm transition-colors',
                              selectedDayKey === dateKey && 'border-primary/40 bg-primary-50/55 dark:border-primary/60 dark:bg-primary/16'
                            )}
                            onClick={() => onSelectDay(date)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectDay(date);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="space-y-1.5">
                              {cellGroups.map((group) => (
                                <button
                                  key={group.key}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] font-medium shadow-sm',
                                    getStatusStyle(group.statusDom)
                                  )}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectDay(date);
                                  }}
                                >
                                  <span className="shrink-0 font-semibold">{group.timeLabel}</span>
                                  <span className="truncate">{group.firstName}</span>
                                  {group.total > 1 ? (
                                    <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold">
                                      {group.total}
                                    </span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {LEGEND_STATUSES.map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_LEGEND_DOT[status])} />
              {AGENDAMENTO_STATUS_CONFIG[status].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
