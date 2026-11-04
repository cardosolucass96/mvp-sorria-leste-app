import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { linkExternal } from '@/modules/google-calendar/server/actions';
export const POST = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, false);
  const body = await request.json() as { agendamento_id?: number; event_id?: string };
  if (!Number.isSafeInteger(body.agendamento_id) || !body.agendamento_id || typeof body.event_id !== 'string' || !/^[a-zA-Z0-9_-]{1,1024}$/.test(body.event_id)) throw new CalendarRequestError('Informe o evento e o agendamento.');
  await linkExternal(getDb(), config(), context.unidadeId, body.agendamento_id, body.event_id, access.ownerId);
  return NextResponse.json({ ok: true });
}));
