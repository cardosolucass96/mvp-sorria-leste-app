import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { linkExternal } from '@/modules/google-calendar/server/actions';
export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => endpoint(async () => {
  const body = await request.json() as { agendamento_id?: number; event_id?: string };
  if (!Number.isSafeInteger(body.agendamento_id) || !body.agendamento_id || typeof body.event_id !== 'string' || !/^[a-zA-Z0-9_-]{1,1024}$/.test(body.event_id)) throw new CalendarRequestError('Informe o evento e o agendamento.');
  await linkExternal(getDb(), config(), context.unidadeId, body.agendamento_id, body.event_id);
  return NextResponse.json({ ok: true });
}));
