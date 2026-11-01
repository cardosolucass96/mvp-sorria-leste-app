import { obterValorEfetivoAgendamento, roundMoney } from '@/modules/financeiro/public';
import type { DadosOrcamentos } from './dados';
import { adicionarValoresUnicos, buildDescriptorKey, buildOriginKey, coletarDentesLabels, type DescriptorBase, type DescriptorState } from './descritores';

export function vincularAgendamentos(
  dados: DadosOrcamentos,
  descriptors: Map<string, DescriptorBase>,
  originToDescriptorKey: Map<string, string>,
) {
  const { activeAgendamentos } = dados;
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

  return states;
}
