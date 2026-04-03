/**
 * Barrel export para o módulo de autenticação.
 */

export { hashPassword, verifyPassword, needsMigration } from './password';
export { generateToken, verifyToken, extractToken } from './jwt';
export type { JwtPayload } from './jwt';
export { withAuth, withRole, withUnit, withUnitRole, getUnidadeFromRequest } from './middleware';
export type { AuthenticatedContext, UnitAuthenticatedContext } from './middleware';
