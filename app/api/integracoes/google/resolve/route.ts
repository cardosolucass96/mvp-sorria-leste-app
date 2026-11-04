import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { resolveConflict } from '@/modules/google-calendar/server/actions';
export const POST = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, false);
  const body = await request.json() as { agendamento_id?: number; choice?: 'local' | 'google' };
  if (!Number.isSafeInteger(body.agendamento_id) || !body.agendamento_id || !['local','google'].includes(body.choice ?? '')) throw new CalendarRequestError('Informe o agendamento e a versão a manter.');
  await resolveConflict(getDb(), config(), context.unidadeId, body.agendamento_id, body.choice!, access.ownerId);
  return NextResponse.json({ ok: true });
}));
