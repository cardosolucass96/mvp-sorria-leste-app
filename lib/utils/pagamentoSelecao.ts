export type AcaoItemPagamento = 'hoje' | 'agendar' | 'pendente';

export interface PagamentoEtapaInput {
  id: number;
  nome?: string;
}

export interface PagamentoItemInput {
  id: number;
  status: string;
  etapa_label?: string | null;
  executor_id: number | null;
  etapas?: PagamentoEtapaInput[];
}

export interface ItemAgendarPayload {
  item_id: number;
  data_agendada: string | null;
  executor_id?: number | null;
}

export interface EtapaAgendarPayload {
  etapa_id: number;
  item_id: number;
  tipo: 'modelo';
  data_agendada?: string | null;
  pago_override?: 0 | 1;
  executor_id?: number | null;
}

export interface SelecaoPagamentoPayload {
  itensHoje: number[];
  itensAgendar: ItemAgendarPayload[];
  etapasAgendar: EtapaAgendarPayload[];
}

function parseExecutorId(value?: string): number | null | undefined {
  return value ? parseInt(value) : null;
}

export function montarSelecaoPagamentoPayload(
  itens: PagamentoItemInput[],
  acaoItens: Record<number, AcaoItemPagamento>,
  acaoEtapas: Record<number, AcaoItemPagamento>,
  datasAgendamento: Record<number, string>,
  datasEtapasAgendamento: Record<number, string>,
  executoresAgendamento: Record<number, string>,
  executoresEtapasAgendamento: Record<number, string>
): SelecaoPagamentoPayload {
  const itensHoje: number[] = [];
  const itensAgendar: ItemAgendarPayload[] = [];
  const etapasAgendar: EtapaAgendarPayload[] = [];

  for (const item of itens) {
    const modeloEtapas = item.etapas ?? [];

    if (modeloEtapas.length > 0) {
      const sessoesPagas = item.etapa_label
        ? new Set(item.etapa_label.split(', ').map((s) => s.trim()))
        : (item.status === 'pago' ? null : new Set<string>());

      for (const etapa of modeloEtapas) {
        const acao = acaoEtapas[etapa.id] ?? 'pendente';
        const sessaoPaga = sessoesPagas === null ? true : sessoesPagas.has(etapa.nome ?? '');

        if (acao === 'agendar' || (acao === 'pendente' && sessaoPaga) || (!sessaoPaga && acao !== 'hoje')) {
          const executorId = acao === 'agendar'
            ? parseExecutorId(executoresEtapasAgendamento[etapa.id])
            : undefined;
          etapasAgendar.push({
            etapa_id: etapa.id,
            item_id: item.id,
            tipo: 'modelo',
            data_agendada: acao === 'agendar' ? (datasEtapasAgendamento[etapa.id] || null) : null,
            pago_override: sessaoPaga ? 1 : 0,
            ...(executorId !== undefined ? { executor_id: executorId } : {}),
          });
        }
      }

      const temHoje = modeloEtapas.some((etapa) => (acaoEtapas[etapa.id] ?? 'pendente') === 'hoje');
      if (temHoje) {
        itensHoje.push(item.id);
      }

      continue;
    }

    const acao = acaoItens[item.id] ?? 'pendente';
    if (acao === 'hoje') {
      itensHoje.push(item.id);
      continue;
    }

    if (acao === 'agendar' || (acao === 'pendente' && item.status === 'pago')) {
      const executorId = acao === 'agendar'
        ? parseExecutorId(executoresAgendamento[item.id])
        : undefined;
      itensAgendar.push({
        item_id: item.id,
        data_agendada: acao === 'agendar' ? (datasAgendamento[item.id] || null) : null,
        ...(executorId !== undefined ? { executor_id: executorId } : {}),
      });
    }
  }

  return { itensHoje, itensAgendar, etapasAgendar };
}
