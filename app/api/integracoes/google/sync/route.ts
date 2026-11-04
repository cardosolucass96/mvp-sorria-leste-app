import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { endpoint, getDb } from '@/modules/google-calendar/server/runtime';
export const POST = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, false);
  await getDb().prepare('UPDATE google_user_calendar_connections SET sync_requested=1 WHERE usuario_id=?').bind(access.ownerId).run();
  return NextResponse.json({ ok: true });
}));
