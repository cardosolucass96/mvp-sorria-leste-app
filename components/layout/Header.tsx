'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import useDebounce from '@/lib/utils/useDebounce';
import {
  Shield,
  Stethoscope,
  ArrowLeftRight,
  KeyRound,
  Sun,
  Moon,
  LogOut,
  User,
  Search,
  X,
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/_shadcn/popover';
import { SidebarTrigger, useSidebar } from '@/components/ui/_shadcn/sidebar';

interface ClienteSugestao {
  id: number;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
}

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
  const [mostrarBuscaClientes, setMostrarBuscaClientes] = useState(false);
  const [termoBuscaClientes, setTermoBuscaClientes] = useState('');
  const [clientesSugeridos, setClientesSugeridos] = useState<ClienteSugestao[]>([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');
  const termoBuscaDebounced = useDebounce(termoBuscaClientes.trim(), 250);

  const isDarkMode = mounted && resolvedTheme === 'dark';
  const themeActionLabel = isDarkMode ? 'Modo claro' : 'Modo escuro';

  const handleThemeToggle = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const irParaListaClientes = (termo: string) => {
    const buscaNormalizada = termo.trim();
    const destino = buscaNormalizada
      ? `/clientes?busca=${encodeURIComponent(buscaNormalizada)}`
      : '/clientes';

    setMostrarBuscaClientes(false);
    setClientesSugeridos([]);
    setErroClientes('');
    router.push(destino);
  };

  const handleBuscarClientes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    irParaListaClientes(termoBuscaClientes);
    setMostrarBuscaClientes(false);
    setTermoBuscaClientes('');
  };

  const handleSelecionarCliente = (clienteId: number) => {
    setMostrarBuscaClientes(false);
    setTermoBuscaClientes('');
    setClientesSugeridos([]);
    router.push(`/clientes/${clienteId}`);
  };

  useEffect(() => {
    if (!mostrarBuscaClientes || !termoBuscaDebounced) {
      setClientesSugeridos([]);
      setErroClientes('');
      setBuscandoClientes(false);
      return;
    }

    const controller = new AbortController();
    const buscarClientes = async () => {
      setBuscandoClientes(true);
      setErroClientes('');

      try {
        const params = new URLSearchParams({
          busca: termoBuscaDebounced,
          limit: '8',
          ordem: 'nome',
        });

        const response = await fetch(`/api/clientes?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Falha ao buscar clientes');
        }

        const dados = await response.json();
        const lista = Array.isArray(dados) ? dados : dados?.clientes;
        const normalized = Array.isArray(lista) ? lista : [];
        setClientesSugeridos(
          normalized.map((cliente: ClienteSugestao) => ({
            id: cliente.id,
            nome: cliente.nome,
            cpf: cliente.cpf,
            telefone: cliente.telefone,
            email: cliente.email,
          }))
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErroClientes('Não foi possível buscar clientes');
        setClientesSugeridos([]);
      } finally {
        setBuscandoClientes(false);
      }
    };

    buscarClientes();

    return () => controller.abort();
  }, [termoBuscaDebounced, mostrarBuscaClientes]);

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
              <Popover
                open={mostrarBuscaClientes}
                onOpenChange={(open) => {
                  setMostrarBuscaClientes(open);
                  if (!open) {
                    setTermoBuscaClientes('');
                    setClientesSugeridos([]);
                    setErroClientes('');
                  }
                }}
              >
                <PopoverTrigger
                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Pesquisar clientes"
                  aria-label="Pesquisar clientes"
                >
                  <Search className="size-4" />
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-[320px]">
                  <form onSubmit={handleBuscarClientes} className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Pesquisar clientes</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        autoFocus
                        type="search"
                        value={termoBuscaClientes}
                        onChange={(e) => setTermoBuscaClientes(e.target.value)}
                        placeholder="Buscar por nome, CPF, telefone ou email..."
                        className="w-full pl-10 pr-3 py-2 border border-input rounded-lg text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                      {termoBuscaClientes && (
                        <button
                          type="button"
                          onClick={() => setTermoBuscaClientes('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
                          aria-label="Limpar busca"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      disabled={!termoBuscaClientes.trim()}
                    >
                      <Search className="size-4" />
                      Buscar
                    </button>

                    {termoBuscaClientes.trim() && (
                      <div className="space-y-1 pt-1">
                        {buscandoClientes && (
                          <p className="text-xs text-muted-foreground">Buscando clientes...</p>
                        )}

                        {!buscandoClientes && erroClientes && (
                          <p className="text-xs text-destructive">{erroClientes}</p>
                        )}

                        {!buscandoClientes &&
                          !erroClientes &&
                          (clientesSugeridos.length > 0 ? (
                            <ul className="space-y-1 max-h-56 overflow-auto">
                              {clientesSugeridos.map((cliente) => (
                                <li key={cliente.id}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelecionarCliente(cliente.id)}
                                    className="w-full text-left rounded-md px-2.5 py-2 text-sm hover:bg-accent transition-colors"
                                  >
                                    <p className="font-medium text-foreground">{cliente.nome}</p>
                                    {(cliente.cpf || cliente.telefone || cliente.email) && (
                                      <p className="text-xs text-muted-foreground">
                                        {[cliente.cpf, cliente.telefone, cliente.email].filter(Boolean).join(' • ')}
                                      </p>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Nenhum cliente encontrado</p>
                          ))}

                        {clientesSugeridos.length > 0 && (
                          <button
                            type="button"
                            className="w-full text-left rounded-md px-2.5 py-2 text-xs text-primary underline-offset-4 hover:underline"
                            onClick={() => irParaListaClientes(termoBuscaClientes)}
                          >
                            Ver todos os resultados
                          </button>
                        )}
                      </div>
                    )}
                  </form>
                </PopoverContent>
              </Popover>

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
