'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  Shield,
  Stethoscope,
  ArrowLeftRight,
  KeyRound,
  Sun,
  Moon,
  LogOut,
  User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { VIEW_MODE_LABELS } from '@/lib/constants/navigation';
import { ROLE_LABELS } from '@/lib/constants/roles';
import TrocarSenhaModal from '@/components/domain/TrocarSenhaModal';
import UnitSelector from './UnitSelector';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/_shadcn/dropdown-menu';
import { SidebarTrigger, useSidebar } from '@/components/ui/_shadcn/sidebar';

function UserAvatar({ nome, className }: { nome: string; className?: string }) {
  const initials = nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-xs',
        className
      )}
    >
      {initials}
    </div>
  );
}

const subscribe = () => () => {};

export default function Header() {
  const { user, logout, viewMode, toggleViewMode, isAdmin } = useAuth();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const sidebarContext = useSidebar();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [showSenhaModal, setShowSenhaModal] = useState(false);

  const isDarkMode = mounted && resolvedTheme === 'dark';
  const themeActionLabel = isDarkMode ? 'Modo claro' : 'Modo escuro';

  const handleThemeToggle = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-14 bg-background border-b border-border flex items-center justify-between px-3 md:px-4 gap-2">
        {/* Left: Sidebar trigger (desktop) + Logo */}
        <div className="flex items-center gap-2">
          {sidebarContext && (
            <SidebarTrigger className="hidden md:flex" />
          )}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <Image
              src="/logo-sorria-leste-laranja-fundo-transparente.svg"
              alt="Sorria Leste"
              width={32}
              height={32}
            />
            <span className="hidden sm:block text-base font-bold tracking-tight text-foreground">
              Sorria Leste
            </span>
          </Link>
        </div>

        {/* Right: Unit selector + theme + avatar dropdown */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {user && (
            <>
              <UnitSelector />

              {/* Theme toggle */}
              <button
                onClick={handleThemeToggle}
                className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                title={themeActionLabel}
                aria-label={`Ativar ${themeActionLabel.toLowerCase()}`}
                disabled={!mounted}
              >
                {isDarkMode ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>

              {/* Admin/Dentista toggle — desktop only */}
              {isAdmin && (
                <button
                  onClick={toggleViewMode}
                  className={cn(
                    'hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    viewMode === 'admin'
                      ? 'bg-muted text-foreground hover:bg-accent'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900'
                  )}
                  title={viewMode === 'admin' ? 'Trocar para visão Dentista' : 'Trocar para visão Admin'}
                >
                  {viewMode === 'admin' ? (
                    <Shield className="size-3.5" />
                  ) : (
                    <Stethoscope className="size-3.5" />
                  )}
                  <span>{VIEW_MODE_LABELS[viewMode]}</span>
                </button>
              )}

              {/* Avatar dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex items-center gap-2 rounded-md p-1 hover:bg-accent transition-colors cursor-pointer outline-none"
                >
                  <UserAvatar nome={user.nome} className="h-8 w-8" />
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-foreground leading-tight">{user.nome}</p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {isAdmin && viewMode === 'dentista' ? 'Dentista' : ROLE_LABELS[user.role]}
                    </p>
                  </div>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" sideOffset={8} className="w-56">
                  {/* Mobile-only: user info */}
                  <DropdownMenuGroup className="md:hidden">
                    <DropdownMenuLabel>
                      <div>
                        <p className="font-medium">{user.nome}</p>
                        <p className="text-xs text-muted-foreground font-normal">
                          {isAdmin && viewMode === 'dentista' ? 'Dentista' : ROLE_LABELS[user.role]}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="md:hidden" />

                  {/* Mobile-only: theme toggle */}
                  <DropdownMenuItem
                    className="sm:hidden"
                    onClick={handleThemeToggle}
                  >
                    {isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    {themeActionLabel}
                  </DropdownMenuItem>

                  {/* Mobile-only: Admin/Dentista toggle */}
                  {isAdmin && (
                    <>
                      <DropdownMenuItem className="md:hidden" onClick={toggleViewMode}>
                        {viewMode === 'admin' ? (
                          <Stethoscope className="size-4" />
                        ) : (
                          <Shield className="size-4" />
                        )}
                        {viewMode === 'admin' ? 'Trocar p/ Dentista' : 'Trocar p/ Admin'}
                        <ArrowLeftRight className="size-3 ml-auto opacity-50" />
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="md:hidden" />
                    </>
                  )}

                  <DropdownMenuItem onClick={() => setShowSenhaModal(true)}>
                    <KeyRound className="size-4" />
                    Alterar senha
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={handleLogout} variant="destructive">
                    <LogOut className="size-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {!user && (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <User className="size-4" />
              Entrar
            </Link>
          )}
        </div>
      </header>

      <TrocarSenhaModal
        isOpen={showSenhaModal}
        onClose={() => setShowSenhaModal(false)}
      />
    </>
  );
}
