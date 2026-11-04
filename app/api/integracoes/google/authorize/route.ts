import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { authorize } from '@/modules/google-calendar/server/oauth';
import { config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
export const POST = withUnitRole(['admin'], async (_request, context) => endpoint(async () => {
  const result = await authorize(getDb(), config(), context.unidadeId, context.user.sub);
  const response = NextResponse.json({ url: result.url });
  response.cookies.set('google_oauth_browser', result.browser, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/integracoes/google/callback', maxAge: 600 });
  return response;
}));
