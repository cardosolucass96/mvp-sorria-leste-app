'use client';

import { useEffect, useState } from 'react';
import { tempoDecorrido } from '@/lib/utils/formatters';

interface ElapsedTimeProps {
  inicio: string | null | undefined;
  fim?: string | null;
  refreshMs?: number;
}

function parseDateFallback(valor: string): Date | null {
  const texto = valor.trim();
  if (!texto) return null;

  const normalizado = texto.includes(' ')
    ? texto.replace(' ', 'T')
    : texto;

  const semMicros = normalizado.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:\d{2}|$))/, '$1');
  const candidatos = [
    semMicros,
    normalizado,
    normalizado.replace('Z', ''),
    texto,
  ];

  for (const candidato of candidatos) {
    const d = new Date(candidato);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }

  return null;
}

function formatarDuracao(diffMs: number): string {
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const horas = Math.floor(mins / 60);
  const minRest = mins % 60;
  if (horas < 24) return minRest > 0 ? `${horas}h ${minRest}min` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const horaRest = horas % 24;
  if (dias < 7) return horaRest > 0 ? `${dias}d ${horaRest}h` : `${dias}d`;
  return `${dias} dias`;
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

  const fimResolvido = fim ?? new Date(agora).toISOString();
  const tempo = tempoDecorrido(inicio, fimResolvido);
  if (tempo !== '-') return <>{tempo}</>;

  if (!inicio) return <>-</>;

  const inicioDate = parseDateFallback(inicio);
  const fimDate = parseDateFallback(fimResolvido);

  if (!inicioDate || !fimDate) return <>-</>;

  const diffMs = fimDate.getTime() - inicioDate.getTime();
  if (diffMs < 0) return <>-</>;

  return <>{formatarDuracao(diffMs)}</>;
}
