import { webcrypto } from 'node:crypto';
import { getDb } from '@/lib/db';
import { createSqliteDb } from '../helpers/sqlite-db.cjs';
import { __setMockDb, __resetMocks, __setMockEnv } from '../../__mocks__/opennextjs-cloudflare';
import { applyRemote, processConnection, loadAppointment } from '@/modules/google-calendar/server/sync';
import { encrypt, decrypt, digest } from '@/modules/google-calendar/server/crypto';
import { localSnapshot, remoteSnapshot, toGoogle } from '@/modules/google-calendar/server/mapping';
import { authorize, completeAuthorization } from '@/modules/google-calendar/server/oauth';
import { resolveConflict, linkExternal } from '@/modules/google-calendar/server/actions';
import type { GoogleConnection, GoogleEvent, Appointment } from '@/modules/google-calendar/contracts';
import type { GoogleConfig } from '@/modules/google-calendar/server/google-api';
import { POST as webhook } from '@/app/api/integracoes/google/webhook/route';
import { GET as events } from '@/app/api/integracoes/google/events/route';
import { GET as backfillPreview, POST as backfill } from '@/app/api/integracoes/google/backfill/route';
import { callRoute } from '../helpers/api-test-helper';
import { verifyToken } from '@/lib/auth/jwt';

jest.mock('@/lib/auth/jwt', () => ({ extractToken: jest.fn().mockReturnValue('test'), verifyToken: jest.fn() }));
Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const config: GoogleConfig = { clientId: 'test-client', clientSecret: 'test-secret',
  encryptionKey: Buffer.alloc(32, 7).toString('base64'), baseUrl: 'https://example.test', enabled: true };
let db: ReturnType<typeof createSqliteDb>;
let fetchMock: jest.Mock;
const originalFetch = globalThis.fetch;
function connection(): GoogleConnection { return db.sqlite.prepare('SELECT * FROM google_user_calendar_connections WHERE id=?').get('conn'); }
function appointment(): Appointment { return { ...db.sqlite.prepare('SELECT * FROM agendamentos WHERE id=1').get(), cliente_nome: 'Paciente' }; }
function row(sql: string) { return db.sqlite.prepare(sql).get(); }
function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return { id: 'remote', etag: 'v1', status: 'confirmed', summary: 'Teste',
    start: { dateTime: '2030-01-10T12:00:00.000Z' }, end: { dateTime: '2030-01-10T12:30:00.000Z' }, ...overrides };
}
function createAppointment() {
  db.sqlite.exec(`INSERT INTO agendamentos(id,cliente_id,unidade_id,executor_id,tipo,status,data_agendada) VALUES (1,1,1,1,'avaliacao','agendado','2030-01-10T12:00:00.000Z')`);
}
function mirror(remote = event()) {
  db.sqlite.prepare('INSERT INTO google_user_calendar_links(connection_id,agendamento_id,event_id,etag,remote_snapshot) VALUES (?,?,?,?,?)')
    .run('conn', 1, remote.id, remote.etag, remoteSnapshot(remote));
  db.sqlite.exec('DELETE FROM google_user_calendar_outbox');
}
const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(async () => {
  db = createSqliteDb(); __setMockDb(db.binding);
  __setMockEnv({ GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_TOKEN_ENCRYPTION_KEY: config.encryptionKey, GOOGLE_APP_BASE_URL: config.baseUrl });
  db.sqlite.exec(`INSERT INTO unidades(id,nome) VALUES (1,'Um'),(2,'Dois');
    INSERT INTO usuarios(id,nome,email,role) VALUES (1,'Admin','admin@example.test','admin');
    INSERT INTO clientes(id,nome) VALUES (1,'Paciente');`);
  db.sqlite.prepare(`INSERT INTO google_user_calendar_connections(id,usuario_id,unidade_id,connected_by,google_subject,email,calendar_id,refresh_token)
    VALUES ('conn',1,1,1,'subject','calendar@example.test','calendar@example.test',?)`).run(await encrypt('refresh', config.encryptionKey, 'conn'));
  db.sqlite.prepare('INSERT INTO google_user_calendar_channels(id,connection_id,token_hash,resource_id,expires_at) VALUES (?,?,?,?,?)')
    .run('channel', 'conn', await digest('channel-secret'), 'resource', Date.now() + 7 * 86400000);
  jest.mocked(verifyToken).mockResolvedValue({ sub: 1, nome: 'Admin', email: 'admin@example.test', role: 'admin', roles: ['admin'], iat: 0, exp: 4102444800, unidade_ids: [1], unidade_atual: 1 });
  fetchMock = jest.fn(); globalThis.fetch = fetchMock;
});
afterEach(() => { globalThis.fetch = originalFetch; __resetMocks(); db.sqlite.close(); });

test('outbox covers direct MCP inserts and updates atomically, without unrelated financial writes', () => {
  createAppointment();
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  db.sqlite.exec("UPDATE agendamentos SET valor_pago=10 WHERE id=1");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  db.sqlite.exec("BEGIN; UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z' WHERE id=1; ROLLBACK;");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z' WHERE id=1");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(2);
});

