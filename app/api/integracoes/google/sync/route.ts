import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { endpoint, getDb } from '@/modules/google-calendar/server/runtime';
export const POST = withUnitRole(['admin', 'atendente'], async (_request, context) => endpoint(async () => {
  await getDb().prepare('UPDATE google_calendar_connections SET sync_requested=1 WHERE unidade_id=?').bind(context.unidadeId).run();
  return NextResponse.json({ ok: true });
}));
