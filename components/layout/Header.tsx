'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/types';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  avaliador: 'Avaliador',
  executor: 'Executor',
};

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
}

const menuItems: MenuItem[] = [
  { href: '/', label: 'Início', icon: '🏠' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin'] },
  { href: '/clientes', label: 'Clientes', icon: '👥', roles: ['admin', 'atendente'] },
  { href: '/atendimentos', label: 'Atendimentos', icon: '📋', roles: ['admin', 'atendente'] },
  { href: '/avaliacao', label: 'Fila Avaliação', icon: '🔍', roles: ['admin', 'avaliador'] },
  { href: '/execucao', label: 'Fila Execução', icon: '🦷', roles: ['admin', 'executor'] },
  { href: '/pagamentos', label: 'Pagamentos', icon: '💰', roles: ['admin', 'atendente'] },
  { href: '/procedimentos', label: 'Procedimentos', icon: '📑', roles: ['admin'] },
  { href: '/usuarios', label: 'Usuários', icon: '👤', roles: ['admin'] },
  { href: '/comissoes', label: 'Comissões', icon: '💵', roles: ['admin'] },
  { href: '/minhas-comissoes', label: 'Minhas Comissões', icon: '💰', roles: ['avaliador', 'executor'] },
];

export default function Header() {
  const { user, logout, hasRole } = useAuth();
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
    <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg">
      <div className="flex items-center justify-between px-3 md:px-6 py-3">
        {/* Menu Hamburguer Mobile */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 hover:bg-orange-600 rounded-lg transition-colors"
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
          <div className="bg-white rounded-lg p-1 shadow-md">
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
            <p className="hidden sm:block text-xs text-orange-100">Clínica Odontológica</p>
          </div>
        </Link>

        {/* Info do usuário */}
        <div className="flex items-center gap-2 md:gap-4">
          {user ? (
            <>
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold">{user.nome}</p>
                <p className="text-xs text-orange-100">{roleLabels[user.role]}</p>
              </div>
              <button
                onClick={() => setShowSenhaModal(true)}
                className="bg-orange-600 hover:bg-orange-700 px-2 md:px-3 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
                title="Alterar senha"
              >
                🔑
              </button>
              <button
                onClick={handleLogout}
                className="bg-orange-700 hover:bg-orange-800 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
              >
                Sair
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-orange-700 hover:bg-orange-800 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:shadow-md"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>

      {/* Menu Mobile Dropdown */}
      {showMobileMenu && (
        <nav className="md:hidden bg-stone-800 border-t border-stone-700">
          <ul className="py-2">
            {menuItems
              .filter((item) => !item.roles || (user && hasRole(item.roles)))
              .map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setShowMobileMenu(false)}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        isActive
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'text-gray-300 hover:bg-stone-700'
                      }`}
                    >
                      <span>{item.icon}</span>
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
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">🔑 Alterar Senha</h2>
              <button
                onClick={fecharModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleTrocarSenha} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha Atual
                </label>
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>

              {erro && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {erro}
                </div>
              )}

              {sucesso && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                  {sucesso}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={fecharModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
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
