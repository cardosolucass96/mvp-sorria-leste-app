/**
 * Itens de navegação — fonte única para Sidebar e Header.
 * Substitui os 2 arrays duplicados.
 */

import type { UserRole } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  LayoutDashboard,
  Users,
  ClipboardList,
  Search,
  Activity,
  CreditCard,
  FileText,
  User,
  Banknote,
} from 'lucide-react';

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];  // Se não definido, visível para todos
}

export const MENU_ITEMS: MenuItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { href: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'atendente'] },
  { href: '/atendimentos', label: 'Atendimentos', icon: ClipboardList, roles: ['admin', 'atendente'] },
  { href: '/avaliacao', label: 'Fila Avaliação', icon: Search, roles: ['admin', 'avaliador'] },
  { href: '/execucao', label: 'Fila Execução', icon: Activity, roles: ['admin', 'executor'] },
  { href: '/meus-procedimentos', label: 'Meus Procedimentos', icon: ClipboardList, roles: ['avaliador', 'executor'] },
  { href: '/pagamentos', label: 'Pagamentos', icon: CreditCard, roles: ['admin', 'atendente'] },
  { href: '/procedimentos', label: 'Procedimentos', icon: FileText, roles: ['admin'] },
  { href: '/usuarios', label: 'Usuários', icon: User, roles: ['admin'] },
  { href: '/minhas-comissoes', label: 'Minhas Comissões', icon: Banknote, roles: ['avaliador'] },
  { href: '/comissoes', label: 'Comissões', icon: Banknote, roles: ['admin'] },
];

/** Labels de view mode */
export const VIEW_MODE_LABELS: Record<string, string> = {
  admin: 'Modo Admin',
  dentista: 'Modo Dentista',
};
