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
) => Promise<Response | void>;

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
 * Retorna todas as roles efetivas do usuário (usa `roles` do JWT ou faz fallback para [role]).
 */
export function getUserRoles(user: JwtPayload): string[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
}

/** Verifica se o usuário tem pelo menos uma das roles informadas. */
export function userHasAnyRole(user: JwtPayload, roles: UserRole[]): boolean {
  const userRoles = getUserRoles(user);
  return roles.some((r) => userRoles.includes(r));
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
    if (!userHasAnyRole(context.user, roles)) {
      return NextResponse.json(
        { error: 'Acesso não autorizado para este perfil' },
        { status: 403 }
      );
    }

    return handler(request, context);
  });
}

// ============================================================
// Middleware com contexto de unidade
// ============================================================

/**
 * Extrai a unidade atual do request.
 * Prioridade: header X-Unidade-Id > JWT unidade_atual > fallback 1.
 * Valida que o usuário pertence à unidade (admin acessa qualquer uma).
 */
export function getUnidadeFromRequest(
  request: NextRequest,
  user: JwtPayload
): number {
  const headerUnit = request.headers.get('X-Unidade-Id');
  if (headerUnit) {
    const parsed = parseInt(headerUnit);
    if (!isNaN(parsed)) {
      const isAdmin = getUserRoles(user).includes('admin');
      if (isAdmin || (user.unidade_ids && user.unidade_ids.includes(parsed))) {
        return parsed;
      }
    }
  }
  return user.unidade_atual || 1;
}

export interface UnitAuthenticatedContext extends AuthenticatedContext {
  unidadeId: number;
}

type UnitAuthenticatedHandler = (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => Promise<Response | void>;

/**
 * Middleware que exige autenticação + extrai unidade atual.
 * Adiciona `unidadeId` ao context.
 */
export function withUnit(handler: UnitAuthenticatedHandler) {
  return withAuth(async (request: NextRequest, context: AuthenticatedContext) => {
    const unidadeId = getUnidadeFromRequest(request, context.user);
    return handler(request, { ...context, unidadeId });
  });
}

/**
 * Middleware que exige autenticação + role + extrai unidade.
 */
export function withUnitRole(
  roles: UserRole[],
  handler: UnitAuthenticatedHandler
) {
  return withRole(roles, async (request: NextRequest, context: AuthenticatedContext) => {
    const unidadeId = getUnidadeFromRequest(request, context.user);
    return handler(request, { ...context, unidadeId });
  });
}