test('unit without connection creates no sync jobs', () => {
  db.sqlite.exec("INSERT INTO agendamentos(cliente_id,unidade_id,tipo) VALUES (1,2,'avaliacao')");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
});

test('encryption is bound to connection and rejects tampering', async () => {
  const token = await encrypt('sensitive', config.encryptionKey, 'conn');
  expect(token).not.toContain('sensitive');
  expect(await decrypt(token, config.encryptionKey, 'conn')).toBe('sensitive');
  await expect(decrypt(token, config.encryptionKey, 'other')).rejects.toThrow();
});

test('Google reschedule updates appointment without echo or clinical/financial changes', async () => {
  createAppointment();
  db.sqlite.exec("UPDATE agendamentos SET observacoes='Privado',valor_pago=80 WHERE id=1");
  mirror();
  await applyRemote(getDb(), connection(), event({ etag: 'v2', start: { dateTime: '2030-01-10T15:00:00Z' }, end: { dateTime: '2030-01-10T15:45:00Z' } }));
  expect(row('SELECT data_agendada,duracao_minutos,observacoes,valor_pago FROM agendamentos')).toMatchObject({ data_agendada: '2030-01-10T15:00:00.000Z', duracao_minutos: 45, observacoes: 'Privado', valor_pago: 80 });
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z' WHERE id=1");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
});

test('Google cancellation records reason; duplicate webhook application is harmless', async () => {
  createAppointment(); mirror();
  await applyRemote(getDb(), connection(), event({ status: 'cancelled', etag: 'v2' }));
  await applyRemote(getDb(), connection(), event({ status: 'cancelled', etag: 'v2' }));
  expect(row('SELECT status,motivo_cancelamento FROM agendamentos')).toMatchObject({ status: 'cancelado', motivo_cancelamento: 'Cancelado no Google Agenda' });
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeNull();
});

test('simultaneous changes preserve local state and require conflict resolution', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z' WHERE id=1");
  await applyRemote(getDb(), connection(), event({ start: { dateTime: '2030-01-12T12:00:00Z' }, end: { dateTime: '2030-01-12T12:30:00Z' } }));
  expect(row('SELECT data_agendada FROM agendamentos').data_agendada).toBe('2030-01-11T12:00:00Z');
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toContain('dois sistemas');
});

test.each(['realizado','faltou','cancelado'])('external edits never reopen %s appointments', async status => {
  createAppointment(); mirror();
  db.sqlite.prepare('UPDATE agendamentos SET status=? WHERE id=1').run(status);
  db.sqlite.exec('DELETE FROM google_user_calendar_outbox');
  await applyRemote(getDb(), connection(), event({ start: { dateTime: '2030-01-12T12:00:00Z' } }));
  expect(row('SELECT status FROM agendamentos').status).toBe(status);
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeTruthy();
});

test('new external events do not fabricate patients or appointments', async () => {
  await applyRemote(getDb(), connection(), event());
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_events').n).toBe(1);
});

test.each([
  { start: { date: '2030-01-12' }, end: { date: '2030-01-13' } },
  { recurrence: ['RRULE:FREQ=WEEKLY'] },
])('all-day/recurring changes require review rather than midnight or partial-series consultation', async change => {
  createAppointment(); mirror();
  await applyRemote(getDb(), connection(), event(change));
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeTruthy();
  expect(row('SELECT data_agendada FROM agendamentos').data_agendada).toBe('2030-01-10T12:00:00.000Z');
});

test('webhook authenticates channel token and resource before scheduling', async () => {
  db.sqlite.exec('UPDATE google_user_calendar_connections SET sync_requested=0');
  for (const [token, resource] of [['wrong','resource'], ['channel-secret','wrong']]) {
    expect((await callRoute(webhook, '/api/integracoes/google/webhook', { method: 'POST', headers: { 'x-goog-channel-id': 'channel', 'x-goog-channel-token': token, 'x-goog-resource-id': resource } })).status).toBe(204);
    expect(connection().sync_requested).toBe(0);
  }
  await callRoute(webhook, '/api/integracoes/google/webhook', { method: 'POST', headers: { 'x-goog-channel-id': 'channel', 'x-goog-channel-token': 'channel-secret', 'x-goog-resource-id': 'resource' } });
  expect(connection().sync_requested).toBe(1);
});

test('personal calendar follows user across units and clinicians can read their own calendar', async () => {
  await applyRemote(getDb(), connection(), event());
  const path = '/api/integracoes/google/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z';
  const own = await callRoute<{ items: unknown[] }>(events, path);
  expect(own.data.items).toHaveLength(1);
  const other = await callRoute<{ items: unknown[] }>(events, path, { headers: { 'X-Unidade-Id': '2' } });
  expect(other.data.items).toHaveLength(1);
  jest.mocked(verifyToken).mockResolvedValue({ sub: 1, nome: 'Dentista', email: 'dentist@example.test', role: 'executor', roles: ['executor'], iat: 0, exp: 4102444800, unidade_ids: [1], unidade_atual: 1 });
  db.sqlite.exec("UPDATE usuarios SET role='executor' WHERE id=1; INSERT INTO usuario_unidades(usuario_id,unidade_id) VALUES (1,1)");
  expect((await callRoute(events, path)).status).toBe(200);
});

