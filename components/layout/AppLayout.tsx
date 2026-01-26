'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

// Rotas públicas que não precisam de autenticação
const publicRoutes = ['/login'];

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    // Se não está carregando, não tem usuário e não é rota pública, redireciona
    if (!isLoading && !user && !isPublicRoute) {
      router.push('/login');
    }
  }, [isLoading, user, isPublicRoute, router]);

  // Rotas públicas não usam o layout completo
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Mostra loading enquanto verifica autenticação
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <span className="text-4xl">🦷</span>
          <p className="mt-2 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Se não tem usuário e não é rota pública, não renderiza (vai redirecionar)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 bg-gray-100 p-3 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
