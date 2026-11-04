import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Provider, { useGoogleCalendarData } from '@/components/domain/GoogleCalendarProvider';
const fetchMock = jest.fn();
let unit = 1;
let role = 'admin';
jest.mock('@/lib/hooks/useUnitFetch', () => ({ useUnitFetch: () => fetchMock }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, currentUnidade: unit, viewMode: 'admin', hasRole: (roles: string[]) => roles.includes(role) }) }));
const range = { start: '2030-01-01', end: '2030-01-31' };
const reply = (data: unknown) => ({ ok: true, json: async () => data });
const items = [{ event_id: 'one', summary: 'Evento', start_at: '2030-01-10T12:00:00Z', end_at: '2030-01-10T13:00:00Z' }];
function Consumer({ name }: { name: string }) {
  const { data, refresh } = useGoogleCalendarData();
  return <div data-testid={name}>{data.items.length}<button onClick={() => void refresh()}>Atualizar {name}</button></div>;
}
const tree = (dates = range) => <Provider calendarRange={dates}><Consumer name="panel" /><Consumer name="calendar" /></Provider>;
const count = () => fetchMock.mock.calls.filter(([url]) => url.includes('/events?')).length;
const flush = async () => { await act(async () => {}); };
beforeEach(() => {
  jest.useFakeTimers(); unit = 1; role = 'admin';
  fetchMock.mockReset().mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items } : { connected: true, status: 'connected' }));
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
test('two consumers share one request and one periodic refresh; rapid focus reuses fresh data', async () => {
  render(tree()); await flush();
  expect(count()).toBe(1);
  expect(screen.getByTestId('panel')).toHaveTextContent('1');
  expect(screen.getByTestId('calendar')).toHaveTextContent('1');
  fireEvent(window, new Event('focus')); fireEvent(document, new Event('visibilitychange')); await flush();
  expect(count()).toBe(1);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(count()).toBe(2);
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(count()).toBe(2);
});
test('fresh ranges reuse cache and mutation invalidation refreshes both consumers', async () => {
  const { rerender } = render(tree()); await flush();
  rerender(tree({ start: '2030-02-01', end: '2030-02-28' })); await flush();
  expect(count()).toBe(2);
  rerender(tree()); await flush(); expect(count()).toBe(2);
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected' }));
  fireEvent.click(screen.getByText('Atualizar panel')); await flush();
  expect(count()).toBe(3);
  expect(screen.getByTestId('calendar')).toHaveTextContent('0');
});
test('unit change and role revocation cannot reuse another scope cache', async () => {
  const { rerender } = render(tree()); await flush();
  unit = 2;
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected' }));
  rerender(tree()); expect(screen.getByTestId('panel')).toHaveTextContent('0'); await flush();
  expect(count()).toBe(2);
  role = 'executor'; rerender(tree()); await flush();
  expect(screen.getByTestId('calendar')).toHaveTextContent('0'); expect(count()).toBe(2);
});
test('concurrent refreshes do not overlap and a mutation during a request causes a subsequent refresh', async () => {
  let complete!: (value: unknown) => void;
  fetchMock.mockImplementation(async (url: string) => url.includes('/events?') ? new Promise(resolve => { complete = resolve; }) : reply({ connected: true, status: 'connected' }));
  render(tree()); await flush(); expect(count()).toBe(1);
  fireEvent.click(screen.getByText('Atualizar panel'));
  fireEvent.click(screen.getByText('Atualizar calendar'));
  expect(count()).toBe(1);
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected' }));
  await act(async () => { complete(reply({ items })); });
  expect(count()).toBe(2); expect(screen.getByTestId('calendar')).toHaveTextContent('0');
});

test('responsible switch clears previous personal events and scopes every request', async () => {
  const content = (owner: number) => <Provider responsibleId={owner} calendarRange={range}><Consumer name="calendar" /></Provider>;
  const { rerender } = render(content(1)); await flush();
  expect(screen.getByTestId('calendar')).toHaveTextContent('1');
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected' }));
  rerender(content(2)); expect(screen.getByTestId('calendar')).toHaveTextContent('0'); await flush();
  expect(fetchMock.mock.calls.slice(-2).every(([url]) => url.includes('usuario_id=2'))).toBe(true);
});
test('all responsibles mode does not request personal Google events', async () => {
  render(<Provider eventsEnabled={false}><Consumer name="calendar" /></Provider>); await flush();
  expect(count()).toBe(0);
});