test('OAuth state is browser-bound, expires, and is consumed once', async () => {
  const auth = await authorize(getDb(), config, 1, 1);
  const state = new URL(auth.url).searchParams.get('state')!;
  await expect(completeAuthorization(getDb(), config, state, 'other-browser', 'code')).rejects.toThrow('expirada');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(response({ error: 'invalid_grant' }, 400));
  await expect(completeAuthorization(getDb(), config, state, auth.browser, 'code')).rejects.toThrow();
  await expect(completeAuthorization(getDb(), config, state, auth.browser, 'code')).rejects.toThrow('expirada');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('initial full sync drains pages and advances cursor only on the final page', async () => {
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockResolvedValueOnce(response({ items: [event()], nextPageToken: 'page2' }))
    .mockImplementationOnce(async () => {
      expect(connection().sync_token).toBeNull();
      return response({ items: [event({ id: 'second' })], nextSyncToken: 'cursor' });
    });
  await processConnection(getDb(), config, 'conn');
  expect(connection().sync_token).toBe('cursor');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_events').n).toBe(2);
  expect(connection().lease_owner).toBeNull();
});

test('expired cursor resets Google cache but preserves native appointments', async () => {
  createAppointment(); db.sqlite.exec("DELETE FROM google_user_calendar_outbox; UPDATE google_user_calendar_connections SET sync_token='expired'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockResolvedValueOnce(response({}, 410)).mockResolvedValueOnce(response({ items: [], nextSyncToken: 'fresh' }));
  await processConnection(getDb(), config, 'conn');
  expect(connection().sync_token).toBe('fresh');
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(1);
});

test('uncertain Google insert retries with same event ID, without duplicates', async () => {
  createAppointment();
  let remote: GoogleEvent | null = null; let inserts = 0;
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (init.method === 'POST') {
      inserts++; remote = { ...JSON.parse(init.body as string), etag: 'v1' };
      throw new Error('Response lost after Google committed');
    }
    if (init.method === 'PATCH') { remote = { ...remote, ...JSON.parse(init.body as string), etag: 'v2' }; return response(remote); }
    if (url.includes('?maxResults')) return response({ items: remote ? [remote] : [], nextSyncToken: 'cursor' });
    return remote ? response(remote) : response({}, 404);
  });
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  const id = row('SELECT event_id FROM google_user_calendar_links').event_id;
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT event_id FROM google_user_calendar_links').event_id).toBe(id);
  expect(inserts).toBe(1);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
});

test('network failure retains outbox; revocation requires reconnection', async () => {
  createAppointment();
  fetchMock.mockResolvedValueOnce(response({}, 503));
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  expect(connection().status).toBe('error');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  fetchMock.mockResolvedValueOnce(response({}, 400));
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  expect(connection().status).toBe('reconnect');
});

test('lease prevents two sync jobs from running for the same account', async () => {
  db.sqlite.prepare('UPDATE google_user_calendar_connections SET lease_until=?').run(Date.now() + 60000);
  await processConnection(getDb(), config, 'conn');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('backfill is explicit and idempotent', async () => {
  createAppointment(); db.sqlite.exec('DELETE FROM google_user_calendar_outbox');
  expect((await callRoute<{ total: number }>(backfillPreview, '/api/integracoes/google/backfill')).data.total).toBe(1);
  expect((await callRoute(backfill, '/api/integracoes/google/backfill', { method: 'POST', body: {} })).status).toBe(400);
  for (let i = 0; i < 2; i++) expect((await callRoute(backfill, '/api/integracoes/google/backfill', { method: 'POST', body: { confirm: true } })).status).toBe(200);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
});

test('empty appointment description omits unrelated data', () => {
  createAppointment();
  const payload = toGoogle(appointment(), connection(), 'id', config.baseUrl);
  expect(Object.keys(payload)).not.toContain('attendees');
  expect(payload.description).toBe('Agendamento #1\nhttps://example.test/agenda');
});

test('linking validates appointment unit before creating a mirror', async () => {
  createAppointment(); db.sqlite.exec('UPDATE agendamentos SET unidade_id=2 WHERE id=1');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response(event()));
  await expect(linkExternal(getDb(), config, 1, 1, 'remote', 1)).rejects.toThrow('desta unidade');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_links').n).toBe(0);
});

test('choosing Google for conflict uses fresh event and clears only acknowledged work', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z' WHERE id=1; UPDATE google_user_calendar_links SET conflict='conflict'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response(event({ etag: 'v3' })));
  await resolveConflict(getDb(), config, 1, 1, 'google', 1);
  expect(row('SELECT data_agendada FROM agendamentos').data_agendada).toBe('2030-01-10T12:00:00.000Z');
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeNull();
});

test('page failure resumes from persisted page without advancing incremental cursor', async () => {
  db.sqlite.exec("UPDATE google_user_calendar_connections SET sync_token='previous'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockResolvedValueOnce(response({ items: [event()], nextPageToken: 'page-two' }))
    .mockResolvedValueOnce(response({}, 503));
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  expect(connection().sync_token).toBe('previous');
  expect(connection().sync_page_token).toBe('page-two');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockImplementationOnce(async (url: string) => {
      expect(url).toContain('pageToken=page-two');
      expect(url).toContain('syncToken=previous');
      return response({ items: [], nextSyncToken: 'next' });
    });
  await processConnection(getDb(), config, 'conn');
  expect(connection().sync_token).toBe('next');
  expect(connection().sync_page_token).toBeNull();
});

test('full resync checks linked events absent from Google and applies remote cancellation', async () => {
  createAppointment(); mirror();
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockResolvedValueOnce(response({ items: [], nextSyncToken: 'next' }))
    .mockResolvedValueOnce(response({}, 404));
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT status FROM agendamentos').status).toBe('cancelado');
});

test('watch renewal persists replacement before retiring the previous channel', async () => {
  db.sqlite.prepare('UPDATE google_user_calendar_channels SET expires_at=?').run(Date.now() + 3600000);
  let newChannel = '';
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.endsWith('/watch')) {
      const body = JSON.parse(init.body as string); newChannel = body.id;
      expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_channels').n).toBe(2);
      expect(body.token).not.toBe('conn');
      return response({ id: body.id, resourceId: 'new-resource', expiration: String(Date.now() + 7 * 86400000) });
    }
    if (url.endsWith('channels/stop')) {
      expect(db.sqlite.prepare('SELECT resource_id FROM google_user_calendar_channels WHERE id=?').get(newChannel).resource_id).toBe('new-resource');
      return response(null, 204);
    }
    return response({ items: [], nextSyncToken: 'cursor' });
  });
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_channels').n).toBe(1);
  expect(row('SELECT id FROM google_user_calendar_channels').id).toBe(newChannel);
});

