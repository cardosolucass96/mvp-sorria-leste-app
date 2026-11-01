import { roundMoney } from '@/modules/financeiro/public';
import type { OrcamentoGrupo, ProcedimentoItem, SummaryResponse, SituacaoAgendamento, OrcamentosEmAbertoResponse } from '../contracts';
import type { DescriptorBase, DescriptorState } from './descritores';

function getSituacaoOrder(situacao: SituacaoAgendamento) {
  switch (situacao) {
    case 'sem_agendamento':
      return 0;
    case 'agendamento_sem_data':
      return 1;
    case 'agendado_com_data':
      return 2;
    default:
      return 99;
  }
}

function sortProcedimentos(left: ProcedimentoItem, right: ProcedimentoItem) {
  const situacao = getSituacaoOrder(left.situacao_agendamento) - getSituacaoOrder(right.situacao_agendamento);
  if (situacao !== 0) return situacao;

  const byReference = right.referencia_em.localeCompare(left.referencia_em);
  if (byReference !== 0) return byReference;

  if (left.data_agendada && right.data_agendada) {
    const byDate = left.data_agendada.localeCompare(right.data_agendada);
    if (byDate !== 0) return byDate;
  } else if (left.data_agendada) {
    return 1;
  } else if (right.data_agendada) {
    return -1;
  }

  const procedimento = left.procedimento_nome.localeCompare(right.procedimento_nome, 'pt-BR');
  if (procedimento !== 0) return procedimento;

  return (left.etapa_label || '').localeCompare(right.etapa_label || '', 'pt-BR');
}

function resumirAgendamentos(
  porDente: boolean,
  totalItens: number,
  totalAgendados: number,
  temItensSemAgendamento: boolean
) {
  if (totalAgendados <= 0 || totalItens <= 1) {
    return null;
  }

  const unidade = porDente ? 'dente' : 'item';
  const unidadePlural = porDente ? 'dentes' : 'itens';

  if (temItensSemAgendamento) {
    return `${totalAgendados} de ${totalItens} ${totalItens === 1 ? unidade : unidadePlural} com agendamento`;
  }

  return `${totalAgendados} ${totalAgendados === 1 ? unidade : unidadePlural} com agendamento`;
}

