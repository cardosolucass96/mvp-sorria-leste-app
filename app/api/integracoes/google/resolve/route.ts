import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { CalendarRequestError, config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
import { resolveConflict } from '@/modules/google-calendar/server/actions';
export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => endpoint(async () => {
  const body = await request.json() as { agendamento_id?: number; choice?: 'local' | 'google' };
  if (!Number.isSafeInteger(body.agendamento_id) || !body.agendamento_id || !['local','google'].includes(body.choice ?? '')) throw new CalendarRequestError('Informe o agendamento e a versão a manter.');
  await resolveConflict(getDb(), config(), context.unidadeId, body.agendamento_id, body.choice!);
  return NextResponse.json({ ok: true });
}));
