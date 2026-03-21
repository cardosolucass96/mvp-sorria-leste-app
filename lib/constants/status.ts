/**
 * Constantes de status — fonte única de verdade para labels, cores e transições.
 * Substitui os 5+ mapas inconsistentes espalhados pelas páginas.
 */

import type { AtendimentoStatus, ItemStatus } from '@/lib/types';

// ─── Status de Atendimento ──────────────────────────────────────

export interface StatusConfig {
  label: string;
  cor: string;       // Tailwind text color
  bgCor: string;     // Tailwind bg color
  icon: string;      // Emoji
}

export const STATUS_CONFIG: Record<AtendimentoStatus, StatusConfig> = {
  triagem: {
    label: 'Triagem',
    cor: 'text-neutral-700',
    bgCor: 'bg-neutral-100',
    icon: '📝',
  },
  avaliacao: {
    label: 'Avaliação',
    cor: 'text-info-700',
    bgCor: 'bg-info-100',
    icon: '🔍',
  },
  aguardando_pagamento: {
    label: 'Aguardando Pagamento',
    cor: 'text-warning-700',
    bgCor: 'bg-warning-100',
    icon: '💰',
  },
  em_execucao: {
    label: 'Em Execução',
    cor: 'text-purple-700',
    bgCor: 'bg-purple-100',
    icon: '🦷',
  },
  finalizado: {
    label: 'Finalizado',
    cor: 'text-success-700',
    bgCor: 'bg-success-100',
    icon: '✅',
  },
};

/** Cores sólidas para gráficos / barras do dashboard */
export const STATUS_CHART_COLORS: Record<AtendimentoStatus, string> = {
  triagem: 'bg-neutral-500',
  avaliacao: 'bg-info-500',
  aguardando_pagamento: 'bg-warning-500',
  em_execucao: 'bg-purple-500',
  finalizado: 'bg-success-500',
};

/** Ordem do pipeline de atendimento */
export const STATUS_ORDER: AtendimentoStatus[] = [
  'triagem',
  'avaliacao',
  'aguardando_pagamento',
  'em_execucao',
  'finalizado',
];

/** Mapa de próximo status (transição) */
export const PROXIMOS_STATUS: Record<AtendimentoStatus, AtendimentoStatus | null> = {
  triagem: 'avaliacao',
  avaliacao: 'aguardando_pagamento',
  aguardando_pagamento: 'em_execucao',
  em_execucao: 'finalizado',
  finalizado: null,
};

// ─── Status de Item ─────────────────────────────────────────────

export interface ItemStatusConfig {
  label: string;
  cor: string;
  bgCor: string;
  icon: string;
}

export const ITEM_STATUS_CONFIG: Record<ItemStatus, ItemStatusConfig> = {
  pendente: {
    label: 'Pendente',
    cor: 'text-neutral-600',
    bgCor: 'bg-neutral-100',
    icon: '⏳',
  },
  pago: {
    label: 'Pago',
    cor: 'text-info-700',
    bgCor: 'bg-info-100',
    icon: '💰',
  },
  executando: {
    label: 'Em Execução',
    cor: 'text-primary-700',
    bgCor: 'bg-primary-100',
    icon: '🦷',
  },
  concluido: {
    label: 'Concluído',
    cor: 'text-success-700',
    bgCor: 'bg-success-100',
    icon: '✅',
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
    cor: 'text-yellow-700',
    bgCor: 'bg-yellow-100',
  },
  paga: {
    label: 'Paga',
    cor: 'text-success-700',
    bgCor: 'bg-success-100',
  },
  vencida: {
    label: 'Vencida',
    cor: 'text-error-700',
    bgCor: 'bg-error-100',
  },
};

// ─── Métodos de pagamento ───────────────────────────────────────

import type { MetodoPagamento } from '@/lib/types';

export const METODO_PAGAMENTO_LABELS: Record<MetodoPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
};

// ─── Helpers ────────────────────────────────────────────────────

/** Retorna label + cores para qualquer status de atendimento. Seguro para status desconhecido. */
export function getAtendimentoStatus(status: string): StatusConfig {
  return (
    STATUS_CONFIG[status as AtendimentoStatus] ?? {
      label: status,
      cor: 'text-neutral-600',
      bgCor: 'bg-neutral-100',
      icon: '❓',
    }
  );
}

/** Retorna label + cores para qualquer status de item. Seguro para status desconhecido. */
export function getItemStatus(status: string): ItemStatusConfig {
  return (
    ITEM_STATUS_CONFIG[status as ItemStatus] ?? {
      label: status,
      cor: 'text-neutral-600',
      bgCor: 'bg-neutral-100',
      icon: '❓',
    }
  );
}
