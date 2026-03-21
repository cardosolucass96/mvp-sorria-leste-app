/**
 * AtendimentoCard — card para listagem de atendimentos.
 * Exibe cliente, status badge, data, total, quantidade de itens.
 */

import Card from '@/components/ui/Card';
import StatusBadge from './StatusBadge';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import type { AtendimentoStatus } from '@/lib/types';

export interface AtendimentoCardData {
  id: number;
  cliente_nome: string;
  status: AtendimentoStatus;
  created_at: string;
  total?: number;
  qtd_itens?: number;
  avaliador_nome?: string | null;
}

export interface AtendimentoCardProps {
  atendimento: AtendimentoCardData;
  onClick?: () => void;
  compact?: boolean;
  borderColor?: string;
  actions?: React.ReactNode;
  className?: string;
}

export default function AtendimentoCard({
  atendimento,
  onClick,
  compact = false,
  borderColor = 'border-l-blue-500',
  actions,
  className,
}: AtendimentoCardProps) {
  return (
    <Card onClick={onClick} borderColor={borderColor} className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">🦷</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-foreground truncate">
                {atendimento.cliente_nome}
              </h3>
              <p className="text-sm text-muted">
                Atendimento #{atendimento.id} • {formatarDataHora(atendimento.created_at)}
              </p>
            </div>
          </div>

          {!compact && (
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-neutral-600">
              {atendimento.total != null && (
                <span>💰 {formatarMoeda(atendimento.total)}</span>
              )}
              {atendimento.qtd_itens != null && (
                <span>📋 {atendimento.qtd_itens} item(ns)</span>
              )}
              {atendimento.avaliador_nome && (
                <span>👤 {atendimento.avaliador_nome}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge type="atendimento" status={atendimento.status} />
          {actions}
        </div>
      </div>
    </Card>
  );
}
