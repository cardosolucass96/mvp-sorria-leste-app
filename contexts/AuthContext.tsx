'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Usuario, UserRole } from '@/lib/types';

export type ViewMode = 'admin' | 'dentista';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  viewMode: ViewMode;
  toggleViewMode: () => void;
  effectiveRole: UserRole | null;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'sorria-leste-user';
const VIEW_MODE_KEY = 'sorria-leste-view-mode';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('admin');

  // Carregar usuário e viewMode do localStorage ao iniciar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
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

  // Logout: limpa usuário e viewMode
  const logout = () => {
    setUser(null);
    setViewMode('admin');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VIEW_MODE_KEY);
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
      viewMode, toggleViewMode, effectiveRole, isAdmin
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
