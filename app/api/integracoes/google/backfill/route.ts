import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { CalendarRequestError, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
const eligible = `SELECT c.id AS connection_id,a.id AS agendamento_id FROM agendamentos a JOIN google_calendar_connections c ON c.unidade_id=a.unidade_id
  WHERE a.unidade_id=? AND a.status='agendado' AND a.data_agendada>=? AND c.status!='disconnecting'
  AND NOT EXISTS(SELECT 1 FROM google_calendar_links l WHERE l.connection_id=c.id AND l.agendamento_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM google_calendar_outbox o WHERE o.connection_id=c.id AND o.agendamento_id=a.id)`;
export const GET = withUnitRole(['admin'], async (_request, context) => endpoint(async () => {
  const result = await getDb().prepare(`SELECT COUNT(*) AS total FROM (${eligible})`).bind(context.unidadeId, new Date().toISOString()).first();
  return NextResponse.json(result);
}));
export const POST = withUnitRole(['admin'], async (request, context) => endpoint(async () => {
  const body = await request.json() as { confirm?: boolean };
  if (body.confirm !== true) throw new CalendarRequestError('Confirme a importação dos agendamentos futuros.');
  await getDb().prepare(`INSERT INTO google_calendar_outbox(connection_id,agendamento_id) ${eligible}`)
    .bind(context.unidadeId, new Date().toISOString()).run();
  return NextResponse.json({ ok: true });
}));
