import { visibleCalendarIds } from '@/modules/google-calendar/server/calendars';
import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { decrypt } from '@/modules/google-calendar/server/crypto';
import { GoogleApi, tokenRequest } from '@/modules/google-calendar/server/google-api';
import type { ExternalEvent, GoogleConnection } from '@/modules/google-calendar/contracts';
export const GET = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, false);
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) ||
    Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 93 * 86400000) {
    throw new CalendarRequestError('Informe um intervalo válido de até 93 dias.');
  }
  const db = getDb();
  const connection = await db.prepare('SELECT * FROM google_user_calendar_connections WHERE usuario_id=?').bind(access.ownerId).first<GoogleConnection>();
  if (!connection) return NextResponse.json({ items: [], truncated: false });
  const selected = visibleCalendarIds(connection);
  if (!selected.length) return NextResponse.json({ items: [], truncated: false, stale: false });
  const items: ExternalEvent[] = [];
  let stale = false;
  let truncated = false;
  let destinationFailed = false;
  try {
    const settings = config();
    const tokens = await tokenRequest(settings, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, settings.encryptionKey, connection.id) });
    const links = (await db.prepare('SELECT l.event_id,a.unidade_id FROM google_user_calendar_links l LEFT JOIN agendamentos a ON a.id=l.agendamento_id WHERE l.connection_id=?').bind(connection.id).all<{ event_id: string; unidade_id: number | null }>()).results;
    const linked = new Set(links.filter(link => link.unidade_id === context.unidadeId).map(link => link.event_id));
    const otherUnit = new Set(links.filter(link => link.unidade_id !== context.unidadeId).map(link => link.event_id));
    await Promise.all(selected.map(async calendarId => {
      const destination = calendarId === connection.calendar_id;
      try {
        const api = new GoogleApi(tokens.access_token, calendarId);
        const calendarItems: ExternalEvent[] = [];
        let page: string | undefined;
        let pages = 0;
        do {
          const result = await api.window(from, to, page);
          for (const event of result.items ?? []) {
            if (event.status === 'cancelled' || (destination && linked.has(event.id))) continue;
            const busy = destination && otherUnit.has(event.id);
            calendarItems.push({ event_id: destination ? event.id : JSON.stringify([calendarId, event.id]),
              can_link: destination && !busy,
              summary: busy ? 'Ocupado em outra unidade' : event.summary ?? '(Sem título)',
              start_at: event.start?.dateTime ?? event.start?.date ?? null, end_at: event.end?.dateTime ?? event.end?.date ?? null,
              all_day: event.start?.date ? 1 : 0, recurring: event.recurringEventId ? 1 : 0 });
          }
          page = result.nextPageToken; pages++;
        } while (page && pages < 10);
        if (page) truncated = true;
        items.push(...calendarItems);
      } catch {
        stale = true;
        if (destination) destinationFailed = true;
      }
    }));
  } catch {
    stale = true;
    destinationFailed = selected.includes(connection.calendar_id);
  }
  // A failed calendar never becomes a cached absence. Preserve available calendars and
  // explicitly mark the response incomplete; the destination has a durable fallback.
  if (destinationFailed) {
  const results = await db.prepare(`SELECT e.event_id,CASE WHEN EXISTS(SELECT 1 FROM google_user_calendar_links l WHERE l.connection_id=e.connection_id AND l.event_id=e.event_id) THEN 'Ocupado em outra unidade' ELSE e.summary END AS summary,e.start_at,e.end_at,e.all_day,e.recurring
    FROM google_user_calendar_events e JOIN google_user_calendar_connections c ON c.id=e.connection_id
    WHERE c.id=? AND e.status!='cancelled' AND julianday(e.start_at)<julianday(?) AND julianday(e.end_at)>julianday(?)
      AND NOT EXISTS(SELECT 1 FROM google_user_calendar_links l JOIN agendamentos a ON a.id=l.agendamento_id WHERE l.connection_id=e.connection_id AND l.event_id=e.event_id AND a.unidade_id=?)
    ORDER BY e.start_at LIMIT 501`).bind(connection.id, to, from, context.unidadeId).all();
  items.push(...(results.results as unknown as ExternalEvent[]).map(event => ({ ...event, can_link: false })));
  if (results.results.length > 500) truncated = true;
  }
  items.sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''));
  return NextResponse.json({ items: items.slice(0, 500), truncated: truncated || items.length > 500, stale });
}));