test('equivalent timestamps in different offsets do not produce conflicts', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET executor_id=1 WHERE id=1");
  await applyRemote(getDb(), connection(), event({ start: { dateTime: '2030-01-10T09:00:00-03:00' }, end: { dateTime: '2030-01-10T09:30:00-03:00' } }));
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeNull();
});

test('disconnect removes tokens and mappings without deleting clinical or Google events', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE google_user_calendar_connections SET status='disconnecting'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response(null, 204));
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_connections').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(1);
  expect(fetchMock.mock.calls.some(call => call[1]?.method === 'DELETE')).toBe(false);
});

test('OAuth reconnection saves encrypted tokens and preserves existing appointments without backfill', async () => {
  createAppointment(); db.sqlite.exec('DELETE FROM google_user_calendar_outbox');
  const auth = await authorize(getDb(), config, 1, 1);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'renewed-refresh', scope: 'openid email https://www.googleapis.com/auth/calendar.events' }))
    .mockResolvedValueOnce(response({ sub: 'subject', email: 'calendar@example.test', email_verified: true }));
  await completeAuthorization(getDb(), config, new URL(auth.url).searchParams.get('state')!, auth.browser, 'code');
  expect(await decrypt(connection().refresh_token, config.encryptionKey, 'conn')).toBe('renewed-refresh');
  expect(connection().refresh_token).not.toContain('renewed-refresh');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(1);
});

test('Google updates made while outbound request is pending are protected with If-Match', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-12T12:00:00Z' WHERE id=1");
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('?maxResults')) return response({ items: [event()], nextSyncToken: 'next' });
    if (init.method === 'PATCH') {
      expect(init.headers).toMatchObject({ 'If-Match': 'v1' });
      return response({}, 412);
    }
    return response(event());
  });
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow('mudou');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
});

test.each([false, true])('lost update response recovers and preserves newer local edits (%s)', async (laterEdit) => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-12T12:00:00Z' WHERE id=1");
  let remote = event(); let patched = false;
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('?maxResults')) return response({ items: [remote], nextSyncToken: 'cursor' });
    if (init.method === 'PATCH') {
      remote = { ...remote, ...JSON.parse(init.body as string), etag: 'v2' };
      if (!patched) { patched = true; throw new Error('response lost after update committed'); }
      return response(remote);
    }
    return response(remote);
  });
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  if (laterEdit) db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-15T12:00:00Z' WHERE id=1");
  await processConnection(getDb(), config, 'conn');
  expect(remote.start?.dateTime).toBe(laterEdit ? '2030-01-15T12:00:00.000Z' : '2030-01-12T12:00:00.000Z');
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toBeNull();
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
});

