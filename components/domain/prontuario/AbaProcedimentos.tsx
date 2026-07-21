'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/domain';
import { formatarData, formatarMoeda, parseDentesLabels } from '@/lib/utils/formatters';
import type { ItemProcedimento } from './types';

export interface AbaProcedimentosProps {
  procedimentos: ItemProcedimento[];
}

export default function AbaProcedimentos({ procedimentos }: AbaProcedimentosProps) {
  if (!procedimentos.length) {
    return <p className="text-center py-8 text-muted text-sm">Nenhum procedimento registrado</p>;
  }

  return (
    <div className="space-y-2">
      {procedimentos.map(p => {
        const dentes = parseDentesLabels(p.dentes);
        return (
          <div key={p.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  {p.etapa_label ? `${p.procedimento_nome} — ${p.etapa_label}` : p.procedimento_nome}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted">
                  <Link
                    href={`/atendimentos/${p.atendimento_id}`}
                    className="text-primary-600 hover:underline"
                  >
                    Atend. #{p.atendimento_id}
                  </Link>
                  {p.executor_nome && <span>Executor: {p.executor_nome}</span>}
                  <span>{formatarData(p.created_at)}</span>
                </div>
                {dentes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {dentes.map(d => (
                      <span
                        key={d}
                        className="px-1.5 py-0.5 bg-surface-secondary rounded text-xs font-mono"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <StatusBadge type="item" status={p.status} item={p} />
                <p className="text-sm font-medium mt-1">{formatarMoeda(p.valor_pago)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
