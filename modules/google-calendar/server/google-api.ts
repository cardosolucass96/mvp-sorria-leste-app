import type { GoogleEvent } from '../contracts';
export const EVENT_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const SCOPES = `openid email ${EVENT_SCOPE} ${CALENDAR_LIST_SCOPE}`;
export class GoogleFailure extends Error {
  constructor(public status: number, public reconnect = false) {
    super(reconnect ? 'Reconecte a conta Google.' : `Falha na comunicação com o Google (${status}).`);
  }
}
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  baseUrl: string;
  enabled: boolean;
}
export function assertEnabled(config: GoogleConfig) {
  if (!config.enabled) throw new Error('Integração Google desativada neste ambiente.');
}
export function callbackUrl(config: GoogleConfig) {
  return `${config.baseUrl}/api/integracoes/google/callback`;
}
export async function tokenRequest(config: GoogleConfig, values: Record<string, string>) {
  assertEnabled(config);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new GoogleFailure(response.status, response.status === 400 || response.status === 401);
  const tokens = await response.json() as { access_token: string; refresh_token?: string; scope?: string };
  if (!tokens.access_token) throw new GoogleFailure(502);
  return tokens;
}
export class GoogleApi {
  constructor(private token: string, private calendarId: string) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new GoogleFailure(response.status, response.status === 401);
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  private path(id?: string) {
    return `calendars/${encodeURIComponent(this.calendarId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  }
  get(id: string) { return this.request<GoogleEvent>(this.path(id)); }
  insert(event: GoogleEvent) {
    return this.request<GoogleEvent>(this.path() + '?sendUpdates=none', { method: 'POST', body: JSON.stringify(event) });
  }
  patch(id: string, event: Partial<GoogleEvent>, etag: string) {
    return this.request<GoogleEvent>(this.path(id) + '?sendUpdates=none', {
      method: 'PATCH', headers: { 'If-Match': etag }, body: JSON.stringify({ ...event, id: undefined }),
    });
  }
  delete(id: string, etag: string) {
    return this.request<void>(this.path(id) + '?sendUpdates=none', { method: 'DELETE', headers: { 'If-Match': etag } });
  }
  list(syncToken: string | null, pageToken?: string) {
    const query = new URLSearchParams({ maxResults: '100', showDeleted: 'true' });
    if (syncToken) query.set('syncToken', syncToken);
    if (pageToken) query.set('pageToken', pageToken);
    return this.request<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(this.path() + '?' + query);
  }
  window(from: string, to: string, pageToken?: string) {
    const query = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    return this.request<{ items?: GoogleEvent[]; nextPageToken?: string }>(this.path() + '?' + query);
  }
  watch(body: { id: string; token: string; address: string; expiration: string; type: string }) {
    return this.request<{ id: string; resourceId: string; expiration: string }>(this.path() + '/watch', { method: 'POST', body: JSON.stringify(body) });
  }
  stop(id: string, resourceId: string) {
    return this.request<void>('channels/stop', { method: 'POST', body: JSON.stringify({ id, resourceId }) });
  }
}