test.each([false, true])('disconnect/reconnect reuses mirrors and sends offline edits (%s)', async (offlineEdit) => {
  createAppointment(); mirror();
  db.sqlite.prepare('UPDATE google_user_calendar_links SET local_snapshot=?').run(localSnapshot(appointment()));
  const oldEvent = event({ extendedProperties: { private: { sorriaConnection: 'conn', sorriaAppointment: '1' } } });
  db.sqlite.exec("UPDATE google_user_calendar_connections SET status='disconnecting'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response(null, 204));
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_connections').n).toBe(0);
  expect(JSON.stringify(row('SELECT * FROM google_user_calendar_archives'))).not.toContain('refresh_token');
  if (offlineEdit) db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-15T12:00:00Z' WHERE id=1");
  const auth = await authorize(getDb(), config, 1, 1);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', scope: 'openid email https://www.googleapis.com/auth/calendar.events' }))
    .mockResolvedValueOnce(response({ sub: 'subject', email: 'calendar@example.test', email_verified: true }));
  await completeAuthorization(getDb(), config, new URL(auth.url).searchParams.get('state')!, auth.browser, 'code');
  const fresh = row('SELECT id FROM google_user_calendar_connections').id;
  db.sqlite.prepare('INSERT INTO google_user_calendar_channels(id,connection_id,token_hash,resource_id,expires_at) VALUES (?,?,?,?,?)')
    .run('new-channel', fresh, await digest('token'), 'resource', Date.now() + 7*86400000);
  await callRoute(backfill, '/api/integracoes/google/backfill', { method: 'POST', body: { confirm: true } });
  let inserts = 0; let patches = 0;
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('?maxResults')) return response({ items: [oldEvent], nextSyncToken: 'cursor' });
    if (init.method === 'PATCH') { patches++; return response({ ...oldEvent, ...JSON.parse(init.body as string), etag: 'v2' }); }
    if (url.endsWith('/remote')) return response(oldEvent);
    if (init.method === 'POST') { inserts++; return response({ ...JSON.parse(init.body as string), etag: 'new' }); }
    return response({}, 404);
  });
  await processConnection(getDb(), config, fresh);
  expect(inserts).toBe(0);
  expect(patches).toBe(offlineEdit ? 1 : 0);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
});

test('lost cancellation response recovers without false conflict or reopening the appointment', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET status='cancelado' WHERE id=1");
  let remote = event();
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('?maxResults')) return response({ items: [remote], nextSyncToken: 'cursor' });
    if (init.method === 'DELETE') { remote = event({ status: 'cancelled' }); throw new Error('response lost'); }
    return response(remote);
  });
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_links').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
  expect(appointment().status).toBe('cancelado');
});

test('a genuine Google edit after an uncertain write still requires conflict resolution', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-12T12:00:00Z' WHERE id=1");
  let remote = event();
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('?maxResults')) return response({ items: [remote], nextSyncToken: 'cursor' });
    if (init.method === 'PATCH') {
      remote = { ...remote, ...JSON.parse(init.body as string), start: { dateTime: '2030-01-15T12:00:00Z' }, end: { dateTime: '2030-01-15T12:30:00Z' } };
      throw new Error('response lost then edited externally');
    }
    return response(remote);
  });
  await expect(processConnection(getDb(), config, 'conn')).rejects.toThrow();
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT conflict FROM google_user_calendar_links').conflict).toContain('dois sistemas');
  expect(appointment().data_agendada).toBe('2030-01-12T12:00:00Z');
});

test.each([{ unit: 1, subject: 'another-account' }])('archived mirrors are isolated by Google account (%j)', async ({ unit, subject }) => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE google_user_calendar_connections SET status='disconnecting'");
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response(null, 204));
  await processConnection(getDb(), config, 'conn');
  const auth = await authorize(getDb(), config, unit, 1);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'new-refresh', scope: 'openid email https://www.googleapis.com/auth/calendar.events' }))
    .mockResolvedValueOnce(response({ sub: subject, email: 'verified@example.test', email_verified: true }));
  await completeAuthorization(getDb(), config, new URL(auth.url).searchParams.get('state')!, auth.browser, 'code');
  expect(row('SELECT id FROM google_user_calendar_connections').id).not.toBe('conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_links').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_archives').n).toBe(1);
});

test('Google title identifies the unit while location is explicitly cleared', async () => {
  createAppointment();
  db.sqlite.exec("UPDATE unidades SET nome='Barra do Ceará',endereco='Av. Pres. Castelo Branco, 5185 - Lj 05' WHERE id=1");
  const loaded = await loadAppointment(getDb(), 1, 1);
  const payload = toGoogle(loaded!, connection(), 'remote', config.baseUrl);
  expect(payload.summary).toBe('Sorria Leste • Barra do Ceará • Paciente');
  expect(payload.location).toBe('');
  expect(await loadAppointment(getDb(), 1, 2)).toBeNull();

});
test('unit name changes enqueue only its existing mirrored appointments', () => {
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE unidades SET nome='Outra unidade' WHERE id=2");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
  db.sqlite.exec("UPDATE unidades SET nome='Nome atualizado' WHERE id=1");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
});

