import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { calendarChoices, selectCalendar, selectVisibleCalendars, visibleCalendarIds } from '@/modules/google-calendar/server/calendars';
import type { GoogleConnection } from '@/modules/google-calendar/contracts';
export const GET = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const connection = await getDb().prepare('SELECT * FROM google_user_calendar_connections WHERE usuario_id=?').bind(access.ownerId).first<GoogleConnection>();
  if (!connection) throw new CalendarRequestError('Conecte uma conta Google primeiro.', 409);
  const { items } = await calendarChoices(config(), connection);
  return NextResponse.json({ items, visible_calendar_ids: visibleCalendarIds(connection), calendar_id: connection.calendar_id });
}));
export const PATCH = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const body = await request.json() as { calendar_id?: unknown; visible_calendar_ids?: unknown };
  if (body.visible_calendar_ids !== undefined) {
    if (body.calendar_id !== undefined || !Array.isArray(body.visible_calendar_ids) || body.visible_calendar_ids.length > 10 || body.visible_calendar_ids.some(id => typeof id !== 'string' || !id || id.length > 1024)) throw new CalendarRequestError('Selecione até 10 agendas para visualizar.');
    await selectVisibleCalendars(getDb(), config(), access.ownerId, body.visible_calendar_ids as string[]);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.calendar_id !== 'string' || !body.calendar_id || body.calendar_id.length > 1024) throw new CalendarRequestError('Selecione uma agenda válida.');
  await selectCalendar(getDb(), config(), access.ownerId, body.calendar_id);
  return NextResponse.json({ ok: true });
}));
