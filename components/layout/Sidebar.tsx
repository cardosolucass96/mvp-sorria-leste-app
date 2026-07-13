'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Activity } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ITEMS, type MenuItem } from '@/lib/constants/navigation';
import { useCategoriasFila } from '@/lib/hooks/useCategoriasFila';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/_shadcn/sidebar';

function resolveIcon(name: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[name] ?? Activity;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, hasRole, currentUnidade, unidadeNomes } = useAuth();
  const categoriasFila = useCategoriasFila();

  const visibleStaticItems = MENU_ITEMS.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return hasRole(item.roles);
  });

  // Injeta items de fila dinâmicos logo após "Orçamentos em Aberto" quando existir;
  // senão, logo após "Followup" e, por último, "Agenda".
  const orcamentosIdx = visibleStaticItems.findIndex(i => i.href === '/orcamentos-em-aberto');
  const followupIdx = visibleStaticItems.findIndex(i => i.href === '/followup');
  const agendaIdx = visibleStaticItems.findIndex(i => i.href === '/agenda');
  const injectionIdx = orcamentosIdx >= 0 ? orcamentosIdx : followupIdx >= 0 ? followupIdx : agendaIdx;
  const filaItems: MenuItem[] = categoriasFila.map(c => ({
    href: `/fila/${c.slug}`,
    label: `Fila ${c.nome}`,
    icon: resolveIcon(c.icone),
  }));

  const visibleMenuItems: MenuItem[] =
    injectionIdx >= 0
      ? [
          ...visibleStaticItems.slice(0, injectionIdx + 1),
          ...filaItems,
          ...visibleStaticItems.slice(injectionIdx + 1),
        ]
      : [...visibleStaticItems, ...filaItems];

  return (
    <ShadcnSidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Unidade badge */}
      {currentUnidade && (
        <SidebarHeader className="px-3 pt-3 pb-0">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">
              {unidadeNomes[currentUnidade] || `Unidade ${currentUnidade}`}
            </span>
          </div>
          <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center py-1">
            <Building2 className="size-4 text-muted-foreground" />
          </div>
        </SidebarHeader>
      )}

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                const ItemIcon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={
                        <Link
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                        />
                      }
                    >
                      <ItemIcon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-center gap-2 px-2 py-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs text-muted-foreground">Sorria Leste v1.0</p>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </ShadcnSidebar>
  );
}
