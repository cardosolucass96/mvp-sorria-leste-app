import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Panel from '@/components/domain/GoogleCalendarPanel';
import GoogleCalendarProvider from '@/components/domain/GoogleCalendarProvider';
function GoogleCalendarPanel() { return <GoogleCalendarProvider><Panel /></GoogleCalendarProvider>; }
const fetchMock = jest.fn();
let role = 'admin';
jest.mock('@/lib/hooks/useUnitFetch', () => ({ useUnitFetch: () => fetchMock }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ currentUnidade: 1, viewMode: 'admin',
  hasRole: (roles: string | string[]) => (Array.isArray(roles) ? roles : [roles]).includes(role),
}) }));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
beforeEach(() => { role = 'admin'; fetchMock.mockReset(); });
test('disconnected unit offers connection without exposing credentials', async () => {
  fetchMock.mockResolvedValue(reply({ connected: false }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByRole('button', { name: 'Conectar Google' })).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google'));
  expect(screen.queryByText(/client.secret/i)).not.toBeInTheDocument();
});
test('dentist cannot see the unit-wide external calendar or trigger requests', () => {
  role = 'executor';
  render(<GoogleCalendarPanel />);
  expect(screen.queryByRole('region', { name: 'Integração Google Agenda' })).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
test('connected unit displays conflicts and schedules retry', async () => {
  fetchMock.mockImplementation(async (url: string) => reply(url.endsWith('/sync') ? { ok: true } : {
    connected: true, email: 'agenda@example.test', status: 'error', pending: 2,
    conflicts: [{ agendamento_id: 7, conflict: 'Alterado nos dois sistemas' }],
  }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText(/Agendamento #7/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google/sync', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByText('Atualização solicitada.')).toBeVisible();
});
test('failed connection read shows explicit unavailability', async () => {
  fetchMock.mockResolvedValue(reply({ error: 'Unavailable' }, false));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText('Google Agenda ainda não está disponível neste ambiente.')).toBeVisible();
});

test('connection panel does not display a separate external event list or date filters', async () => {
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : {
    connected: true, email: 'agenda@example.test', status: 'connected', pending: 0,
  }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText(/agenda@example.test/)).toBeVisible();
  expect(screen.queryByText('Eventos externos do Google')).toBeNull();
  expect(screen.queryByLabelText('De')).toBeNull();
  expect(screen.queryByLabelText('Até')).toBeNull();
});

test('administrator selects a writable calendar with explicit preservation notice', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => reply(url.endsWith('/calendars')
    ? init?.method === 'PATCH' ? { ok: true } : { items: [{ id: 'primary', name: 'Principal' }, { id: 'alanna', name: 'Alanna' }] }
    : url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected', calendar_id: 'primary', calendar_name: 'Principal' }));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<GoogleCalendarPanel />);
  await screen.findByText('Agenda: Principal');
  fireEvent.click(screen.getByText('Configurações da integração'));
  fireEvent.click(screen.getByRole('button', { name: 'Escolher agenda do Google' }));
  const select = await screen.findByLabelText('Agenda para sincronizar');
  fireEvent.change(select, { target: { value: 'alanna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar agenda' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google/calendars', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ calendar_id: 'alanna' }) })));
  expect(confirm).toHaveBeenCalled(); confirm.mockRestore();
});
test('missing calendar-list permission offers reconnection', async () => {
  fetchMock.mockImplementation(async (url: string) => url.endsWith('/calendars')
    ? { status: 403, ...reply({ error: 'Reconecte o Google e autorize a leitura da lista de agendas.' }, false) }
    : reply(url.includes('/events?') ? { items: [] } : { connected: true, status: 'connected', calendar_id: 'primary' }));
  render(<GoogleCalendarPanel />);
  fireEvent.click(await screen.findByText('Configurações da integração'));
  fireEvent.click(screen.getByRole('button', { name: 'Escolher agenda do Google' }));
  expect(await screen.findByRole('button', { name: 'Reconectar Google' })).toBeVisible();
});
