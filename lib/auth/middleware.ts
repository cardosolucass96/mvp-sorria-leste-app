/**
 * Middleware de autenticação e autorização para rotas de API.
 *
 * Uso:
 * ```ts
 * import { withAuth, withRole } from '@/lib/auth/middleware';
 *
 * // Apenas autenticado
 * export const GET = withAuth(async (request, context) => {
 *   const user = context.user; // JwtPayload
 *   return NextResponse.json({ message: `Olá ${user.nome}` });
 * });
 *
 * // Autenticado + role específica
 * export const POST = withRole(['admin', 'atendente'], async (request, context) => {
 *   // Só admin e atendente chegam aqui
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractToken, JwtPayload } from './jwt';
import { UserRole } from '@/lib/types';

export interface AuthenticatedContext {
  user: JwtPayload;
  params?: Promise<Record<string, string | string[]>>;
}

type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthenticatedContext
) => Promise<Response>;

/**
 * Middleware que exige autenticação via JWT.
 * Rejeita com 401 se não autenticado.
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeContext?: unknown) => {
    const token = extractToken(request);

    if (!token) {
      return NextResponse.json(
        { error: 'Token de autenticação não fornecido' },
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: 'Token inválido ou expirado' },
        { status: 401 }
      );
    }

    // Montar context autenticado
    const authContext: AuthenticatedContext = {
      user: payload,
      ...(routeContext && typeof routeContext === 'object' ? routeContext : {}),
    };

    return handler(request, authContext);
  };
}

/**
 * Middleware que exige autenticação + role específica.
 * Rejeita com 401 se não autenticado, 403 se role não permitida.
 */
export function withRole(
  roles: UserRole[],
  handler: AuthenticatedHandler
) {
  return withAuth(async (request: NextRequest, context: AuthenticatedContext) => {
    if (!roles.includes(context.user.role as UserRole)) {
      return NextResponse.json(
        { error: 'Acesso não autorizado para este perfil' },
        { status: 403 }
      );
    }

    return handler(request, context);
  });
}
