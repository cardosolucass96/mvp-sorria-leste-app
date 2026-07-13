import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { query } from '@/lib/db';
import { buscarEtapasComValor, roundMoney, somarAlocacoesAtivasDaEtapa } from '@/lib/helpers/pagamentoFlow';
import { parseDentesLabels } from '@/lib/utils/formatters';

type SituacaoAgendamento = 'sem_agendamento' | 'agendamento_sem_data' | 'agendado_com_data';

interface BaseItemRow {
  item_id: number;
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  procedimento_id: number;
  procedimento_nome: string;
  tem_etapas: number;
  por_dente: number;
  group_id: string | null;
  dente_unico: string | null;
  dentes: string | null;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  etapas_valores: string | null;
  item_created_at: string;
}

interface ActiveAgendamentoRow {
  agendamento_id: number;
  atendimento_origem_id: number;
  item_atendimento_origem_id: number | null;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  procedimento_id: number | null;
  procedimento_nome: string | null;
  etapa_modelo_id: number | null;
  etapa_modelo_nome: string | null;
  status: string;
  data_agendada: string | null;
  valor: number | null;
  valor_pago: number;
  agendamento_created_at: string;
  item_origem_group_id: string | null;
  item_origem_dente_unico: string | null;
  item_origem_dentes: string | null;
  item_origem_por_dente: number | null;
}

interface ProcedimentoItem {
  key: string;
  item_id: number | null;
  item_ids: number[];
  procedimento_id: number;
  procedimento_nome: string;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  por_dente: boolean;
  group_id: string | null;
  dentes_labels: string[];
  quantidade_dentes: number;
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  situacao_agendamento: SituacaoAgendamento;
  agendamento_id: number | null;
  agendamento_status: string | null;
  data_agendada: string | null;
  agendamentos_ativos: number;
  resumo_agendamento: string | null;
  referencia_em: string;
}

interface OrcamentoGrupo {
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  valor_total_aberto: number;
  procedimentos: ProcedimentoItem[];
}

interface SummaryResponse {
  valor_total_aberto: number;
  orcamentos_abertos: number;
  procedimentos_abertos: number;
  sem_agendamento: number;
  agendamento_sem_data: number;
  agendado_com_data: number;
}

interface DescriptorBase {
  key: string;
  atendimento_id: number;
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

export const GET = withUnitRole(['admin', 'atendente'], async (
  _request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const baseItems = await query<BaseItemRow>(
      `SELECT
         i.id AS item_id,
         a.id AS atendimento_id,
         c.id AS cliente_id,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         a.created_at AS orcamento_em,
         p.id AS procedimento_id,
         p.nome AS procedimento_nome,
         p.tem_etapas AS tem_etapas,
         p.por_dente AS por_dente,
         i.group_id,
         i.dente_unico,
         i.dentes,
         i.valor,
         i.valor_final,
         i.valor_pago,
         i.etapas_valores,
         i.created_at AS item_created_at
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON a.id = i.atendimento_id
       INNER JOIN clientes c ON c.id = a.cliente_id
       INNER JOIN procedimentos p ON p.id = i.procedimento_id
       WHERE a.unidade_id = ?
         AND COALESCE(a.tipo, 'normal') != 'sessao'
         AND i.adicionado_em_execucao = 0
         AND i.valor_pago + 0.001 < COALESCE(i.valor_final, i.valor)
       ORDER BY a.created_at DESC, i.created_at ASC`,
      [context.unidadeId]
    );

    const activeAgendamentos = await query<ActiveAgendamentoRow>(
      `SELECT
         ag.id AS agendamento_id,
         ag.atendimento_origem_id,
         ag.item_atendimento_origem_id,
         c.id AS cliente_id,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         a.created_at AS orcamento_em,
         COALESCE(ag.procedimento_id, item_origem.procedimento_id) AS procedimento_id,
         p.nome AS procedimento_nome,
         ag.etapa_modelo_id,
         em.nome AS etapa_modelo_nome,
         ag.status,
         ag.data_agendada,
         ag.valor,
         ag.valor_pago,
         ag.created_at AS agendamento_created_at,
         item_origem.group_id AS item_origem_group_id,
         item_origem.dente_unico AS item_origem_dente_unico,
         item_origem.dentes AS item_origem_dentes,
         p.por_dente AS item_origem_por_dente
       FROM agendamentos ag
       INNER JOIN atendimentos a ON a.id = ag.atendimento_origem_id
       INNER JOIN clientes c ON c.id = ag.cliente_id
       LEFT JOIN itens_atendimento item_origem ON item_origem.id = ag.item_atendimento_origem_id
       LEFT JOIN procedimentos p ON p.id = COALESCE(ag.procedimento_id, item_origem.procedimento_id)
       LEFT JOIN procedimento_etapas_modelo em ON em.id = ag.etapa_modelo_id
       WHERE ag.unidade_id = ?
         AND ag.status IN ('pendente', 'agendado')
         AND ag.atendimento_origem_id IS NOT NULL
         AND COALESCE(a.tipo, 'normal') != 'sessao'
         AND COALESCE(item_origem.adicionado_em_execucao, 0) = 0
       ORDER BY a.created_at DESC, ag.created_at DESC`,
      [context.unidadeId]
    );

    const descriptors = new Map<string, DescriptorBase>();
    const originToDescriptorKey = new Map<string, string>();

    const registrarDescriptor = (payload: {
      key: string;
      atendimento_id: number;
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

    await Promise.all(baseItems.map(async (item) => {
      const porDente = item.por_dente === 1;
      const groupId = item.group_id?.trim() || null;
      const dentesLabels = coletarDentesLabels(item);

      if (item.tem_etapas) {
        const etapas = await buscarEtapasComValor({
          procedimento_id: item.procedimento_id,
          etapas_valores: item.etapas_valores,
        });

        await Promise.all(etapas.map(async (etapa) => {
          const valorTotal = roundMoney(etapa.valor ?? 0);
          const valorPago = await somarAlocacoesAtivasDaEtapa(item.item_id, etapa.id);
          const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));
          if (saldoAberto <= 0) return;

          const key = buildDescriptorKey(item.item_id, etapa.id, groupId, porDente);
          originToDescriptorKey.set(buildOriginKey(item.item_id, etapa.id), key);
          registrarDescriptor({
            key,
            atendimento_id: item.atendimento_id,
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
        }));

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
    }));

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
      const valorTotal = roundMoney(agendamento.valor ?? 0);
      const valorPago = roundMoney(agendamento.valor_pago ?? 0);
      const saldoAberto = roundMoney(Math.max(0, valorTotal - valorPago));

      if (valorTotal <= 0 || saldoAberto <= 0) {
        continue;
      }

      const state = ensureState(stateKey, {
        atendimento_id: agendamento.atendimento_origem_id,
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

    const ensureGroup = (descriptor: Pick<DescriptorBase, 'atendimento_id' | 'cliente_id' | 'cliente_nome' | 'cliente_telefone' | 'orcamento_em'>) => {
      const current = groups.get(descriptor.atendimento_id);
      if (current) return current;

      const created = {
        atendimento_id: descriptor.atendimento_id,
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

    return NextResponse.json({ summary, items });
  } catch (error) {
    console.error('Erro ao listar orçamentos em aberto:', error);
    return NextResponse.json(
      { error: 'Erro ao listar orçamentos em aberto' },
      { status: 500 }
    );
  }
});
