import { obterValorEfetivoAgendamento, roundMoney } from '@/modules/financeiro/public';
import { parseDentesLabels } from '@/lib/utils/formatters';
import type { OrcamentoGrupo, ProcedimentoItem, SummaryResponse, SituacaoAgendamento, OrcamentosEmAbertoResponse } from '../contracts';
import type { ActiveAgendamentoRow, DadosOrcamentos } from './dados';

interface DescriptorBase {
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

interface DescriptorState extends DescriptorBase {
  activeAgendamentos: ActiveAgendamentoRow[];
}

function buildOriginKey(itemId: number | null, etapaModeloId: number | null, fallbackAgendamentoId?: number) {
  if (itemId != null) {
    return `item:${itemId}:etapa:${etapaModeloId ?? 'item'}`;
  }
  return `agendamento:${fallbackAgendamentoId ?? 'sem-origem'}`;
}

function buildDescriptorKey(
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

function coletarDentesLabels(item: {
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

function adicionarValoresUnicos(target: string[], values: string[]) {
  const existentes = new Set(target);
  for (const value of values) {
    if (!existentes.has(value)) {
      target.push(value);
      existentes.add(value);
    }
  }
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

export function montarOrcamentos(dados: DadosOrcamentos): OrcamentosEmAbertoResponse {
  const { baseItems, activeAgendamentos, etapasPorItem } = dados;
    const descriptors = new Map<string, DescriptorBase>();
    const originToDescriptorKey = new Map<string, string>();

    const registrarDescriptor = (payload: {
      key: string;
      atendimento_id: number;
      atendimento_status: string;
      cliente_id: number;
      cliente_nome: string;
      cliente_telefone: string | null;
      orcamento_em: string;
      item_id: number;
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
    }) => {
      const current = descriptors.get(payload.key);
      if (current) {
        if (!current.item_ids.includes(payload.item_id)) {
          current.item_ids.push(payload.item_id);
        }
        adicionarValoresUnicos(current.dentes_labels, payload.dentes_labels);
        current.valor_total = roundMoney(current.valor_total + payload.valor_total);
        current.valor_pago = roundMoney(current.valor_pago + payload.valor_pago);
        current.saldo_aberto = roundMoney(current.saldo_aberto + payload.saldo_aberto);
        if (payload.referencia_em > current.referencia_em) {
          current.referencia_em = payload.referencia_em;
        }
        return;
      }

      descriptors.set(payload.key, {
        key: payload.key,
        atendimento_id: payload.atendimento_id,
        atendimento_status: payload.atendimento_status,
        cliente_id: payload.cliente_id,
        cliente_nome: payload.cliente_nome,
        cliente_telefone: payload.cliente_telefone,
        orcamento_em: payload.orcamento_em,
        item_ids: [payload.item_id],
        procedimento_id: payload.procedimento_id,
        procedimento_nome: payload.procedimento_nome,
        etapa_modelo_id: payload.etapa_modelo_id,
        etapa_label: payload.etapa_label,
        por_dente: payload.por_dente,
        group_id: payload.group_id,
        dentes_labels: [...payload.dentes_labels],
        valor_total: payload.valor_total,
        valor_pago: payload.valor_pago,
        saldo_aberto: payload.saldo_aberto,
        referencia_em: payload.referencia_em,
      });
    };

    baseItems.forEach((item) => {
      const porDente = item.por_dente === 1;
      const groupId = item.group_id?.trim() || null;
      const dentesLabels = coletarDentesLabels(item);

      if (item.tem_etapas) {
        const etapas = etapasPorItem[item.item_id] ?? [];

        etapas.forEach((etapa) => {
          const valorTotal = roundMoney(etapa.valor ?? 0);
          const valorPago = etapa.valor_pago;
          const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));
          if (saldoAberto <= 0) return;

          const key = buildDescriptorKey(item.item_id, etapa.id, groupId, porDente);
          originToDescriptorKey.set(buildOriginKey(item.item_id, etapa.id), key);
          registrarDescriptor({
            key,
            atendimento_id: item.atendimento_id,
            atendimento_status: item.atendimento_status,
            cliente_id: item.cliente_id,
            cliente_nome: item.cliente_nome,
            cliente_telefone: item.cliente_telefone,
            orcamento_em: item.orcamento_em,
            item_id: item.item_id,
            procedimento_id: item.procedimento_id,
            procedimento_nome: item.procedimento_nome,
            etapa_modelo_id: etapa.id,
            etapa_label: etapa.nome,
            por_dente: porDente,
            group_id: groupId,
            dentes_labels: dentesLabels,
            valor_total: valorTotal,
            valor_pago: valorPago,
            saldo_aberto: saldoAberto,
            referencia_em: item.item_created_at,
          });
        });

        return;
      }

      const valorTotal = roundMoney(item.valor_final ?? item.valor);
      const valorPago = roundMoney(item.valor_pago);
      const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));
      if (saldoAberto <= 0) return;

      const key = buildDescriptorKey(item.item_id, null, groupId, porDente);
      originToDescriptorKey.set(buildOriginKey(item.item_id, null), key);
      registrarDescriptor({
        key,
        atendimento_id: item.atendimento_id,
        atendimento_status: item.atendimento_status,
        cliente_id: item.cliente_id,
        cliente_nome: item.cliente_nome,
        cliente_telefone: item.cliente_telefone,
        orcamento_em: item.orcamento_em,
        item_id: item.item_id,
        procedimento_id: item.procedimento_id,
        procedimento_nome: item.procedimento_nome,
        etapa_modelo_id: null,
        etapa_label: null,
        por_dente: porDente,
        group_id: groupId,
        dentes_labels: dentesLabels,
        valor_total: valorTotal,
        valor_pago: valorPago,
        saldo_aberto: saldoAberto,
        referencia_em: item.item_created_at,
      });
    });

    const states = new Map<string, DescriptorState>();
    for (const descriptor of descriptors.values()) {
      states.set(descriptor.key, {
        ...descriptor,
        item_ids: [...descriptor.item_ids],
        dentes_labels: [...descriptor.dentes_labels],
        activeAgendamentos: [],
      });
    }

    const ensureState = (key: string, fallback: {
      atendimento_id: number;
      atendimento_status: string;
      cliente_id: number;
      cliente_nome: string;
      cliente_telefone: string | null;
      orcamento_em: string;
      item_id: number | null;
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
    }) => {
      const current = states.get(key);
      if (current) {
        if (fallback.item_id != null && !current.item_ids.includes(fallback.item_id)) {
          current.item_ids.push(fallback.item_id);
        }
        adicionarValoresUnicos(current.dentes_labels, fallback.dentes_labels);
        current.valor_total = roundMoney(current.valor_total + fallback.valor_total);
        current.valor_pago = roundMoney(current.valor_pago + fallback.valor_pago);
        current.saldo_aberto = roundMoney(current.saldo_aberto + fallback.saldo_aberto);
        if (fallback.referencia_em > current.referencia_em) {
          current.referencia_em = fallback.referencia_em;
        }
        return current;
      }

      const created: DescriptorState = {
        key,
        atendimento_id: fallback.atendimento_id,
        atendimento_status: fallback.atendimento_status,
        cliente_id: fallback.cliente_id,
        cliente_nome: fallback.cliente_nome,
        cliente_telefone: fallback.cliente_telefone,
        orcamento_em: fallback.orcamento_em,
        item_ids: fallback.item_id != null ? [fallback.item_id] : [],
        procedimento_id: fallback.procedimento_id,
        procedimento_nome: fallback.procedimento_nome,
        etapa_modelo_id: fallback.etapa_modelo_id,
        etapa_label: fallback.etapa_label,
        por_dente: fallback.por_dente,
        group_id: fallback.group_id,
        dentes_labels: [...fallback.dentes_labels],
        valor_total: fallback.valor_total,
        valor_pago: fallback.valor_pago,
        saldo_aberto: fallback.saldo_aberto,
        referencia_em: fallback.referencia_em,
        activeAgendamentos: [],
      };
      states.set(key, created);
      return created;
    };

    for (const agendamento of activeAgendamentos) {
      const descriptorKey = originToDescriptorKey.get(
        buildOriginKey(
          agendamento.item_atendimento_origem_id,
          agendamento.etapa_modelo_id,
          agendamento.agendamento_id
        )
      );

      if (descriptorKey) {
        const current = states.get(descriptorKey);
        if (current) {
          current.activeAgendamentos.push(agendamento);
          continue;
        }
      }

      if (agendamento.procedimento_id == null || !agendamento.procedimento_nome) {
        continue;
      }

      const porDente = (agendamento.item_origem_por_dente ?? 0) === 1;
      const stateKey = agendamento.item_atendimento_origem_id != null
        ? buildDescriptorKey(
            agendamento.item_atendimento_origem_id,
            agendamento.etapa_modelo_id,
            agendamento.item_origem_group_id,
            porDente
          )
        : buildOriginKey(null, null, agendamento.agendamento_id);
      const etapasModelo = agendamento.etapa_modelo_id != null
        ? (dados.etapasModelo[agendamento.procedimento_id] ?? [])
        : [];
      const valorTotal = obterValorEfetivoAgendamento({
        valor: agendamento.valor,
        valor_pago: agendamento.valor_pago,
        procedimento_valor: agendamento.procedimento_valor,
        etapa_modelo_id: agendamento.etapa_modelo_id,
        etapas_modelo: etapasModelo,
      });
      const valorPago = roundMoney(agendamento.valor_pago ?? 0);
      const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));

      if (valorTotal <= 0 || saldoAberto <= 0) {
        continue;
      }

      const state = ensureState(stateKey, {
        atendimento_id: agendamento.atendimento_origem_id,
        atendimento_status: agendamento.atendimento_status,
        cliente_id: agendamento.cliente_id,
        cliente_nome: agendamento.cliente_nome,
        cliente_telefone: agendamento.cliente_telefone,
        orcamento_em: agendamento.orcamento_em,
        item_id: agendamento.item_atendimento_origem_id,
        procedimento_id: agendamento.procedimento_id,
        procedimento_nome: agendamento.procedimento_nome,
        etapa_modelo_id: agendamento.etapa_modelo_id,
        etapa_label: agendamento.etapa_modelo_nome,
        por_dente: porDente,
        group_id: agendamento.item_origem_group_id,
        dentes_labels: coletarDentesLabels({
          dentes: agendamento.item_origem_dentes,
          dente_unico: agendamento.item_origem_dente_unico,
        }),
        valor_total: valorTotal,
        valor_pago: valorPago,
        saldo_aberto: saldoAberto,
        referencia_em: agendamento.agendamento_created_at,
      });
      state.activeAgendamentos.push(agendamento);
    }

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
