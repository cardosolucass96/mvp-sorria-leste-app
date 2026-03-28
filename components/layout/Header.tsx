'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Shield, Stethoscope, ArrowLeftRight, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ITEMS, VIEW_MODE_LABELS } from '@/lib/constants/navigation';
import { ROLE_LABELS } from '@/lib/constants/roles';
import TrocarSenhaModal from '@/components/domain/TrocarSenhaModal';

export default function Header() {
  const { user, logout, hasRole, viewMode, toggleViewMode, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSenhaModal, setShowSenhaModal] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-neutral-900 text-white shadow-sm border-b border-neutral-800">
      <div className="flex items-center justify-between px-3 md:px-6 py-3">
        {/* Menu Hamburguer Mobile */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 hover:bg-neutral-800 rounded-lg transition-colors"
          aria-label={showMobileMenu ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
          aria-expanded={showMobileMenu}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showMobileMenu ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="bg-surface rounded-lg p-1 shadow-md">
            <Image
              src="/logo-sorria-leste.jpg"
              alt="Sorria Leste"
              width={40}
              height={40}
              className="rounded"
            />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">Sorria Leste</h1>
            <p className="hidden sm:block text-xs text-neutral-400">Clínica Odontológica</p>
          </div>
        </Link>

        {/* Info do usuário */}
        <div className="flex items-center gap-2 md:gap-4">
          {user ? (
            <>
              {/* Toggle Admin/Dentista - Só para admins */}
              {isAdmin && (
                <button
                  onClick={toggleViewMode}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-2 ${
                    viewMode === 'admin'
                      ? 'bg-neutral-700 border-neutral-600 text-white hover:bg-neutral-600'
                      : 'bg-dentist-400/20 border-dentist-400/50 text-dentist-100 hover:bg-dentist-400/30'
                  }`}
                  title={viewMode === 'admin' ? 'Trocar para visão Dentista' : 'Trocar para visão Admin'}
                  aria-label={viewMode === 'admin' ? 'Trocar para visão Dentista' : 'Trocar para visão Admin'}
                >
                  {viewMode === 'admin'
                    ? <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                    : <Stethoscope className="w-3.5 h-3.5" aria-hidden="true" />
                  }
                  <span>{VIEW_MODE_LABELS[viewMode]}</span>
                  <ArrowLeftRight className="w-3 h-3 opacity-70" aria-hidden="true" />
                </button>
              )}

              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold">{user.nome}</p>
                <p className="text-xs text-neutral-400">
                  {isAdmin && viewMode === 'dentista' ? 'Dentista' : ROLE_LABELS[user.role]}
                </p>
              </div>
              <button
                onClick={() => setShowSenhaModal(true)}
                className="bg-neutral-700 hover:bg-neutral-600 px-2 md:px-3 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
                title="Alterar senha"
                aria-label="Alterar senha"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={handleLogout}
                className="bg-neutral-700 hover:bg-neutral-600 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
                aria-label="Sair do sistema"
              >
                Sair
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>

      {/* Menu Mobile Dropdown */}
      {showMobileMenu && (
        <nav className="md:hidden bg-sidebar border-t border-neutral-700" aria-label="Menu mobile">
          {/* Toggle Admin/Dentista - Mobile */}
          {isAdmin && (
            <div className="px-4 py-3 border-b border-neutral-700">
              <button
                onClick={toggleViewMode}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  viewMode === 'admin'
                    ? 'bg-sidebar-active/20 text-sidebar-text-active border border-sidebar-active/50'
                    : 'bg-dentist-500/20 text-dentist-400 border border-dentist-500/50'
                }`}
              >
                {viewMode === 'admin'
                  ? <Shield className="w-4 h-4" aria-hidden="true" />
                  : <Stethoscope className="w-4 h-4" aria-hidden="true" />
                }
                <span>{viewMode === 'admin' ? 'Trocar para Dentista' : 'Trocar para Admin'}</span>
              </button>
            </div>
          )}
          <ul className="py-2">
            {MENU_ITEMS
              .filter((item) => !item.roles || (user && hasRole(item.roles)))
              .map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                const ItemIcon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setShowMobileMenu(false)}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        isActive
                          ? 'bg-sidebar-active/20 text-sidebar-text-active'
                          : 'text-sidebar-text hover:bg-sidebar-hover'
                      }`}
                    >
                      <ItemIcon className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
      )}

      <TrocarSenhaModal
        isOpen={showSenhaModal}
        onClose={() => setShowSenhaModal(false)}
      />
    </header>
  );
}
