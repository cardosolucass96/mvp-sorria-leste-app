import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import FollowupCalendario from '@/components/domain/FollowupCalendario';
import { formatLocalDateKey } from '@/lib/utils/followup';

interface TestTarefa {
  titulo: string;
  vencimento_em: string;
  status: 'aberta' | 'concluida';
}

const TAREFAS_FIXTURE: TestTarefa[] = [
  {
    titulo: 'Ligar Ana',
    vencimento_em: '2026-07-15 09:00:00',
    status: 'aberta',
  },
  {
    titulo: 'Cobrar Bruno',
    vencimento_em: '2026-07-15 11:00:00',
    status: 'aberta',
  },
  {
    titulo: 'Enviar proposta',
    vencimento_em: '2026-07-15 13:30:00',
    status: 'aberta',
  },
  {
    titulo: 'Retorno concluído',
    vencimento_em: '2026-07-20 10:00:00',
    status: 'concluida',
  },
];

function FollowupCalendarioHarness() {
  const [month, setMonth] = useState(new Date('2026-07-01T00:00:00'));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  return (
    <div>
      <FollowupCalendario
        tarefas={TAREFAS_FIXTURE}
        month={month}
        onMonthChange={setMonth}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />
      <div data-testid="current-month">{formatLocalDateKey(month)}</div>
      <div data-testid="selected-day">{selectedDay ? formatLocalDateKey(selectedDay) : 'none'}</div>
    </div>
  );
}

describe('FollowupCalendario', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renderiza o mês em português e mostra tarefas resumidas no dia', () => {
    render(<FollowupCalendarioHarness />);

    expect(screen.getByText('Julho de 2026')).toBeInTheDocument();
    expect(screen.getByText('09:00 Ligar Ana')).toBeInTheDocument();
    expect(screen.getByText('11:00 Cobrar Bruno')).toBeInTheDocument();
    expect(screen.getByText('+1 outra(s)')).toBeInTheDocument();
  });

  test('seleciona o dia ao clicar na célula do mês', () => {
    render(<FollowupCalendarioHarness />);

    fireEvent.click(screen.getByTestId('followup-month-day-2026-07-15'));

    expect(screen.getByTestId('selected-day')).toHaveTextContent('2026-07-15');
  });

  test('navega para o próximo mês pelo cabeçalho', () => {
    render(<FollowupCalendarioHarness />);

    fireEvent.click(screen.getByTestId('followup-calendar-next'));

    expect(screen.getByTestId('current-month')).toHaveTextContent('2026-08-01');
  });
});
