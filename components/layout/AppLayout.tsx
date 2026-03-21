'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

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

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Rotas públicas não usam o layout completo
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Mostra loading enquanto verifica autenticação
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="text-center">
          <span className="text-4xl">🦷</span>
          <p className="mt-2 text-neutral-600">Carregando...</p>
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
      {/* Skip to content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
      >
        Pular para conteúdo
      </a>
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main id="main-content" className="flex-1 bg-surface-muted p-3 md:p-6" role="main">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
