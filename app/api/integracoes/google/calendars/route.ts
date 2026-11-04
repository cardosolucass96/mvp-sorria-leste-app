import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { calendarChoices, selectCalendar } from '@/modules/google-calendar/server/calendars';
import type { GoogleConnection } from '@/modules/google-calendar/contracts';
export const GET = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const connection = await getDb().prepare('SELECT * FROM google_user_calendar_connections WHERE usuario_id=?').bind(access.ownerId).first<GoogleConnection>();
  if (!connection) throw new CalendarRequestError('Conecte uma conta Google primeiro.', 409);
  const { items } = await calendarChoices(config(), connection);
  return NextResponse.json({ items });
}));
export const PATCH = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const body = await request.json() as { calendar_id?: unknown };
  if (typeof body.calendar_id !== 'string' || !body.calendar_id || body.calendar_id.length > 1024) throw new CalendarRequestError('Selecione uma agenda válida.');
  await selectCalendar(getDb(), config(), access.ownerId, body.calendar_id);
  return NextResponse.json({ ok: true });
}));