test('calendar list follows pagination and distinguishes readable from writable calendars', async () => {
  const { calendarChoices } = await import('@/modules/google-calendar/server/calendars');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' }))
    .mockResolvedValueOnce(response({ items: [{ id: 'email', summary: 'Principal', primary: true, accessRole: 'owner' }, { id: 'readonly', accessRole: 'reader' }], nextPageToken: 'second' }))
    .mockResolvedValueOnce(response({ items: [{ id: 'alanna', summary: 'Agenda Alanna', accessRole: 'writer' }] }));
  expect((await calendarChoices(config, connection())).items).toEqual([{ id: 'primary', name: 'Principal', writable: true }, { id: 'readonly', name: '(Sem título)', writable: false }, { id: 'alanna', name: 'Agenda Alanna', writable: true }]);
  expect(fetchMock.mock.calls[2][0]).toContain('pageToken=second');
});
test('switch calendar preserves events, resets cursors and restores links when switching back', async () => {
  const { selectCalendar } = await import('@/modules/google-calendar/server/calendars');
  createAppointment(); mirror();
  db.sqlite.exec("UPDATE google_user_calendar_connections SET sync_token='old',sync_page_token='page'");
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('calendarList')) return response({ items: [{ id: 'calendar@example.test', summary: 'Anterior', accessRole: 'writer' }, { id: 'alanna', summary: 'Alanna', accessRole: 'owner' }] });
    return response(null, 204);
  });
  await selectCalendar(getDb(), config, 1, 'alanna');
  expect(connection()).toMatchObject({ calendar_id: 'alanna', calendar_name: 'Alanna', sync_token: null, sync_page_token: null, sync_requested: 1 });
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_links').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_channels').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(1);
  expect(fetchMock.mock.calls.some(call => call[1]?.method === 'DELETE')).toBe(false);
  await selectCalendar(getDb(), config, 1, 'calendar@example.test');
  expect(row('SELECT event_id FROM google_user_calendar_links').event_id).toBe('remote');
});
test.each(['pending', 'concurrent', 'readonly'])('calendar selection rejects %s without losing existing links', async kind => {
  const { selectCalendar } = await import('@/modules/google-calendar/server/calendars');
  createAppointment(); mirror();
  if (kind === 'pending') db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z'");
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('calendarList')) return response({ items: [{ id: 'other', summary: 'Other', accessRole: kind === 'readonly' ? 'reader' : 'owner' }] });
    if (kind === 'concurrent') db.sqlite.exec("UPDATE agendamentos SET data_agendada='2030-01-11T12:00:00Z'");
    return response(null, 204);
  });
  await expect(selectCalendar(getDb(), config, 1, 'other')).rejects.toThrow();
  expect(connection().calendar_id).toBe('calendar@example.test');
  expect(row('SELECT event_id FROM google_user_calendar_links').event_id).toBe('remote');
});
test('old OAuth permission gives actionable reconnect error', async () => {
  const { calendarChoices } = await import('@/modules/google-calendar/server/calendars');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({}, 403));
  await expect(calendarChoices(config, connection())).rejects.toThrow('Reconecte o Google');
});

