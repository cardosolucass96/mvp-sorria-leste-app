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
  try {
    const settings = config();
    const tokens = await tokenRequest(settings, { grant_type: 'refresh_token', refresh_token: await decrypt(connection.refresh_token, settings.encryptionKey, connection.id) });
    const api = new GoogleApi(tokens.access_token, connection.calendar_id);
    const links = (await db.prepare('SELECT l.event_id,a.unidade_id FROM google_user_calendar_links l LEFT JOIN agendamentos a ON a.id=l.agendamento_id WHERE l.connection_id=?').bind(connection.id).all<{ event_id: string; unidade_id: number | null }>()).results;
    const linked = new Set(links.filter(link => link.unidade_id === context.unidadeId).map(link => link.event_id));
    const otherUnit = new Set(links.filter(link => link.unidade_id !== context.unidadeId).map(link => link.event_id));
    const items: ExternalEvent[] = [];
    let page: string | undefined;
    let pages = 0;
    do {
      const result = await api.window(from, to, page);
      for (const event of result.items ?? []) {
        if (event.status === 'cancelled' || linked.has(event.id)) continue;
        items.push({ event_id: event.id, summary: otherUnit.has(event.id) ? 'Ocupado em outra unidade' : event.summary ?? '(Sem título)', start_at: event.start?.dateTime ?? event.start?.date ?? null,
          end_at: event.end?.dateTime ?? event.end?.date ?? null, all_day: event.start?.date ? 1 : 0, recurring: event.recurringEventId ? 1 : 0 });
      }
      page = result.nextPageToken; pages++;
    } while (page && pages < 10);
    return NextResponse.json({ items, truncated: Boolean(page), stale: false });
  } catch { /* Return explicitly stale cached data, never record provider failure as absence. */ }
  const results = await db.prepare(`SELECT e.event_id,CASE WHEN EXISTS(SELECT 1 FROM google_user_calendar_links l WHERE l.connection_id=e.connection_id AND l.event_id=e.event_id) THEN 'Ocupado em outra unidade' ELSE e.summary END AS summary,e.start_at,e.end_at,e.all_day,e.recurring
    FROM google_user_calendar_events e JOIN google_user_calendar_connections c ON c.id=e.connection_id
    WHERE c.id=? AND e.status!='cancelled' AND julianday(e.start_at)<julianday(?) AND julianday(e.end_at)>julianday(?)
      AND NOT EXISTS(SELECT 1 FROM google_user_calendar_links l JOIN agendamentos a ON a.id=l.agendamento_id WHERE l.connection_id=e.connection_id AND l.event_id=e.event_id AND a.unidade_id=?)
    ORDER BY e.start_at LIMIT 501`).bind(connection.id, to, from, context.unidadeId).all();
  return NextResponse.json({ items: results.results.slice(0, 500), truncated: results.results.length > 500, stale: true });
}));
