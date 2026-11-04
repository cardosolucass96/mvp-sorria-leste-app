import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { CalendarRequestError, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { duration } from '@/modules/google-calendar/server/mapping';
export const GET = withUnitRole(['admin', 'atendente'], async (_request, context) => endpoint(async () => {
  const db = getDb();
  const row = await db.prepare(`SELECT id,email,status,last_sync_at,last_error,default_duration FROM google_calendar_connections WHERE unidade_id=?`)
    .bind(context.unidadeId).first<{ id: string }>();
  if (!row) return NextResponse.json({ connected: false });
  const pending = await db.prepare('SELECT COUNT(DISTINCT agendamento_id) AS total FROM google_calendar_outbox WHERE connection_id=?').bind(row.id).first<{ total: number }>();
  const conflicts = await db.prepare('SELECT agendamento_id,conflict FROM google_calendar_links WHERE connection_id=? AND conflict IS NOT NULL').bind(row.id).all();
  return NextResponse.json({ ...row, connected: true, pending: pending?.total ?? 0, conflicts: conflicts.results });
}));
export const PATCH = withUnitRole(['admin'], async (request, context) => endpoint(async () => {
  const body = await request.json() as { default_duration?: unknown };
  const minutes = duration(body.default_duration);
  if (!minutes) throw new CalendarRequestError('Duração deve ser um número inteiro entre 5 e 480 minutos.');
  await getDb().prepare('UPDATE google_calendar_connections SET default_duration=? WHERE unidade_id=?').bind(minutes, context.unidadeId).run();
  return NextResponse.json({ ok: true });
}));
export const DELETE = withUnitRole(['admin'], async (_request, context) => endpoint(async () => {
  const changed = await getDb().prepare(`UPDATE google_calendar_connections SET status='disconnecting',sync_requested=1 WHERE unidade_id=? AND lease_until<? RETURNING id`)
    .bind(context.unidadeId, Date.now()).first();
  if (!changed) throw new CalendarRequestError('Integração ausente ou sincronização em andamento. Tente novamente.', 409);
  return NextResponse.json({ ok: true, message: 'Desconexão solicitada. Os eventos existentes serão preservados.' });
}));
