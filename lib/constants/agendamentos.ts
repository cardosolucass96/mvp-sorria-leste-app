import type { AgendamentoStatus } from '../types';

export const AGENDAMENTO_STATUS_CONFIG: Record<AgendamentoStatus, {
  label: string;
  cor: string;
  bgCor: string;
}> = {
  pendente:   { label: 'Sem data',  cor: 'text-secondary-foreground', bgCor: 'bg-secondary' },
  agendado:   { label: 'Agendado',  cor: 'text-primary', bgCor: 'bg-primary/10' },
  realizado:  { label: 'Realizado', cor: 'text-success-800 dark:text-success-200', bgCor: 'bg-success-500/10' },
  faltou:     { label: 'Faltou',    cor: 'text-warning-800 dark:text-warning-200', bgCor: 'bg-warning-500/10' },
  cancelado:  { label: 'Cancelado', cor: 'text-error-800 dark:text-error-200', bgCor: 'bg-error-500/10' },
};