test('staff can view a colleague but cannot configure their connection', async () => {
  const { GET, PATCH } = await import('@/app/api/integracoes/google/calendars/route');
  const { GET: status } = await import('@/app/api/integracoes/google/route');
  db.sqlite.exec("INSERT INTO usuarios(id,nome,email,role) VALUES (2,'Staff','staff@example.test','atendente'); INSERT INTO usuario_unidades(usuario_id,unidade_id) VALUES (2,1)");
  jest.mocked(verifyToken).mockResolvedValue({ sub: 2, nome: 'Staff', email: 'staff@example.test', role: 'atendente', roles: ['atendente'], iat: 0, exp: 4102444800, unidade_ids: [1], unidade_atual: 1 });
  expect((await callRoute(status, '/api/integracoes/google?usuario_id=1')).status).toBe(200);
  expect((await callRoute(GET, '/api/integracoes/google/calendars?usuario_id=1')).status).toBe(403);
  expect((await callRoute(PATCH, '/api/integracoes/google/calendars?usuario_id=1', { method: 'PATCH', body: { calendar_id: 'other' } })).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('procedure and appointment notes appear in Google description and enqueue updates', async () => {
  createAppointment(); mirror();
  db.sqlite.exec("INSERT INTO procedimentos(id,nome,valor) VALUES (99,'Limpeza',100)");
  db.sqlite.exec("UPDATE agendamentos SET procedimento_id=99,observacoes='Chegar 10 minutos antes <teste>',valor_pago=80 WHERE id=1");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  const payload = toGoogle((await loadAppointment(getDb(), 1, 1))!, connection(), 'remote', config.baseUrl);
  expect(payload.location).toBe('');
  expect(payload.description).toContain('Procedimentos:\nLimpeza');
  expect(payload.description).toContain('Observações:\nChegar 10 minutos antes &lt;teste&gt;');
  expect(payload.description).not.toContain('80');
  db.sqlite.exec("UPDATE procedimentos SET nome='Limpeza completa' WHERE id=99");
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(2);
  db.sqlite.exec('UPDATE agendamentos SET procedimento_id=NULL,observacoes=NULL WHERE id=1');
  expect(toGoogle((await loadAppointment(getDb(), 1, 1))!, connection(), 'remote', config.baseUrl).description).toBe('Agendamento #1\nhttps://example.test/agenda');
});

async function addAlanna() {
  db.sqlite.exec(`INSERT INTO usuarios(id,nome,email,role) VALUES (2,'Alanna','alanna@example.test','executor');
    INSERT INTO usuario_unidades(usuario_id,unidade_id) VALUES (2,1),(2,2);`);
  db.sqlite.prepare(`INSERT INTO google_user_calendar_connections(id,usuario_id,unidade_id,connected_by,google_subject,email,calendar_id,refresh_token)
    VALUES ('alanna',2,1,1,'alanna','alanna@example.test','alanna-calendar',?)`).run(await encrypt('alanna-refresh', config.encryptionKey, 'alanna'));
  db.sqlite.prepare('INSERT INTO google_user_calendar_channels(id,connection_id,token_hash,resource_id,expires_at) VALUES (?,?,?,?,?)')
    .run('alanna-channel', 'alanna', 'hash', 'resource2', Date.now() + 7 * 86400000);
}

test('one connection per user routes appointments by responsible across units', async () => {
  await addAlanna();
  expect(() => db.sqlite.exec(`INSERT INTO google_user_calendar_connections(id,usuario_id,unidade_id,connected_by,google_subject,email,calendar_id,refresh_token)
    VALUES ('duplicate',2,2,1,'different','other@test','other','x')`)).toThrow();
  db.sqlite.exec(`INSERT INTO agendamentos(id,cliente_id,unidade_id,executor_id,tipo,status,data_agendada)
    VALUES (1,1,2,2,'avaliacao','agendado','2030-01-10T12:00:00Z');`);
  expect(row('SELECT connection_id FROM google_user_calendar_outbox').connection_id).toBe('alanna');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
});

test('reassignment ignores old Google edits and waits for old removal before new creation', async () => {
  await addAlanna(); createAppointment(); mirror();
  db.sqlite.exec('UPDATE agendamentos SET executor_id=2 WHERE id=1');
  await applyRemote(getDb(), connection(), event({ start: { dateTime: '2030-01-20T12:00:00Z' } }));
  expect(appointment().data_agendada).toBe('2030-01-10T12:00:00.000Z');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [], nextSyncToken: 'c' }));
  await processConnection(getDb(), config, 'alanna');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(row("SELECT COUNT(*) AS n FROM google_user_calendar_outbox WHERE connection_id='alanna'").n).toBe(1);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [], nextSyncToken: 'c' }))
    .mockResolvedValueOnce(response(event())).mockResolvedValueOnce(response(null,204));
  await processConnection(getDb(), config, 'conn');
  expect(row("SELECT COUNT(*) AS n FROM google_user_calendar_links WHERE connection_id='conn'").n).toBe(0);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [], nextSyncToken: 'c' }))
    .mockResolvedValueOnce(response({},404)).mockImplementationOnce(async (url, options) => {
      expect(url).toContain('alanna-calendar');
      const body = JSON.parse(options.body);
      return response({ ...body, etag: 'new' });
    });
  await processConnection(getDb(), config, 'alanna');
  expect(row('SELECT connection_id FROM google_user_calendar_links').connection_id).toBe('alanna');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(0);
});

test('removing responsible removes old mirror without creating another', async () => {
  createAppointment(); mirror();
  db.sqlite.exec('UPDATE agendamentos SET executor_id=NULL WHERE id=1');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [event()], nextSyncToken: 'c' }))
    .mockResolvedValueOnce(response(event())).mockResolvedValueOnce(response(null,204));
  await processConnection(getDb(), config, 'conn');
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_links').n).toBe(0);
  expect(row('SELECT COUNT(*) AS n FROM agendamentos').n).toBe(1);
});

test('other-unit native bookings are visible as busy without patient titles', async () => {
  createAppointment(); mirror();
  await applyRemote(getDb(), connection(), event({ summary: 'Patient private name' }));
  const result = await callRoute<{ items: { summary: string }[] }>(events,
    '/api/integracoes/google/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z', { headers: { 'X-Unidade-Id': '2' } });
  expect(result.data.items).toHaveLength(1);
  expect(result.data.items[0].summary).toBe('Ocupado em outra unidade');
});

