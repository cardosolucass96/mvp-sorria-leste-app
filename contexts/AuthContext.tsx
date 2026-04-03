'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Usuario, UserRole } from '@/lib/types';

export type ViewMode = 'admin' | 'dentista';

interface UsuarioComUnidades extends Usuario {
  unidade_ids: number[];
  unidade_atual: number;
}

interface AuthContextType {
  user: UsuarioComUnidades | null;
  isLoading: boolean;
  login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  viewMode: ViewMode;
  toggleViewMode: () => void;
  effectiveRole: UserRole | null;
  isAdmin: boolean;
  // Unidades
  currentUnidade: number | null;
  availableUnidades: number[];
  unidadeNomes: Record<number, string>;
  switchUnit: (unidadeId: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'sorria-leste-user';
const VIEW_MODE_KEY = 'sorria-leste-view-mode';
const UNIT_KEY = 'sorria-leste-unidade';
const UNIT_NOMES_KEY = 'sorria-leste-unidade-nomes';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UsuarioComUnidades | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('admin');
  const [currentUnidade, setCurrentUnidade] = useState<number | null>(null);
  const [unidadeNomes, setUnidadeNomes] = useState<Record<number, string>>({});

  // Buscar nomes das unidades
  const fetchUnidadeNomes = async () => {
    try {
      const storedNomes = localStorage.getItem(UNIT_NOMES_KEY);
      if (storedNomes) {
        setUnidadeNomes(JSON.parse(storedNomes));
      }
      const res = await fetch('/api/unidades');
      if (res.ok) {
        const unidades: { id: number; nome: string }[] = await res.json();
        const nomes: Record<number, string> = {};
        unidades.forEach(u => { nomes[u.id] = u.nome; });
        setUnidadeNomes(nomes);
        localStorage.setItem(UNIT_NOMES_KEY, JSON.stringify(nomes));
      }
    } catch { /* silent */ }
  };

  // Carregar usuário e viewMode do localStorage ao iniciar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        // Restaurar unidade do localStorage ou do user
        const storedUnit = localStorage.getItem(UNIT_KEY);
        if (storedUnit) {
          setCurrentUnidade(parseInt(storedUnit));
        } else if (parsed.unidade_atual) {
          setCurrentUnidade(parsed.unidade_atual);
        }
        fetchUnidadeNomes();
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const storedViewMode = localStorage.getItem(VIEW_MODE_KEY);
    if (storedViewMode === 'dentista') {
      setViewMode('dentista');
    }
    setIsLoading(false);
  }, []);

  // Escutar evento global de sessão expirada (401 em qualquer API)
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setViewMode('admin');
      setCurrentUnidade(null);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VIEW_MODE_KEY);
      localStorage.removeItem(UNIT_KEY);
      document.cookie = 'auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  // Login: autentica usuário com email e senha
  const login = async (email: string, senha: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Erro ao fazer login' };
      }

      setUser(data.user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
      // Setar unidade
      const unidadeInicial = data.user.unidade_atual || (data.user.unidade_ids?.[0]) || 1;
      setCurrentUnidade(unidadeInicial);
      localStorage.setItem(UNIT_KEY, String(unidadeInicial));
      fetchUnidadeNomes();
      // Admin entra em modo admin por padrão
      if (data.user.role === 'admin') {
        setViewMode('admin');
        localStorage.setItem(VIEW_MODE_KEY, 'admin');
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão' };
    }
  };

  // Logout: limpa usuário, viewMode, unidade e cookie
  const logout = () => {
    setUser(null);
    setViewMode('admin');
    setCurrentUnidade(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VIEW_MODE_KEY);
    localStorage.removeItem(UNIT_KEY);
    // Expirar o cookie auth-token no browser
    document.cookie = 'auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  };

  // O usuário real é admin?
  const isAdmin = user?.role === 'admin';

  // Alterna entre visão admin e dentista (apenas para admins)
  const toggleViewMode = () => {
    if (!isAdmin) return;
    const newMode = viewMode === 'admin' ? 'dentista' : 'admin';
    setViewMode(newMode);
    localStorage.setItem(VIEW_MODE_KEY, newMode);
  };

  // Role efetivo baseado no viewMode
  // Admin em modo dentista → age como avaliador+executor
  const effectiveRole: UserRole | null = (() => {
    if (!user) return null;
    if (user.role === 'admin' && viewMode === 'dentista') {
      return 'executor'; // base role, mas hasRole tratará avaliador+executor
    }
    return user.role;
  })();

  // Unidades disponíveis para o usuário
  const availableUnidades = user?.unidade_ids || [];

  // Troca unidade ativa
  const switchUnit = (unidadeId: number) => {
    if (!user) return;
    // Admin pode acessar qualquer unidade
    if (user.role !== 'admin' && !user.unidade_ids.includes(unidadeId)) return;
    setCurrentUnidade(unidadeId);
    localStorage.setItem(UNIT_KEY, String(unidadeId));
  };

  // Verifica se usuário tem determinado role (respeita viewMode)
  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    
    // Admin em modo dentista: simula avaliador + executor
    if (user.role === 'admin' && viewMode === 'dentista') {
      return roleArray.includes('avaliador') || roleArray.includes('executor');
    }
    
    return roleArray.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading, login, logout, hasRole,
      viewMode, toggleViewMode, effectiveRole, isAdmin,
      currentUnidade, availableUnidades, unidadeNomes, switchUnit
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
