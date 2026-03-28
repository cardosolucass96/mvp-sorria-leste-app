'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Shield, Stethoscope, ArrowLeftRight, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { MENU_ITEMS, VIEW_MODE_LABELS } from '@/lib/constants/navigation';
import { ROLE_LABELS } from '@/lib/constants/roles';

export default function Header() {
  const { user, logout, hasRole, viewMode, toggleViewMode, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem');
      return;
    }

    if (novaSenha.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/senha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: user?.id,
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || 'Erro ao alterar senha');
      } else {
        setSucesso('Senha alterada com sucesso!');
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmarSenha('');
        setTimeout(() => {
          setShowSenhaModal(false);
          setSucesso('');
        }, 2000);
      }
    } catch {
      setErro('Erro de conexão');
    }

    setLoading(false);
  };

  const fecharModal = () => {
    setShowSenhaModal(false);
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
    setErro('');
    setSucesso('');
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
                      : 'bg-emerald-400/20 border-emerald-300/50 text-emerald-100 hover:bg-emerald-400/30'
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
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
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

      {/* Modal Trocar Senha */}
      {showSenhaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
                Alterar Senha
              </h2>
              <button
                onClick={fecharModal}
                className="text-neutral-400 hover:text-neutral-600 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleTrocarSenha} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Senha Atual
                </label>
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>

              {erro && (
                <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg text-sm">
                  {erro}
                </div>
              )}

              {sucesso && (
                <div className="bg-success-50 border border-success-200 text-success-700 px-4 py-3 rounded-lg text-sm">
                  {sucesso}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="flex-1 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
