'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Spinner from '@/components/ui/Spinner';
import { SidebarProvider, SidebarInset } from '@/components/ui/_shadcn/sidebar';
import { MENU_ITEMS } from '@/lib/constants/navigation';
import type { UserRole } from '@/lib/types';

interface AppLayoutProps {
  children: React.ReactNode;
}

const publicRoutes = ['/login'];

const EXTRA_ROUTE_ACCESS: Array<{ href: string; roles: UserRole[] }> = [
  { href: '/execucao', roles: ['admin', 'executor', 'ortodontista'] },
  { href: '/fila', roles: ['admin', 'avaliador', 'executor', 'ortodontista'] },
];

const ROUTE_ACCESS = [
  ...MENU_ITEMS
    .filter((item) => Array.isArray(item.roles))
    .map((item) => ({ href: item.href, roles: item.roles ?? [] })),
  ...EXTRA_ROUTE_ACCESS,
].sort((left, right) => right.href.length - left.href.length);

function getRequiredRoles(pathname: string): UserRole[] | null {
  const match = ROUTE_ACCESS.find((item) => (
    pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`))
  ));

  return match?.roles ?? null;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoading, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = publicRoutes.includes(pathname);
  const isTvRoute = pathname.startsWith('/painel-tv');
  const requiredRoles = isPublicRoute ? null : getRequiredRoles(pathname);
  const isUnauthorized = !!user && !!requiredRoles && !hasRole(requiredRoles);

  useEffect(() => {
    if (!isLoading && !user && !isPublicRoute) {
      router.push('/login');
    }
  }, [isLoading, user, isPublicRoute, router]);

  useEffect(() => {
    if (!isLoading && isUnauthorized) {
      router.replace('/');
    }
  }, [isLoading, isUnauthorized, router]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isUnauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  if (isTvRoute) {
    return (
      <main className="min-h-screen" role="main">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    );
  }

  return (
    <SidebarProvider defaultOpen={true}>
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
      >
        Pular para conteúdo
      </a>

      <Sidebar />

      <SidebarInset className="min-w-0 overflow-hidden">
        <Header />
        <main
          id="main-content"
          className="flex-1 flex flex-col min-w-0 min-h-0 bg-background p-4 md:p-6 pb-20 md:pb-6 overflow-hidden"
          role="main"
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </SidebarInset>

      <BottomNav />
    </SidebarProvider>
  );
}
