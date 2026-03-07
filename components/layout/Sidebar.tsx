'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ITEMS } from '@/lib/constants/navigation';

import { ViewMode } from '@/contexts/AuthContext';

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
    <aside className="hidden md:flex w-64 bg-stone-800 text-white min-h-screen flex-col" role="navigation" aria-label="Menu principal">
      {/* Toggle Admin/Dentista */}
      {isAdmin && (
        <div className="px-4 pt-4">
          <button
            onClick={toggleViewMode}
            aria-label={viewMode === 'admin' ? 'Trocar para vis\u00e3o Dentista' : 'Trocar para vis\u00e3o Admin'}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'admin'
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 hover:bg-orange-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            <span className="text-base">{viewMode === 'admin' ? '🛡️' : '🦷'}</span>
            <span>{viewMode === 'admin' ? 'Modo Admin' : 'Modo Dentista'}</span>
            <svg className="w-3.5 h-3.5 opacity-60 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
        </div>
      )}

      <nav className="py-4 flex-1">
        <ul className="space-y-1">
          {visibleMenuItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href));
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-6 py-3 transition-all border-l-4
                    ${isActive 
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500 font-medium' 
                      : 'text-gray-300 hover:bg-stone-700 hover:text-orange-300 border-transparent'
                    }
                  `}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Rodapé da Sidebar */}
      <div className="p-4 border-t border-stone-700">
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
          <p className="text-xs text-stone-400">
            Sorria Leste v1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
