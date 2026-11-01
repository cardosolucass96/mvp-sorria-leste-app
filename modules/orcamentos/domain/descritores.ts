import { parseDentesLabels } from '@/lib/utils/formatters';
import type { ActiveAgendamentoRow } from './dados';

export interface DescriptorBase {
  key: string;
  atendimento_id: number;
  atendimento_status: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  item_ids: number[];
  procedimento_id: number;
  procedimento_nome: string;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  por_dente: boolean;
  group_id: string | null;
  dentes_labels: string[];
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  referencia_em: string;
}

export interface DescriptorState extends DescriptorBase {
  activeAgendamentos: ActiveAgendamentoRow[];
}

export function buildOriginKey(itemId: number | null, etapaModeloId: number | null, fallbackAgendamentoId?: number) {
  if (itemId != null) {
    return `item:${itemId}:etapa:${etapaModeloId ?? 'item'}`;
  }
  return `agendamento:${fallbackAgendamentoId ?? 'sem-origem'}`;
}

export function buildDescriptorKey(
  itemId: number,
  etapaModeloId: number | null,
  groupId: string | null,
  porDente: boolean
) {
  if (porDente && groupId) {
    return `grupo:${groupId}:etapa:${etapaModeloId ?? 'item'}`;
  }

  return buildOriginKey(itemId, etapaModeloId);
}

export function coletarDentesLabels(item: {
  dentes?: string | null;
  dente_unico?: string | null;
}): string[] {
  const dentes = parseDentesLabels(item.dentes);
  if (dentes.length > 0) {
    return dentes;
  }

  const denteUnico = item.dente_unico?.trim();
  return denteUnico ? [denteUnico] : [];
}

export function adicionarValoresUnicos(target: string[], values: string[]) {
  const existentes = new Set(target);
  for (const value of values) {
    if (!existentes.has(value)) {
      target.push(value);
      existentes.add(value);
    }
  }
}