export function agruparOrcamentos(states: Map<string, DescriptorState>): OrcamentosEmAbertoResponse {
  const groups = new Map<number, Omit<OrcamentoGrupo, 'procedimentos' | 'valor_total_aberto'> & {
    procedimentos: ProcedimentoItem[];
  }>();

  const ensureGroup = (descriptor: Pick<DescriptorBase, 'atendimento_id' | 'atendimento_status' | 'cliente_id' | 'cliente_nome' | 'cliente_telefone' | 'orcamento_em'>) => {
    const current = groups.get(descriptor.atendimento_id);
    if (current) return current;

    const created = {
      atendimento_id: descriptor.atendimento_id,
      atendimento_status: descriptor.atendimento_status,
      cliente_id: descriptor.cliente_id,
      cliente_nome: descriptor.cliente_nome,
      cliente_telefone: descriptor.cliente_telefone,
      orcamento_em: descriptor.orcamento_em,
      procedimentos: [] as ProcedimentoItem[],
    };
    groups.set(descriptor.atendimento_id, created);
    return created;
  };

  for (const state of states.values()) {
    if (state.saldo_aberto <= 0 || state.valor_total <= 0) {
      continue;
    }

    const group = ensureGroup(state);
    const itemIds = Array.from(new Set(state.item_ids));
    const activeAgendamentosUnicos = Array.from(
      new Map(state.activeAgendamentos.map((agendamento) => [agendamento.agendamento_id, agendamento])).values()
    );
    const itensComAgendamento = new Set(
      activeAgendamentosUnicos
        .map((agendamento) => agendamento.item_atendimento_origem_id)
        .filter((itemId): itemId is number => itemId != null)
    );
    const itensSemAgendamento = itemIds.filter((itemId) => !itensComAgendamento.has(itemId));
    const temItensSemAgendamento = itemIds.length > 0
      ? itensSemAgendamento.length > 0
      : activeAgendamentosUnicos.length === 0;
    const agendamentoUnico = activeAgendamentosUnicos.length === 1
      ? activeAgendamentosUnicos[0]
      : null;
    const situacaoAgendamento: SituacaoAgendamento = temItensSemAgendamento || activeAgendamentosUnicos.length === 0
      ? 'sem_agendamento'
      : activeAgendamentosUnicos.some((agendamento) => !agendamento.data_agendada)
        ? 'agendamento_sem_data'
        : 'agendado_com_data';

    group.procedimentos.push({
      key: state.key,
      item_id: itensSemAgendamento[0] ?? itemIds[0] ?? null,
      item_ids: itemIds,
      procedimento_id: state.procedimento_id,
      procedimento_nome: state.procedimento_nome,
      etapa_modelo_id: state.etapa_modelo_id,
      etapa_label: state.etapa_label,
      por_dente: state.por_dente,
      group_id: state.group_id,
      dentes_labels: [...state.dentes_labels],
      quantidade_dentes: state.por_dente ? Math.max(state.dentes_labels.length, itemIds.length) : 0,
      valor_total: state.valor_total,
      valor_pago: state.valor_pago,
      saldo_aberto: state.saldo_aberto,
      situacao_agendamento: situacaoAgendamento,
      agendamento_id: !temItensSemAgendamento && agendamentoUnico ? agendamentoUnico.agendamento_id : null,
      agendamento_status: agendamentoUnico?.status ?? null,
      data_agendada: agendamentoUnico?.data_agendada ?? null,
      agendamentos_ativos: activeAgendamentosUnicos.length,
      resumo_agendamento: resumirAgendamentos(
        state.por_dente,
        Math.max(itemIds.length, activeAgendamentosUnicos.length),
        activeAgendamentosUnicos.length,
        temItensSemAgendamento
      ),
      referencia_em: state.referencia_em,
    });
  }

  const items: OrcamentoGrupo[] = Array.from(groups.values())
    .map((group) => {
      const procedimentos = [...group.procedimentos].sort(sortProcedimentos);
      const valorTotalAberto = roundMoney(
        procedimentos.reduce((total, procedimento) => total + procedimento.saldo_aberto, 0)
      );

      return {
        atendimento_id: group.atendimento_id,
        atendimento_status: group.atendimento_status,
        cliente_id: group.cliente_id,
        cliente_nome: group.cliente_nome,
        cliente_telefone: group.cliente_telefone,
        orcamento_em: group.orcamento_em,
        valor_total_aberto: valorTotalAberto,
        procedimentos,
      };
    })
    .filter((group) => group.procedimentos.length > 0 && group.valor_total_aberto > 0)
    .sort((left, right) => right.orcamento_em.localeCompare(left.orcamento_em));

  const summary = items.reduce<SummaryResponse>((acc, group) => {
    acc.valor_total_aberto = roundMoney(acc.valor_total_aberto + group.valor_total_aberto);
    acc.orcamentos_abertos += 1;

    for (const procedimento of group.procedimentos) {
      acc.procedimentos_abertos += 1;
      if (procedimento.situacao_agendamento === 'sem_agendamento') {
        acc.sem_agendamento += 1;
      } else if (procedimento.situacao_agendamento === 'agendamento_sem_data') {
        acc.agendamento_sem_data += 1;
      } else {
        acc.agendado_com_data += 1;
      }
    }

    return acc;
  }, {
    valor_total_aberto: 0,
    orcamentos_abertos: 0,
    procedimentos_abertos: 0,
    sem_agendamento: 0,
    agendamento_sem_data: 0,
    agendado_com_data: 0,
  });

  return { summary, items };
}
