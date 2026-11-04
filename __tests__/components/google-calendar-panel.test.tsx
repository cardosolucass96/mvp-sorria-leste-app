import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Panel from '@/components/domain/GoogleCalendarPanel';
import GoogleCalendarProvider from '@/components/domain/GoogleCalendarProvider';
function GoogleCalendarPanel() { return <GoogleCalendarProvider><Panel /></GoogleCalendarProvider>; }
const fetchMock = jest.fn();
let role = 'admin';
jest.mock('@/lib/hooks/useUnitFetch', () => ({ useUnitFetch: () => fetchMock }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, currentUnidade: 1, viewMode: 'admin',
  hasRole: (roles: string | string[]) => (Array.isArray(roles) ? roles : [roles]).includes(role),
}) }));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
beforeEach(() => { role = 'admin'; fetchMock.mockReset(); });
test('disconnected unit offers connection without exposing credentials', async () => {
  fetchMock.mockResolvedValue(reply({ connected: false, can_manage: true }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByRole('button', { name: 'Conectar Google' })).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google?usuario_id=1'));
  expect(screen.queryByText(/client.secret/i)).not.toBeInTheDocument();
});
test('clinician can configure their own personal calendar', async () => {
  role = 'executor'; fetchMock.mockResolvedValue(reply({ connected: false, can_manage: true, owner_name: 'Alanna' }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByRole('button', { name: 'Conectar Google' })).toBeVisible();
  expect(screen.getByText('Google Agenda · Alanna')).toBeVisible();
});
test('connected unit displays conflicts and schedules retry', async () => {
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/sync?') ? { ok: true } : {
    connected: true, can_manage: true, email: 'agenda@example.test', status: 'error', pending: 2,
    conflicts: [{ agendamento_id: 7, conflict: 'Alterado nos dois sistemas' }],
  }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText(/Agendamento #7/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google/sync?usuario_id=1', expect.objectContaining({ method: 'POST' })));
  expect(await screen.findByText('Atualização solicitada.')).toBeVisible();
});
test('failed connection read shows explicit unavailability', async () => {
  fetchMock.mockResolvedValue(reply({ error: 'Unavailable' }, false));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText('Google Agenda ainda não está disponível neste ambiente.')).toBeVisible();
});

test('connection panel does not display a separate external event list or date filters', async () => {
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : {
    connected: true, can_manage: true, email: 'agenda@example.test', status: 'connected', pending: 0,
  }));
  render(<GoogleCalendarPanel />);
  expect(await screen.findByText(/agenda@example.test/)).toBeVisible();
  expect(screen.queryByText('Eventos externos do Google')).toBeNull();
  expect(screen.queryByLabelText('De')).toBeNull();
  expect(screen.queryByLabelText('Até')).toBeNull();
});

test('administrator selects a writable calendar with explicit preservation notice', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => reply(url.includes('/calendars?')
    ? init?.method === 'PATCH' ? { ok: true } : { items: [{ id: 'primary', name: 'Principal', writable: true }, { id: 'alanna', name: 'Alanna', writable: true }] }
    : url.includes('/events?') ? { items: [] } : { connected: true, can_manage: true, status: 'connected', calendar_id: 'primary', calendar_name: 'Principal' }));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<GoogleCalendarPanel />);
  await screen.findByText('Destino dos agendamentos: Principal');
  fireEvent.click(screen.getByText('Configurações da integração'));
  fireEvent.click(screen.getByRole('button', { name: 'Escolher agendas do Google' }));
  const select = await screen.findByLabelText('Agenda para receber os agendamentos');
  fireEvent.change(select, { target: { value: 'alanna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar destino' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google/calendars?usuario_id=1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ calendar_id: 'alanna' }) })));
  expect(confirm).toHaveBeenCalled(); confirm.mockRestore();
});
test('missing calendar-list permission offers reconnection', async () => {
  fetchMock.mockImplementation(async (url: string) => url.includes('/calendars?')
    ? { status: 403, ...reply({ error: 'Reconecte o Google e autorize a leitura da lista de agendas.' }, false) }
    : reply(url.includes('/events?') ? { items: [] } : { connected: true, can_manage: true, status: 'connected', calendar_id: 'primary' }));
  render(<GoogleCalendarPanel />);
  fireEvent.click(await screen.findByText('Configurações da integração'));
  fireEvent.click(screen.getByRole('button', { name: 'Escolher agendas do Google' }));
  expect(await screen.findByRole('button', { name: 'Reconectar Google' })).toBeVisible();
});

test('multiple view calendars are saved independently of the single writable destination', async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => reply(url.includes('/calendars?')
    ? init?.method === 'PATCH' ? { ok: true } : { items: [{ id: 'primary', name: 'Clínica', writable: true }, { id: 'personal', name: 'Pessoal', writable: false }], visible_calendar_ids: ['primary'] }
    : url.includes('/events?') ? { items: [] } : { connected: true, can_manage: true, status: 'connected', calendar_id: 'primary' }));
  render(<GoogleCalendarPanel />);
  fireEvent.click(await screen.findByText('Configurações da integração'));
  fireEvent.click(screen.getByRole('button', { name: 'Escolher agendas do Google' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Pessoal/ }));
  expect(screen.getByRole('checkbox', { name: 'Clínica' })).toBeChecked();
  expect(screen.queryByRole('option', { name: 'Pessoal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar visualização' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/integracoes/google/calendars?usuario_id=1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ visible_calendar_ids: ['primary','personal'] }) })));
});
