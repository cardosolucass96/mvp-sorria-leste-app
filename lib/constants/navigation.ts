/**
 * Itens de navegação — fonte única para Sidebar e Header.
 * Substitui os 2 arrays duplicados.
 */

import type { UserRole } from '@/lib/types';

export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];  // Se não definido, visível para todos
}

export const MENU_ITEMS: MenuItem[] = [
  { href: '/', label: 'Início', icon: '🏠' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin'] },
  { href: '/clientes', label: 'Clientes', icon: '👥', roles: ['admin', 'atendente'] },
  { href: '/atendimentos', label: 'Atendimentos', icon: '📋', roles: ['admin', 'atendente'] },
  { href: '/avaliacao', label: 'Fila Avaliação', icon: '🔍', roles: ['admin', 'avaliador'] },
  { href: '/execucao', label: 'Fila Execução', icon: '🦷', roles: ['admin', 'executor'] },
  { href: '/meus-procedimentos', label: 'Meus Procedimentos', icon: '📋', roles: ['avaliador', 'executor'] },
  { href: '/pagamentos', label: 'Pagamentos', icon: '💰', roles: ['admin', 'atendente'] },
  { href: '/procedimentos', label: 'Procedimentos', icon: '📑', roles: ['admin'] },
  { href: '/usuarios', label: 'Usuários', icon: '👤', roles: ['admin'] },
  { href: '/comissoes', label: 'Comissões', icon: '💵', roles: ['admin'] },
];

/** Labels de view mode */
export const VIEW_MODE_LABELS: Record<string, string> = {
  admin: 'Modo Admin',
  dentista: 'Modo Dentista',
};
