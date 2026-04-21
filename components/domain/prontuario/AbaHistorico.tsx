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
      <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-neutral-200" />
      <div className="space-y-3">
        {historico.map((ev, i) => {
          const cfg = HISTORICO_CONFIG[ev.tipo] ?? { label: ev.tipo, cor: 'bg-neutral-400' };
          return (
            <div key={i} className="flex gap-3 relative">
              <div
                className={`w-4 h-4 rounded-full mt-0.5 shrink-0 z-10 ring-2 ring-white ${cfg.cor}`}
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