test('clinician can manage own connection but cannot read colleague or an unavailable unit', async () => {
  await addAlanna();
  const { GET, PATCH } = await import('@/app/api/integracoes/google/route');
  jest.mocked(verifyToken).mockResolvedValue({ sub: 2, nome: 'Alanna', email: 'alanna@example.test', role: 'executor', roles: ['executor'], iat: 0, exp: 4102444800, unidade_ids: [1,2], unidade_atual: 1 });
  expect((await callRoute(GET, '/api/integracoes/google')).status).toBe(200);
  expect((await callRoute(PATCH, '/api/integracoes/google', { method: 'PATCH', body: { default_duration: 45 } })).status).toBe(200);
  expect((await callRoute(GET, '/api/integracoes/google?usuario_id=1')).status).toBe(403);
  db.sqlite.exec('DELETE FROM usuario_unidades WHERE usuario_id=2 AND unidade_id=2');
  expect((await callRoute(GET, '/api/integracoes/google', { headers: { 'X-Unidade-Id': '2' } })).status).toBe(403);
});

test('admin OAuth binds selected owner instead of the acting administrator', async () => {
  await addAlanna(); db.sqlite.exec("DELETE FROM google_user_calendar_connections WHERE id='alanna'");
  const auth = await authorize(getDb(), config, 1, 1, 2);
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'new-refresh', scope: 'openid email https://www.googleapis.com/auth/calendar.events' }))
    .mockResolvedValueOnce(response({ sub: 'alanna', email: 'alanna@example.test', email_verified: true }));
  await completeAuthorization(getDb(), config, new URL(auth.url).searchParams.get('state')!, auth.browser, 'code');
  expect(row("SELECT usuario_id,connected_by FROM google_user_calendar_connections WHERE google_subject='alanna'"))
    .toMatchObject({ usuario_id: 2, connected_by: 1 });
});

test('view selection accepts reader calendars without changing destination or existing mirrors', async () => {
  const { PATCH } = await import('@/app/api/integracoes/google/calendars/route');
  createAppointment(); mirror();
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [{ id: 'personal', accessRole: 'reader' }] }));
  const result = await callRoute(PATCH, '/api/integracoes/google/calendars', { method: 'PATCH', body: { visible_calendar_ids: ['personal'] } });
  expect(result.status).toBe(200);
  expect(connection().calendar_id).toBe('calendar@example.test');
  expect(JSON.parse(connection().visible_calendar_ids!)).toEqual(['personal']);
  expect(row('SELECT event_id FROM google_user_calendar_links').event_id).toBe('remote');
  expect(fetchMock.mock.calls.some(([, init]) => ['DELETE','PATCH'].includes(init?.method))).toBe(false);
});

test('visible calendars require read permission and reject unbounded selections', async () => {
  const { PATCH } = await import('@/app/api/integracoes/google/calendars/route');
  fetchMock.mockResolvedValueOnce(response({ access_token: 'access' })).mockResolvedValueOnce(response({ items: [] }));
  expect((await callRoute(PATCH, '/api/integracoes/google/calendars', { method: 'PATCH', body: { visible_calendar_ids: ['not-authorized'] } })).status).toBe(400);
  expect(connection().visible_calendar_ids).toBeNull();
  expect((await callRoute(PATCH, '/api/integracoes/google/calendars', { method: 'PATCH', body: { visible_calendar_ids: Array(11).fill('x') } })).status).toBe(400);
});

test.each([false,true])('multiple visible calendars preserve identity and partial failures are explicit (%s)', async failDestination => {
  db.sqlite.prepare('UPDATE google_user_calendar_connections SET visible_calendar_ids=?').run(JSON.stringify(['calendar@example.test', 'personal']));
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'access' });
    if (url.includes('/calendars/personal/')) return response({ items: [event({ summary: 'Personal' })] });
    return failDestination ? response({},503) : response({ items: [event({ summary: 'Clinic' })] });
  });
  const result = await callRoute<{ items: { event_id: string; summary: string; can_link: boolean }[]; stale: boolean }>(events,
    '/api/integracoes/google/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z');
  expect(result.data.stale).toBe(failDestination);
  expect(result.data.items).toHaveLength(failDestination ? 1 : 2);
  const personal = result.data.items.find(e => e.summary === 'Personal')!;
  expect(personal.can_link).toBe(false);
  expect(personal.event_id).not.toBe('remote');
  if (!failDestination) expect(result.data.items.find(e => e.summary === 'Clinic')?.can_link).toBe(true);
});

test('empty view selection makes no Google reads and leaves the publishing destination intact', async () => {
  db.sqlite.exec("UPDATE google_user_calendar_connections SET visible_calendar_ids='[]'");
  const result = await callRoute<{ items: unknown[] }>(events, '/api/integracoes/google/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z');
  expect(result.data.items).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
  createAppointment();
  expect(row('SELECT COUNT(*) AS n FROM google_user_calendar_outbox').n).toBe(1);
  expect(connection().calendar_id).toBe('calendar@example.test');
});
