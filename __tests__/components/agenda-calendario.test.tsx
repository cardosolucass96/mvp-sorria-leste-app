import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import AgendaCalendario from '@/components/domain/AgendaCalendario';
import type { AgendaCalendarView } from '@/lib/utils/agendaCalendar';
import { formatAgendaDateKey } from '@/lib/utils/agendaCalendar';

interface TestAgendamento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  data_agendada: string | null;
  status: string;
}

const AGENDAMENTOS_FIXTURE: TestAgendamento[] = [
  {
    id: 1,
    cliente_id: 10,
    cliente_nome: 'Ana Souza',
    data_agendada: '2026-07-15T09:00',
    status: 'agendado',
  },
  {
    id: 2,
    cliente_id: 10,
    cliente_nome: 'Ana Souza',
    data_agendada: '2026-07-15T09:00',
    status: 'agendado',
  },
  {
    id: 3,
    cliente_id: 11,
    cliente_nome: 'Bruno Lima',
    data_agendada: '2026-07-15T11:00',
    status: 'faltou',
  },
  {
    id: 4,
    cliente_id: 12,
    cliente_nome: 'Carla Dias',
    data_agendada: '2026-07-15T13:00',
    status: 'realizado',
  },
  {
    id: 5,
    cliente_id: 13,
    cliente_nome: 'Diego Paz',
    data_agendada: '2026-07-16',
    status: 'pendente',
  },
];

function AgendaCalendarioHarness({
  initialView = 'mes',
  initialFocusedDate = new Date('2026-07-15T09:00:00'),
}: {
  initialView?: AgendaCalendarView;
  initialFocusedDate?: Date;
}) {
  const [view, setView] = useState<AgendaCalendarView>(initialView);
  const [focusedDate, setFocusedDate] = useState<Date>(initialFocusedDate);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  return (
    <div>
      <AgendaCalendario
        agendamentos={AGENDAMENTOS_FIXTURE}
        view={view}
        onViewChange={setView}
        focusedDate={focusedDate}
        onFocusedDateChange={setFocusedDate}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />
      <div data-testid="current-view">{view}</div>
      <div data-testid="focused-day">{formatAgendaDateKey(focusedDate)}</div>
      <div data-testid="selected-day">{selectedDay ? formatAgendaDateKey(selectedDay) : 'none'}</div>
    </div>
  );
}

describe('AgendaCalendario', () => {
  test('renderiza barrinhas no mês, com overflow e sem incluir "Sem data" na grade', () => {
    render(<AgendaCalendarioHarness initialView="mes" />);

    expect(screen.getByText('09:00 Ana')).toBeInTheDocument();
    expect(screen.getByText('11:00 Bruno')).toBeInTheDocument();
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.getByText('+1 outro(s)')).toBeInTheDocument();
    expect(screen.getByText('+1 outro(s)')).toHaveClass('text-foreground/70');
    expect(screen.queryByText(/^Sem data$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem hora/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^dom$/i)).toBeInTheDocument();
  });

  test('seleciona o dia ao clicar na célula do mês', () => {
    render(<AgendaCalendarioHarness initialView="mes" />);

    fireEvent.click(screen.getByTestId('agenda-month-day-2026-07-15'));

    expect(screen.getByTestId('selected-day')).toHaveTextContent('2026-07-15');
  });

  test('renderiza blocos por horário na semana e navega sete dias para frente', () => {
    render(<AgendaCalendarioHarness initialView="semana" />);

    expect(screen.getByTestId('agenda-week-cell-2026-07-15-9')).toHaveTextContent('09:00');
    expect(screen.getByTestId('agenda-week-cell-2026-07-15-11')).toHaveTextContent('Bruno');

    fireEvent.click(screen.getByTestId('agenda-calendar-next'));

    expect(screen.getByTestId('focused-day')).toHaveTextContent('2026-07-22');
  });

  test('troca entre mês e semana pelo toggle do cabeçalho e permite selecionar um dia da semana', () => {
    render(<AgendaCalendarioHarness initialView="mes" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Semana' }));
    expect(screen.getByTestId('current-view')).toHaveTextContent('semana');

    fireEvent.click(screen.getByTestId('agenda-week-day-2026-07-15'));
    expect(screen.getByTestId('selected-day')).toHaveTextContent('2026-07-15');
  });
});
