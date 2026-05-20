'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { CategoriaComRoles, UserRole } from '@/lib/types';

/**
 * Hook que retorna as categorias ativas visíveis para o usuário atual.
 * Visível = pelo menos uma das roles da categoria está entre as roles do usuário
 * (considerando viewMode de admin em modo dentista).
 */
export function useCategoriasFila(): CategoriaComRoles[] {
  const { user, hasRole } = useAuth();
  const [todas, setTodas] = useState<CategoriaComRoles[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/categorias?ativo=1');
        if (!res.ok) return;
        const cats: CategoriaComRoles[] = await res.json();
        if (!cancelled) setTodas(cats);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return useMemo(() => {
    if (!user) return [];
    return todas.filter(c => c.roles.some(r => hasRole(r as UserRole)));
  }, [todas, user, hasRole]);
}
