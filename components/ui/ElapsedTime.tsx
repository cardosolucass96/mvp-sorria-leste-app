'use client';

import { useEffect, useState } from 'react';
import { tempoDecorrido } from '@/lib/utils/formatters';

interface ElapsedTimeProps {
  inicio: string | null | undefined;
  fim?: string | null;
  refreshMs?: number;
}

export default function ElapsedTime({
  inicio,
  fim = null,
  refreshMs = 30000,
}: ElapsedTimeProps) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (fim) return;

    const intervalId = window.setInterval(() => {
      setAgora(Date.now());
    }, refreshMs);

    return () => window.clearInterval(intervalId);
  }, [fim, refreshMs]);

  return <>{tempoDecorrido(inicio, fim ?? new Date(agora).toISOString())}</>;
}
