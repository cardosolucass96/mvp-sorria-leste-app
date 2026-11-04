import { NextRequest, NextResponse } from 'next/server';
import { completeAuthorization } from '@/modules/google-calendar/server/oauth';
import { config, getDb } from '@/modules/google-calendar/server/runtime';
import { digest } from '@/modules/google-calendar/server/crypto';
export async function GET(request: NextRequest) {
  let result = 'error';
  const state = request.nextUrl.searchParams.get('state');
  const browser = request.cookies.get('google_oauth_browser')?.value;
  const code = request.nextUrl.searchParams.get('code');
  try {
    if (state && browser && code && !request.nextUrl.searchParams.has('error')) {
      await completeAuthorization(getDb(), config(), state, browser, code);
      result = 'connected';
    } else if (state && browser) {
      await getDb().prepare('DELETE FROM google_calendar_oauth_states WHERE state_hash=? AND browser_hash=?')
        .bind(await digest(state), await digest(browser)).run();
    }
  } catch { /* Never render authorization codes, tokens, or provider responses. */ }
  const response = NextResponse.redirect(new URL(`/agenda?google=${result}`, request.url));
  response.cookies.set('google_oauth_browser', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/integracoes/google/callback', maxAge: 0 });
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
