'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/types';

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[]; // Se não definido, todos podem ver
}

// Menu com controle de acesso por role
const menuItems: MenuItem[] = [
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

export default function Sidebar() {
  const pathname = usePathname();
  const { user, hasRole } = useAuth();

  // Filtra itens do menu baseado no role do usuário
  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.roles) return true; // Sem restrição de role
    if (!user) return false; // Não logado não vê itens restritos
    return hasRole(item.roles);
  });

  return (
    <aside className="hidden md:flex w-64 bg-stone-800 text-white min-h-screen flex-col">
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
