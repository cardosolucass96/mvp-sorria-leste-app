/**
 * Constantes de status — fonte única de verdade para labels, cores e transições.
 * Substitui os 5+ mapas inconsistentes espalhados pelas páginas.
 */

import type { AtendimentoStatus, ItemStatus } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { ClipboardList, Search, Clock, Activity, CheckCircle, HelpCircle, DollarSign, Archive } from 'lucide-react';

// ─── Status de Atendimento ──────────────────────────────────────

export interface StatusConfig {
  label: string;
  cor: string;       // Tailwind text color
  bgCor: string;     // Tailwind bg color
  icon: LucideIcon;
}

export const STATUS_CONFIG: Record<AtendimentoStatus, StatusConfig> = {
  triagem: {
    label: 'Triagem',
    cor: 'text-secondary-foreground',
    bgCor: 'bg-secondary',
    icon: ClipboardList,
  },
  avaliacao: {
    label: 'Avaliação',
    cor: 'text-info-800 dark:text-info-200',
    bgCor: 'bg-info-500/10',
    icon: Search,
  },
  aguardando_pagamento: {
    label: 'Aguardando Pagamento',
    cor: 'text-warning-800 dark:text-warning-200',
    bgCor: 'bg-warning-500/10',
    icon: Clock,
  },
  em_execucao: {
    label: 'Em Execução',
    cor: 'text-evaluation-800 dark:text-evaluation-200',
    bgCor: 'bg-evaluation-500/10',
    icon: Activity,
  },
  finalizado: {
    label: 'Finalizado',
    cor: 'text-success-800 dark:text-success-200',
    bgCor: 'bg-success-500/10',
    icon: CheckCircle,
  },
  encerrado: {
    label: 'Encerrado',
    cor: 'text-muted-foreground',
    bgCor: 'bg-muted',
    icon: Archive,
  },
};

/** Cores sólidas para gráficos / barras do dashboard */
export const STATUS_CHART_COLORS: Record<AtendimentoStatus, string> = {
  triagem: 'bg-neutral-500',
  avaliacao: 'bg-info-500',
  aguardando_pagamento: 'bg-warning-500',
  em_execucao: 'bg-evaluation-500',
  finalizado: 'bg-success-500',
  encerrado: 'bg-neutral-400',
};

/** Ordem do pipeline de atendimento */
export const STATUS_ORDER: AtendimentoStatus[] = [
  'triagem',
  'avaliacao',
  'aguardando_pagamento',
  'em_execucao',
  'finalizado',
  'encerrado',
];

/** Mapa de próximo status (transição) */
export const PROXIMOS_STATUS: Record<AtendimentoStatus, AtendimentoStatus | null> = {
  triagem: 'avaliacao',
  avaliacao: 'aguardando_pagamento',
  aguardando_pagamento: 'em_execucao',
  em_execucao: 'finalizado',
  finalizado: 'encerrado',
  encerrado: null,
};

/** Mapa de retorno de status (1 etapa por vez nos fluxos ativos) */
export const STATUS_ANTERIOR: Record<AtendimentoStatus, AtendimentoStatus | null> = {
  triagem: null,
  avaliacao: 'triagem',
  aguardando_pagamento: 'avaliacao',
  em_execucao: 'aguardando_pagamento',
  finalizado: null,
  encerrado: null,
};

// ─── Status de Item ─────────────────────────────────────────────

export interface ItemStatusConfig {
  label: string;
  cor: string;
  bgCor: string;
  icon: LucideIcon;
}

export const ITEM_STATUS_CONFIG: Record<ItemStatus, ItemStatusConfig> = {
  pendente: {
    label: 'Pendente',
    cor: 'text-secondary-foreground',
    bgCor: 'bg-secondary',
    icon: Clock,
  },
  pago: {
    label: 'Pago',
    cor: 'text-info-800 dark:text-info-200',
    bgCor: 'bg-info-500/10',
    icon: DollarSign,
  },
  executando: {
    label: 'Em Execução',
    cor: 'text-primary',
    bgCor: 'bg-primary/10',
    icon: Activity,
  },
  concluido: {
    label: 'Concluído',
    cor: 'text-success-800 dark:text-success-200',
    bgCor: 'bg-success-500/10',
    icon: CheckCircle,
  },
};

// ─── Status de Parcela ──────────────────────────────────────────

export type ParcelaStatus = 'pendente' | 'paga' | 'vencida';

export interface ParcelaStatusConfig {
  label: string;
  cor: string;
  bgCor: string;
}

export const PARCELA_STATUS_CONFIG: Record<ParcelaStatus, ParcelaStatusConfig> = {
  pendente: {
    label: 'Pendente',
    cor: 'text-warning-800 dark:text-warning-200',
    bgCor: 'bg-warning-500/10',
  },
  paga: {
    label: 'Paga',
    cor: 'text-success-800 dark:text-success-200',
    bgCor: 'bg-success-500/10',
  },
  vencida: {
    label: 'Vencida',
    cor: 'text-error-800 dark:text-error-200',
    bgCor: 'bg-error-500/10',
  },
};

// ─── Métodos de pagamento ───────────────────────────────────────

import type { MetodoPagamento } from '@/lib/types';

export const METODO_PAGAMENTO_LABELS: Record<MetodoPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

// ─── Helpers ────────────────────────────────────────────────────

/** Retorna label + cores para qualquer status de atendimento. Seguro para status desconhecido. */
export function getAtendimentoStatus(status: string): StatusConfig {
  return (
    STATUS_CONFIG[status as AtendimentoStatus] ?? {
      label: status,
      cor: 'text-muted-foreground',
      bgCor: 'bg-muted',
      icon: HelpCircle,
    }
  );
}

/** Retorna label + cores para qualquer status de item. Seguro para status desconhecido. */
export function getItemStatus(status: string): ItemStatusConfig {
  return (
    ITEM_STATUS_CONFIG[status as ItemStatus] ?? {
      label: status,
      cor: 'text-muted-foreground',
      bgCor: 'bg-muted',
      icon: HelpCircle,
    }
  );
}
