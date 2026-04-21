'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth, type ViewMode } from '@/contexts/AuthContext';
import { MENU_ITEMS, type MenuItem } from '@/lib/constants/navigation';
import {
  Home,
  ClipboardList,
  Calendar,
  Activity,
  Search,
  Users,
  MoreHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/_shadcn/sheet';

interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function getBottomNavItems(effectiveRole: string | null): BottomNavItem[] {
  switch (effectiveRole) {
    case 'admin':
      return [
        { href: '/', label: 'Início', icon: Home },
        { href: '/atendimentos', label: 'Atendimentos', icon: ClipboardList },
        { href: '/agenda', label: 'Agenda', icon: Calendar },
        { href: '/execucao', label: 'Execução', icon: Activity },
      ];
    case 'atendente':
      return [
        { href: '/', label: 'Início', icon: Home },
        { href: '/atendimentos', label: 'Atendimentos', icon: ClipboardList },
        { href: '/agenda', label: 'Agenda', icon: Calendar },
        { href: '/clientes', label: 'Clientes', icon: Users },
      ];
    case 'avaliador':
      return [
        { href: '/', label: 'Início', icon: Home },
        { href: '/avaliacao', label: 'Avaliação', icon: Search },
        { href: '/agenda', label: 'Agenda', icon: Calendar },
        { href: '/meus-procedimentos', label: 'Meus Proc.', icon: ClipboardList },
      ];
    case 'executor':
      return [
        { href: '/', label: 'Início', icon: Home },
        { href: '/execucao', label: 'Execução', icon: Activity },
        { href: '/agenda', label: 'Agenda', icon: Calendar },
        { href: '/meus-procedimentos', label: 'Meus Proc.', icon: ClipboardList },
      ];
    default:
      return [
        { href: '/', label: 'Início', icon: Home },
        { href: '/agenda', label: 'Agenda', icon: Calendar },
      ];
  }
}

export default function BottomNav() {
  const pathname = usePathname();
  const { user, hasRole, effectiveRole } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const mainItems = getBottomNavItems(effectiveRole);
  const mainHrefs = new Set(mainItems.map((i) => i.href));

  // "Mais" items = all visible menu items NOT in the bottom bar
  const moreItems = MENU_ITEMS.filter((item) => {
    if (mainHrefs.has(item.href)) return false;
    if (!item.roles) return true;
    return hasRole(item.roles);
  });

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navegação móvel"
      >
        <div className="flex items-center justify-around h-16">
          {mainItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className="size-5" />
                <span className="text-[10px] font-medium leading-tight truncate max-w-[64px]">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* "Mais" button */}
          {moreItems.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full px-1 transition-colors',
                moreOpen ? 'text-primary' : 'text-muted-foreground'
              )}
              aria-label="Mais opções"
            >
              <MoreHorizontal className="size-5" />
              <span className="text-[10px] font-medium leading-tight">Mais</span>
            </button>
          )}
        </div>
      </nav>

      {/* Sheet with remaining items */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="grid grid-cols-3 gap-2 pb-4" aria-label="Menu completo">
            {moreItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              const ItemIcon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors min-h-[72px] justify-center',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <ItemIcon className="size-5" />
                  <span className="text-xs font-medium text-center leading-tight">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
