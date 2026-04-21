'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { StatusBadge } from '@/components/domain';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import type { AtendimentoResumo } from './types';

export interface AbaAtendimentosProps {
  atendimentos: AtendimentoResumo[];
}

export default function AbaAtendimentos({ atendimentos }: AbaAtendimentosProps) {
  if (!atendimentos.length) {
    return (
      <p className="text-center py-8 text-muted text-sm">Nenhum atendimento registrado</p>
    );
  }

  return (
    <div className="space-y-2">
      {atendimentos.map(a => (
        <Link
          key={a.id}
          href={`/atendimentos/${a.id}`}
          className="block rounded-lg border border-neutral-200 p-3 hover:bg-surface-secondary active:bg-neutral-100 transition"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardList className="w-4 h-4 text-muted shrink-0" />
                <span className="font-medium text-sm">Atend. #{a.id}</span>
                <StatusBadge type="atendimento" status={a.status} />
              </div>
              <p className="text-xs text-muted mt-1">{formatarDataHora(a.created_at)}</p>
              {a.avaliador_nome && (
                <p className="text-xs text-muted">Avaliador: {a.avaliador_nome}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium">{formatarMoeda(a.total ?? 0)}</p>
              <p className="text-xs text-success-600 font-medium">
                Pago: {formatarMoeda(a.total_pago ?? 0)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
