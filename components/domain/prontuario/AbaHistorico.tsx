'use client';

import Link from 'next/link';
import { formatarDataHora } from '@/lib/utils/formatters';
import { HISTORICO_CONFIG, type EventoHistorico } from './types';

export interface AbaHistoricoProps {
  historico: EventoHistorico[];
}

export default function AbaHistorico({ historico }: AbaHistoricoProps) {
  if (!historico.length) {
    return <p className="text-center py-8 text-muted text-sm">Nenhum evento registrado</p>;
  }

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-[7px] top-0 w-0.5 bg-border" />
      <div className="space-y-3">
        {historico.map((ev, i) => {
          const cfg = HISTORICO_CONFIG[ev.tipo] ?? { label: ev.tipo, cor: 'bg-muted' };
          return (
            <div key={i} className="flex gap-3 relative">
              <div
                className={`z-10 mt-0.5 h-4 w-4 shrink-0 rounded-full ring-2 ring-background ${cfg.cor}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {cfg.label}
                    </p>
                    <p className="text-sm text-foreground mt-0.5">{ev.descricao}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted">{formatarDataHora(ev.data)}</p>
                    {ev.ref_id > 0 && (
                      <Link
                        href={`/atendimentos/${ev.ref_id}`}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Ver →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
