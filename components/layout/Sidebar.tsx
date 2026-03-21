'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ITEMS } from '@/lib/constants/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, hasRole, viewMode, toggleViewMode, isAdmin } = useAuth();

  // Filtra itens do menu baseado no role do usuário (respeita viewMode)
  const visibleMenuItems = MENU_ITEMS.filter((item) => {
    if (!item.roles) return true; // Sem restrição de role
    if (!user) return false; // Não logado não vê itens restritos
    return hasRole(item.roles);
  });

  return (
    <aside className="hidden md:flex w-64 bg-sidebar text-white min-h-screen flex-col" aria-label="Barra lateral">
      {/* Toggle Admin/Dentista */}
      {isAdmin && (
        <div className="px-4 pt-4">
          <button
            onClick={toggleViewMode}
            aria-label={viewMode === 'admin' ? 'Trocar para visão Dentista' : 'Trocar para visão Admin'}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'admin'
                ? 'bg-sidebar-active/20 text-sidebar-text-active border border-sidebar-active/40 hover:bg-sidebar-active/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            <span className="text-base" aria-hidden="true">{viewMode === 'admin' ? '🛡️' : '🦷'}</span>
            <span>{viewMode === 'admin' ? 'Modo Admin' : 'Modo Dentista'}</span>
            <svg className="w-3.5 h-3.5 opacity-60 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
        </div>
      )}

      <nav className="py-4 flex-1" aria-label="Menu principal">
        <ul className="space-y-1">
          {visibleMenuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    flex items-center gap-3 px-6 py-3 transition-all border-l-4
                    ${isActive
                      ? 'bg-sidebar-active/20 text-sidebar-text-active border-sidebar-active font-medium'
                      : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active border-transparent'
                    }
                  `}
                >
                  <span className="text-lg" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Rodapé da Sidebar */}
      <div className="p-4 border-t border-neutral-700">
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-sidebar-active rounded-full animate-pulse"></div>
          <p className="text-xs text-neutral-400">
            Sorria Leste v1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
