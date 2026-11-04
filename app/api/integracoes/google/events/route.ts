import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { decrypt } from '@/modules/google-calendar/server/crypto';
import { GoogleApi, tokenRequest } from '@/modules/google-calendar/server/google-api';
import type { ExternalEvent, GoogleConnection } from '@/modules/google-calendar/contracts';
export const GET = withUnitRole(['admin', 'atendente'], async (request, context) => endpoint(async () => {
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) ||
    Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 93 * 86400000) {
    throw new CalendarRequestError('Informe um intervalo válido de até 93 dias.');
  }
  const db = getDb();
  const connection = await db.prepare('SELECT * FROM google_calendar_connections WHERE unidade_id=?').bind(context.unidadeId).first<GoogleConnection>();
  if (!connection) return NextResponse.json({ items: [], truncated: false });
  try {
    const settings = config();
    const tokens = await tokenRequest(settings, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, settings.encryptionKey, connection.id) });
    const api = new GoogleApi(tokens.access_token, connection.calendar_id);
    const links = (await db.prepare('SELECT event_id FROM google_calendar_links WHERE connection_id=?').bind(connection.id).all<{ event_id: string }>()).results;
    const linked = new Set(links.map(link => link.event_id));
    const items: ExternalEvent[] = [];
    let page: string | undefined;
    let pages = 0;
    do {
      const result = await api.window(from, to, page);
      for (const event of result.items ?? []) {
        if (event.status === 'cancelled' || linked.has(event.id)) continue;
        items.push({ event_id: event.id, summary: event.summary ?? '(Sem título)', start_at: event.start?.dateTime ?? event.start?.date ?? null,
          end_at: event.end?.dateTime ?? event.end?.date ?? null, all_day: event.start?.date ? 1 : 0, recurring: event.recurringEventId ? 1 : 0 });
      }
      page = result.nextPageToken; pages++;
    } while (page && pages < 10);
    return NextResponse.json({ items, truncated: Boolean(page), stale: false });
  } catch { /* Return explicitly stale cached data, never record provider failure as absence. */ }
  const results = await db.prepare(`SELECT e.event_id,e.summary,e.start_at,e.end_at,e.all_day,e.recurring
    FROM google_calendar_events e JOIN google_calendar_connections c ON c.id=e.connection_id
    WHERE c.unidade_id=? AND e.status!='cancelled' AND julianday(e.start_at)<julianday(?) AND julianday(e.end_at)>julianday(?)
      AND NOT EXISTS(SELECT 1 FROM google_calendar_links l WHERE l.connection_id=e.connection_id AND l.event_id=e.event_id)
    ORDER BY e.start_at LIMIT 501`).bind(context.unidadeId, to, from).all();
  return NextResponse.json({ items: results.results.slice(0, 500), truncated: results.results.length > 500, stale: true });
}));
