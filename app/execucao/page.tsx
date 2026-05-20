'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCategoriasFila } from '@/lib/hooks/useCategoriasFila';

export default function ExecucaoRedirect() {
  const router = useRouter();
  const categorias = useCategoriasFila();

  useEffect(() => {
    if (categorias.length === 0) return;
    // Preferência: fila "geral" → primeira fila disponível
    const geral = categorias.find(c => c.slug === 'geral');
    const alvo = geral || categorias[0];
    router.replace(`/fila/${alvo.slug}`);
  }, [categorias, router]);

  return null;
}
