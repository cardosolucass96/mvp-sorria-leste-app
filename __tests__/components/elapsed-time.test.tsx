import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import ElapsedTime from '@/components/ui/ElapsedTime';

describe('ElapsedTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('atualiza automaticamente enquanto o atendimento está em aberto', () => {
    jest.setSystemTime(new Date('2026-06-04T20:01:00'));

    render(
      <ElapsedTime
        inicio="2026-06-04 20:00:00"
        refreshMs={1000}
      />
    );

    expect(screen.getByText('1 min')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(screen.getByText('2 min')).toBeInTheDocument();
  });

  test('mantém o valor fixo quando o atendimento já foi encerrado', () => {
    jest.setSystemTime(new Date('2026-06-04T20:05:00'));

    render(
      <ElapsedTime
        inicio="2026-06-04 20:00:00"
        fim="2026-06-04 20:02:00"
        refreshMs={1000}
      />
    );

    expect(screen.getByText('2 min')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(screen.getByText('2 min')).toBeInTheDocument();
  });
});
