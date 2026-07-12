import { NextRequest, NextResponse } from 'next/server';
import { extractToken, verifyToken } from '@/lib/auth/jwt';

/**
 * Barreira de rede para rotas de API.
 *
 * A autorização por papel/unidade continua nos route handlers. Este middleware
 * impede que handlers legados sem wrapper fiquem acessíveis publicamente.
 */
export async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  if (PUBLIC_API_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = extractToken(request);
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json(
      { error: 'Autenticação necessária' },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/dev-login']);

export const config = {
  matcher: ['/api/:path*'],
};
