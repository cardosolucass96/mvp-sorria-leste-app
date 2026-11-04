import { calendarAccess } from '@/modules/google-calendar/server/access';
import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { authorize } from '@/modules/google-calendar/server/oauth';
import { config, endpoint, getDb } from '@/modules/google-calendar/server/runtime';
export const POST = withUnit(async (request, context) => endpoint(async () => {
  const access = await calendarAccess(getDb(), request, context, true);
  const result = await authorize(getDb(), config(), context.unidadeId, context.user.sub, access.ownerId);
  const response = NextResponse.json({ url: result.url });
  response.cookies.set('google_oauth_browser', result.browser, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/integracoes/google/callback', maxAge: 600 });
  return response;
}));
