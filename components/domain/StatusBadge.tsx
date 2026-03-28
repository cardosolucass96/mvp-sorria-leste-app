/**
 * StatusBadge — exibe badge de status com cor e ícone automáticos.
 * Usa Badge (Sprint 1) + STATUS_CONFIG/ITEM_STATUS_CONFIG/PARCELA_STATUS_CONFIG (Sprint 0).
 */

import Badge from '@/components/ui/Badge';
import type { BadgeProps } from '@/components/ui/Badge';
import { STATUS_CONFIG, ITEM_STATUS_CONFIG, PARCELA_STATUS_CONFIG } from '@/lib/constants/status';
import type { AtendimentoStatus, ItemStatus } from '@/lib/types';
import type { ParcelaStatus } from '@/lib/constants/status';
import type { LucideIcon } from 'lucide-react';

export type StatusBadgeType = 'atendimento' | 'item' | 'parcela';

export interface StatusBadgeProps {
  type: StatusBadgeType;
  status: string;
  showIcon?: boolean;
  size?: BadgeProps['size'];
  className?: string;
}

// Mapear cor do config para BadgeProps['color']
const corToBadgeColor: Record<string, BadgeProps['color']> = {
  'bg-neutral-100': 'gray',
  'bg-info-100': 'blue',
  'bg-warning-100': 'amber',
  'bg-evaluation-100': 'evaluation',
  'bg-success-100': 'green',
  'bg-primary-100': 'orange',
  'bg-yellow-100': 'yellow',
  'bg-error-100': 'red',
};

function getBadgeColor(bgCor: string): NonNullable<BadgeProps['color']> {
  return corToBadgeColor[bgCor] ?? 'gray';
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
  }

  return (
    <Badge color={color} size={size} className={className}>
      {showIcon && Icon && <Icon className="w-3 h-3 mr-1 inline-block" aria-hidden="true" />}
      {label}
    </Badge>
  );
}
