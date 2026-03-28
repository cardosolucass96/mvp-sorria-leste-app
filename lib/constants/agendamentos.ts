import type { AgendamentoStatus } from '../types';

export const AGENDAMENTO_STATUS_CONFIG: Record<AgendamentoStatus, {
  label: string;
  cor: string;
  bgCor: string;
}> = {
  pendente:   { label: 'Sem data',  cor: 'text-neutral-600', bgCor: 'bg-neutral-100' },
  agendado:   { label: 'Agendado',  cor: 'text-blue-700',    bgCor: 'bg-blue-100' },
  realizado:  { label: 'Realizado', cor: 'text-green-700',   bgCor: 'bg-green-100' },
  faltou:     { label: 'Faltou',    cor: 'text-yellow-700',  bgCor: 'bg-yellow-100' },
  cancelado:  { label: 'Cancelado', cor: 'text-red-700',     bgCor: 'bg-red-100' },
};
