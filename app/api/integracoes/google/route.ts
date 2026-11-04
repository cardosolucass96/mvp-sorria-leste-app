import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { CalendarRequestError, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { duration } from '@/modules/google-calendar/server/mapping';
export const GET = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, false);
  const db = getDb();
  const row = await db.prepare(`SELECT id,email,status,last_sync_at,last_error,default_duration,calendar_id,calendar_name FROM google_user_calendar_connections WHERE usuario_id=?`)
    .bind(access.ownerId).first<{ id: string }>();
  if (!row) return NextResponse.json({ connected: false, owner_id: access.ownerId, owner_name: access.ownerName, can_manage: access.canManage });
  const pending = await db.prepare('SELECT COUNT(DISTINCT agendamento_id) AS total FROM google_user_calendar_outbox WHERE connection_id=?').bind(row.id).first<{ total: number }>();
  const conflicts = await db.prepare('SELECT l.agendamento_id,l.conflict FROM google_user_calendar_links l JOIN agendamentos a ON a.id=l.agendamento_id WHERE l.connection_id=? AND a.unidade_id=? AND a.executor_id=? AND l.conflict IS NOT NULL').bind(row.id, context.unidadeId, access.ownerId).all();
  return NextResponse.json({ ...row, connected: true, owner_id: access.ownerId, owner_name: access.ownerName, can_manage: access.canManage, pending: pending?.total ?? 0, conflicts: conflicts.results });
}));
export const PATCH = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const body = await request.json() as { default_duration?: unknown };
  const minutes = duration(body.default_duration);
  if (!minutes) throw new CalendarRequestError('Duração deve ser um número inteiro entre 5 e 480 minutos.');
  await getDb().prepare('UPDATE google_user_calendar_connections SET default_duration=? WHERE usuario_id=?').bind(minutes, access.ownerId).run();
  return NextResponse.json({ ok: true });
}));
export const DELETE = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const changed = await getDb().prepare(`UPDATE google_user_calendar_connections SET status='disconnecting',sync_requested=1 WHERE usuario_id=? AND lease_until<? RETURNING id`)
    .bind(access.ownerId, Date.now()).first();
  if (!changed) throw new CalendarRequestError('Integração ausente ou sincronização em andamento. Tente novamente.', 409);
  return NextResponse.json({ ok: true, message: 'Desconexão solicitada. Os eventos existentes serão preservados.' });
}));
