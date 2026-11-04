import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
const eligible = `SELECT c.id AS connection_id,a.id AS agendamento_id FROM agendamentos a JOIN google_user_calendar_connections c ON c.usuario_id=a.executor_id
  WHERE a.unidade_id=? AND c.usuario_id=? AND a.status='agendado' AND a.data_agendada>=? AND c.status!='disconnecting'
  AND NOT EXISTS(SELECT 1 FROM google_user_calendar_links l WHERE l.connection_id=c.id AND l.agendamento_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM google_user_calendar_outbox o WHERE o.connection_id=c.id AND o.agendamento_id=a.id)`;
export const GET = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const result = await getDb().prepare(`SELECT COUNT(*) AS total FROM (${eligible})`).bind(context.unidadeId, access.ownerId, new Date().toISOString()).first();
  return NextResponse.json(result);
}));
export const POST = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const body = await request.json() as { confirm?: boolean };
  if (body.confirm !== true) throw new CalendarRequestError('Confirme a importação dos agendamentos futuros.');
  await getDb().prepare(`INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id) ${eligible}`)
    .bind(context.unidadeId, access.ownerId, new Date().toISOString()).run();
  return NextResponse.json({ ok: true });
}));
