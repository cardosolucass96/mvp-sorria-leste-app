import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoogleCalendarPanel from '@/components/domain/GoogleCalendarPanel';
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

test('loads events automatically and reloads when the period changes, without manual sync controls', async () => {
  fetchMock.mockImplementation(async (url: string) => reply(url.includes('/events?') ? { items: [] } : {
    connected: true, email: 'agenda@example.test', status: 'connected', pending: 0,
  }));
  render(<GoogleCalendarPanel />);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/events?'))).toBe(true));
  expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Buscar eventos' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-01-01' } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('from=2026-01-01'))).toBe(true));
  const before = fetchMock.mock.calls.filter(([url]) => url.includes('/events?')).length;
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes('/events?')).length).toBeGreaterThan(before));
});
