import type { FollowupStatus, FollowupTipo } from '@/lib/types';

type BadgeColor = 'gray' | 'orange' | 'amber' | 'green' | 'red' | 'blue' | 'purple' | 'evaluation' | 'yellow';

export const FOLLOWUP_STATUS_LABELS: Record<FollowupStatus, string> = {
  aberta: 'Aberta',
  concluida: 'Concluída',
};

export const FOLLOWUP_TIPO_CONFIG: Record<FollowupTipo, {
  label: string;
  badgeColor: BadgeColor;
  borderColor: string;
}> = {
  orcamento: {
    label: 'Orçamento',
    badgeColor: 'orange',
    borderColor: 'border-primary/40',
  },
  sem_posicao: {
    label: 'Sem posição',
    badgeColor: 'amber',
    borderColor: 'border-warning-500/40',
  },
  retorno: {
    label: 'Retorno',
    badgeColor: 'blue',
    borderColor: 'border-info-500/40',
  },
  cobranca: {
    label: 'Cobrança',
    badgeColor: 'red',
    borderColor: 'border-error-500/40',
  },
  outro: {
    label: 'Outro',
    badgeColor: 'gray',
    borderColor: 'border-border',
  },
};

export const FOLLOWUP_TIPO_OPTIONS = (Object.entries(FOLLOWUP_TIPO_CONFIG) as Array<
  [FollowupTipo, (typeof FOLLOWUP_TIPO_CONFIG)[FollowupTipo]]
>).map(([value, config]) => ({
  value,
  label: config.label,
}));

export type FollowupUrgencia = 'atrasada' | 'hoje' | 'futura' | 'concluida';

export const FOLLOWUP_URGENCIA_ORDER: FollowupUrgencia[] = [
  'atrasada',
  'hoje',
  'futura',
  'concluida',
];

export const FOLLOWUP_URGENCIA_CONFIG: Record<FollowupUrgencia, {
  label: string;
  badgeColor: BadgeColor;
  dotColor: string;
  ringClass: string;
}> = {
  atrasada: {
    label: 'Atrasada',
    badgeColor: 'red',
    dotColor: 'bg-error-500',
    ringClass: '[&_button]:ring-1 [&_button]:ring-error-300',
  },
  hoje: {
    label: 'Hoje',
    badgeColor: 'amber',
    dotColor: 'bg-warning-500',
    ringClass: '[&_button]:ring-1 [&_button]:ring-warning-300',
  },
  futura: {
    label: 'Futura',
    badgeColor: 'blue',
    dotColor: 'bg-info-500',
    ringClass: '[&_button]:ring-1 [&_button]:ring-info-300',
  },
  concluida: {
    label: 'Concluída',
    badgeColor: 'green',
    dotColor: 'bg-success-500',
    ringClass: '[&_button]:ring-1 [&_button]:ring-success-300',
  },
};
