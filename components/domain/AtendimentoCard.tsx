/**
 * AtendimentoCard — card para listagem de atendimentos.
 * Exibe cliente, status badge, data, total, quantidade de itens.
 */

import { Stethoscope, DollarSign, ClipboardList, User } from 'lucide-react';
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
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0" aria-hidden="true">
              <Stethoscope className="w-5 h-5 text-primary-500" />
            </div>
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
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-neutral-500">
              {atendimento.total != null && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  {formatarMoeda(atendimento.total)}
                </span>
              )}
              {atendimento.qtd_itens != null && (
                <span className="flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" />
                  {atendimento.qtd_itens} item(ns)
                </span>
              )}
              {atendimento.avaliador_nome && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {atendimento.avaliador_nome}
                </span>
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
