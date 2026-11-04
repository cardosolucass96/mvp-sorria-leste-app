import 'server-only';
import { getDb } from '@/lib/db';
import { getOptionalRuntimeEnv, getRequiredRuntimeEnv } from '@/lib/env';
import { assertExternalSideEffectsEnabled } from '@/shared/server/external-effects';
import type { GoogleConfig } from './google-api';
import { NextResponse } from 'next/server';
export function config(): GoogleConfig {
  assertExternalSideEffectsEnabled();
  if (getOptionalRuntimeEnv('GOOGLE_CALENDAR_ENABLED') !== 'true') throw new Error('Google Agenda ainda não foi configurado neste ambiente.');
  const baseUrl = getRequiredRuntimeEnv('GOOGLE_APP_BASE_URL').replace(/\/$/, '');
  if (new URL(baseUrl).protocol !== 'https:') throw new Error('Google Agenda exige URL HTTPS.');
  return { clientId: getRequiredRuntimeEnv('GOOGLE_CLIENT_ID'), clientSecret: getRequiredRuntimeEnv('GOOGLE_CLIENT_SECRET'),
    encryptionKey: getRequiredRuntimeEnv('GOOGLE_TOKEN_ENCRYPTION_KEY'), baseUrl, enabled: true };
}
export class CalendarRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function endpoint(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); }
  catch (error) {
    if (error instanceof CalendarRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Provider responses and token payloads must never reach logs or clients.
    return NextResponse.json({ error: 'Não foi possível concluir a operação do Google Agenda. Confira a configuração ou tente novamente.' }, { status: 503 });
  }
}
export { getDb };
