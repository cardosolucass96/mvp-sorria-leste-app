import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleAgendaCalendario from '@/components/domain/GoogleAgendaCalendario';
import { externalEventDays } from '@/modules/google-calendar/calendar-display';
import type { ExternalEvent } from '@/modules/google-calendar/contracts';
const fetchMock = jest.fn();
let unit = 1; let role = 'admin';
jest.mock('@/lib/hooks/useUnitFetch', () => ({ useUnitFetch: () => fetchMock }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ currentUnidade: unit, viewMode: 'admin',
  hasRole: (roles: string[]) => roles.includes(role),
}) }));
const event: ExternalEvent = { event_id: 'external', summary: 'Reunião da equipe', start_at: '2030-01-10T12:00:00Z', end_at: '2030-01-10T13:00:00Z', all_day: 0, recurring: 0 };
const props = { agendamentos: [{ id: 1, cliente_id: 1, cliente_nome: 'Paciente', data_agendada: event.start_at, status: 'agendado' }],
  focusedDate: new Date('2030-01-10T15:00:00Z'), selectedDay: new Date('2030-01-10T15:00:00Z'),
  onSelectDay: jest.fn(), onFocusedDateChange: jest.fn(), onViewChange: jest.fn() };
const reply = (items: ExternalEvent[], extra = {}) => ({ ok: true, json: async () => ({ items, ...extra }) });
beforeEach(() => { unit = 1; role = 'admin'; fetchMock.mockReset(); });
test.each(['mes', 'semana'] as const)('merges native and Google events in %s without clinical actions for external events', async view => {
  fetchMock.mockResolvedValue(reply([event]));
  render(<GoogleAgendaCalendario {...props} view={view} />);
  expect(await screen.findByText(/Google · Reunião da equipe/)).toBeVisible();
  expect(screen.getByText(/Paciente/)).toBeVisible();
  const details = screen.getByRole('region', { name: 'Eventos do Google no dia selecionado' });
  expect(within(details).getByText('Reunião da equipe')).toBeVisible();
  expect(within(details).queryByRole('button')).toBeNull();
});
test('unit switch clears old events immediately and ignores delayed response', async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { rerender } = render(<GoogleAgendaCalendario {...props} view="semana" />);
  unit = 2; fetchMock.mockResolvedValue(reply([]));
  rerender(<GoogleAgendaCalendario {...props} view="semana" />);
  await act(async () => finish(reply([event])));
  expect(screen.queryByText(/Reunião da equipe/)).toBeNull();
});
test('dentist does not fetch unit-wide Google events', () => {
  role = 'executor';
  render(<GoogleAgendaCalendario {...props} view="semana" />);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('navigation loads a new range and reports stale data', async () => {
  fetchMock.mockResolvedValue(reply([event], { stale: true }));
  const { rerender } = render(<GoogleAgendaCalendario {...props} view="semana" />);
  expect(await screen.findByRole('status')).toHaveTextContent('dados salvos');
  rerender(<GoogleAgendaCalendario {...props} focusedDate={new Date('2030-02-10T15:00:00Z')} view="mes" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const range = new URL(fetchMock.mock.calls[1][0], 'https://example.test').searchParams;
  expect(range.get('from')).toBe('2030-01-27T00:00:00-03:00');
  expect(range.get('to')).toBe('2030-03-02T23:59:59.999-03:00');
});
test('all-day end date is exclusive and overnight events occupy both clinic days', () => {
  const days = externalEventDays({ ...event, all_day: 1, start_at: '2030-01-10', end_at: '2030-01-12' }, props.focusedDate, 'mes');
  expect(days.map(day => day.dateKey)).toEqual(['2030-01-10', '2030-01-11']);
  const overnight = externalEventDays({ ...event, start_at: '2030-01-11T02:00:00Z', end_at: '2030-01-11T04:00:00Z' }, props.focusedDate, 'semana');
  expect(overnight.map(day => [day.dateKey, day.time])).toEqual([['2030-01-10', '23:00'], ['2030-01-11', '00:00']]);
});
