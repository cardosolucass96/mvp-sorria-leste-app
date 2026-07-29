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
  MessageCircle,
  CreditCard,
  FileText,
  User,
  Banknote,
  TrendingUp,
  Wallet,
  WalletCards,
  Calendar,
  Building2,
  Tags,
  MonitorPlay,
} from 'lucide-react';

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];  // Se não definido, visível para todos
}

export const MENU_ITEMS: MenuItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'atendente', 'avaliador'] },
  { href: '/clientes', label: 'Clientes', icon: Users, roles: ['admin', 'atendente'] },
  { href: '/atendimentos', label: 'Atendimentos', icon: ClipboardList, roles: ['admin', 'atendente'] },
  { href: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'] },
  { href: '/painel-tv', label: 'Painel TV', icon: MonitorPlay, roles: ['admin', 'atendente'] },
  { href: '/followup', label: 'Followup', icon: MessageCircle, roles: ['admin', 'atendente'] },
  { href: '/orcamentos-em-aberto', label: 'Orçamentos em Aberto', icon: FileText, roles: ['admin', 'atendente'] },
  { href: '/avaliacao', label: 'Fila Avaliação', icon: Search, roles: ['admin', 'avaliador'] },
  // Filas de execução são injetadas dinamicamente pelo Sidebar a partir de /api/categorias
  { href: '/meus-procedimentos', label: 'Meus Procedimentos', icon: ClipboardList, roles: ['avaliador', 'executor', 'ortodontista'] },
  { href: '/pagamentos', label: 'Pagamentos', icon: CreditCard, roles: ['admin', 'atendente'] },
  { href: '/fechamento-caixa', label: 'Fechamento de Caixa', icon: Wallet, roles: ['admin', 'atendente'] },
  { href: '/financeiro', label: 'Financeiro', icon: TrendingUp, roles: ['admin'] },
  { href: '/minhas-comissoes', label: 'Minhas Comissões', icon: Banknote, roles: ['avaliador'] },
  { href: '/comissoes', label: 'Comissões', icon: Banknote, roles: ['admin'] },
  { href: '/procedimentos', label: 'Procedimentos', icon: FileText, roles: ['admin'] },
  { href: '/formas-pagamento', label: 'Formas Pagto', icon: WalletCards, roles: ['admin'] },
  { href: '/categorias', label: 'Filas', icon: Tags, roles: ['admin'] },
  { href: '/usuarios', label: 'Usuários', icon: User, roles: ['admin'] },
  { href: '/termos', label: 'Termos', icon: FileText, roles: ['admin'] },
  { href: '/unidades', label: 'Unidades', icon: Building2, roles: ['admin'] },
];

/** Labels de view mode */
export const VIEW_MODE_LABELS: Record<string, string> = {
  admin: 'Modo Admin',
  dentista: 'Modo Dentista',
};
