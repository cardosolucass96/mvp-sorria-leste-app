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
  ortodontista: 'Ortodontista',
};

/** Labels descritivos (para tela de gestão de usuários) */
export const ROLE_LABELS_DESCRITIVOS: Record<UserRole, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  avaliador: 'Avaliador (Dentista)',
  executor: 'Executor (Dentista)',
  ortodontista: 'Ortodontista (Dentista)',
};

/** Cores por role (Tailwind classes) */
export const ROLE_COLORS: Record<UserRole, { cor: string; bgCor: string }> = {
  admin: { cor: 'text-evaluation-700', bgCor: 'bg-evaluation-100' },
  atendente: { cor: 'text-primary-700', bgCor: 'bg-primary-100' },
  avaliador: { cor: 'text-evaluation-700', bgCor: 'bg-evaluation-100' },
  executor: { cor: 'text-dentist-500', bgCor: 'bg-dentist-100' },
  ortodontista: { cor: 'text-info-700', bgCor: 'bg-info-100' },
};

/** Lista de todos os roles disponíveis */
export const ALL_ROLES: UserRole[] = ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'];

/** Retorna label para qualquer role. Seguro para role desconhecido. */
export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}
