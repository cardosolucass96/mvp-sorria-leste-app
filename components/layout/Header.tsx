'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  avaliador: 'Avaliador',
  executor: 'Executor',
};

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-blue-600 text-white shadow-md">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <span className="text-2xl">🦷</span>
          <h1 className="text-xl font-bold">Sorria Leste</h1>
        </Link>

        {/* Info do usuário */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="text-right">
                <p className="text-sm font-medium">{user.nome}</p>
                <p className="text-xs text-blue-200">{roleLabels[user.role]}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded text-sm transition-colors"
              >
                Sair
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded text-sm transition-colors"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
