/**
 * StatusBadge — exibe badge de status com cor e ícone automáticos.
 * Usa Badge (Sprint 1) + STATUS_CONFIG/ITEM_STATUS_CONFIG/PARCELA_STATUS_CONFIG (Sprint 0).
 */

import Badge from '@/components/ui/Badge';
import type { BadgeProps } from '@/components/ui/Badge';
import { STATUS_CONFIG, ITEM_STATUS_CONFIG, PARCELA_STATUS_CONFIG } from '@/lib/constants/status';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';
import type { AtendimentoStatus, ItemStatus, AgendamentoStatus } from '@/lib/types';
import type { ParcelaStatus } from '@/lib/constants/status';
import type { LucideIcon } from 'lucide-react';

export type StatusBadgeType = 'atendimento' | 'item' | 'parcela' | 'agendamento';

export interface StatusBadgeProps {
  type: StatusBadgeType;
  status: string;
  showIcon?: boolean;
  size?: BadgeProps['size'];
  className?: string;
}

function getBadgeColor(bgCor: string): NonNullable<BadgeProps['color']> {
  if (bgCor.includes('evaluation') || bgCor.includes('purple')) return 'evaluation';
  if (bgCor.includes('primary') || bgCor.includes('orange')) return 'orange';
  if (bgCor.includes('warning') || bgCor.includes('yellow') || bgCor.includes('amber')) return 'yellow';
  if (bgCor.includes('success') || bgCor.includes('green')) return 'green';
  if (bgCor.includes('info') || bgCor.includes('blue')) return 'blue';
  if (bgCor.includes('error') || bgCor.includes('red') || bgCor.includes('destructive')) return 'red';
  return 'gray';
}

export default function StatusBadge({
  type,
  status,
  showIcon = true,
  size = 'md',
  className,
}: StatusBadgeProps) {
  let label = status;
  let Icon: LucideIcon | null = null;
  let color: NonNullable<BadgeProps['color']> = 'gray';

  if (type === 'atendimento' && status in STATUS_CONFIG) {
    const config = STATUS_CONFIG[status as AtendimentoStatus];
    label = config.label;
    Icon = config.icon;
    color = getBadgeColor(config.bgCor);
  } else if (type === 'item' && status in ITEM_STATUS_CONFIG) {
    const config = ITEM_STATUS_CONFIG[status as ItemStatus];
    label = config.label;
    Icon = config.icon;
    color = getBadgeColor(config.bgCor);
  } else if (type === 'parcela' && status in PARCELA_STATUS_CONFIG) {
    const config = PARCELA_STATUS_CONFIG[status as ParcelaStatus];
    label = config.label;
    color = getBadgeColor(config.bgCor);
  } else if (type === 'agendamento' && status in AGENDAMENTO_STATUS_CONFIG) {
    const config = AGENDAMENTO_STATUS_CONFIG[status as AgendamentoStatus];
    label = config.label;
    color = getBadgeColor(config.bgCor);
  }

  return (
    <Badge color={color} size={size} className={className}>
      {showIcon && Icon && <Icon className="w-3 h-3 mr-1 inline-block" aria-hidden="true" />}
      {label}
    </Badge>
  );
}
