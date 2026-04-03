'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

/**
 * Hook que retorna um `fetch` wrapper que injeta automaticamente
 * o header X-Unidade-Id com a unidade selecionada pelo usuário.
 *
 * Quando `currentUnidade` muda (troca de unidade), a referência do fetch
 * muda também, fazendo com que useEffects que dependem dele re-executem.
 */
export function useUnitFetch() {
  const { currentUnidade } = useAuth();

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (currentUnidade) {
        headers.set('X-Unidade-Id', String(currentUnidade));
      }
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        window.dispatchEvent(new Event('auth:expired'));
      }
      return res;
    },
    [currentUnidade]
  );
}
