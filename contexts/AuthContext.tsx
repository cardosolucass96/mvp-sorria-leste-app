'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Usuario, UserRole } from '@/lib/types';

interface AuthContextType {
  user: Usuario | null;
  isLoading: boolean;
  login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'sorria-leste-user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar usuário do localStorage ao iniciar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
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
      return { success: true };
    } catch {
      return { success: false, error: 'Erro de conexão' };
    }
  };

  // Logout: limpa usuário
  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Verifica se usuário tem determinado role
  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole }}>
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
