import type { Cliente, UserRole } from '@/lib/types';
import type { JwtPayload } from '@/lib/auth/jwt';
import { extractToken, verifyToken } from '@/lib/auth/jwt';
import { calculateAgeFromDateOnly } from '@/lib/time';

const DENTIST_ROLES = new Set<UserRole>(['avaliador', 'executor', 'ortodontista']);
const FULL_PATIENT_DATA_ROLES = new Set<UserRole>(['admin', 'atendente']);

type RoleCarrier = Pick<JwtPayload, 'role' | 'roles'> | { role?: string; roles?: string[] } | null | undefined;

export type ClienteComIdade = Cliente & {
  idade?: number | null;
};

export async function getAuthenticatedRequestUser(request: Request): Promise<JwtPayload | null> {
  const token = extractToken(request);
  return token ? verifyToken(token) : null;
}

export function getEffectiveUserRoles(user: RoleCarrier): string[] {
  if (!user) return [];

  const roles = Array.isArray(user.roles) && user.roles.length > 0
    ? [...user.roles]
    : [];

  if (user.role) {
    roles.push(user.role);
  }

  return Array.from(new Set(roles.filter(Boolean)));
}

export function isRestrictedDentistPatientView(user: RoleCarrier): boolean {
  const roles = getEffectiveUserRoles(user);
  const hasFullPatientDataRole = roles.some((role) => FULL_PATIENT_DATA_ROLES.has(role as UserRole));
  const hasDentistRole = roles.some((role) => DENTIST_ROLES.has(role as UserRole));

  return hasDentistRole && !hasFullPatientDataRole;
}

export function canManagePatientRegistration(user: RoleCarrier): boolean {
  return getEffectiveUserRoles(user).some((role) => FULL_PATIENT_DATA_ROLES.has(role as UserRole));
}

export function applyPatientPrivacyToCliente<T extends Partial<Cliente>>(
  cliente: T,
  user: RoleCarrier
): T & { idade?: number | null } {
  if (!isRestrictedDentistPatientView(user)) {
    return cliente as T & { idade?: number | null };
  }

  return {
    ...cliente,
    cpf: null,
    telefone: null,
    email: null,
    data_nascimento: null,
    endereco: null,
    origem: null,
    plano_odontologico: null,
    observacoes: null,
    idade: calculateAgeFromDateOnly(cliente.data_nascimento ?? null),
  } as T & { idade?: number | null };
}

export function applyPatientPrivacyToClientes<T extends Partial<Cliente>>(
  clientes: T[],
  user: RoleCarrier
): Array<T & { idade?: number | null }> {
  return clientes.map((cliente) => applyPatientPrivacyToCliente(cliente, user));
}

export function redactPatientContactFields<T extends object>(
  row: T,
  user: RoleCarrier
): T {
  if (!isRestrictedDentistPatientView(user)) return row;

  const redacted = { ...row };
  const writable = redacted as Record<string, unknown>;
  if ('cliente_cpf' in writable) writable.cliente_cpf = null;
  if ('cliente_telefone' in writable) writable.cliente_telefone = null;
  if ('cliente_email' in writable) writable.cliente_email = null;

  return redacted;
}

export function redactPatientContactFieldsList<T extends object>(
  rows: T[],
  user: RoleCarrier
): T[] {
  return rows.map((row) => redactPatientContactFields(row, user));
}

export function ensureCanManagePatientRegistration(user: RoleCarrier): Response | null {
  if (canManagePatientRegistration(user)) return null;

  return Response.json(
    { error: 'Acesso não autorizado para este perfil' },
    { status: 403 }
  );
}
