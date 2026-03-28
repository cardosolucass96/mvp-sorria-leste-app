/**
 * Constantes de roles/perfis de usuário.
 */

import type { UserRole } from '@/lib/types';

/** Labels curtos para exibição geral */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  avaliador: 'Avaliador',
  executor: 'Executor',
};

/** Labels descritivos (para tela de gestão de usuários) */
export const ROLE_LABELS_DESCRITIVOS: Record<UserRole, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  avaliador: 'Avaliador (Dentista)',
  executor: 'Executor (Dentista)',
};

/** Cores por role (Tailwind classes) */
export const ROLE_COLORS: Record<UserRole, { cor: string; bgCor: string }> = {
  admin: { cor: 'text-evaluation-700', bgCor: 'bg-evaluation-100' },
  atendente: { cor: 'text-blue-700', bgCor: 'bg-blue-100' },
  avaliador: { cor: 'text-amber-700', bgCor: 'bg-amber-100' },
  executor: { cor: 'text-green-700', bgCor: 'bg-green-100' },
};

/** Lista de todos os roles disponíveis */
export const ALL_ROLES: UserRole[] = ['admin', 'atendente', 'avaliador', 'executor'];

/** Retorna label para qualquer role. Seguro para role desconhecido. */
export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}
