import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { query } from '@/lib/db';
import { buscarEtapasComValor, roundMoney, somarAlocacoesAtivasDaEtapa } from '@/lib/helpers/pagamentoFlow';

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
}

interface SubprocedimentoItem {
  key: string;
  item_id: number | null;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  situacao_agendamento: SituacaoAgendamento;
  agendamento_id: number | null;
  agendamento_status: string | null;
  data_agendada: string | null;
  referencia_em: string;
}

interface OrcamentoGrupo {
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  valor_total_aberto: number;
  subprocedimentos: SubprocedimentoItem[];
}

interface SummaryResponse {
  valor_total_aberto: number;
  orcamentos_abertos: number;
  subprocedimentos_abertos: number;
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
  item_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  referencia_em: string;
}

function buildLineKey(itemId: number | null, etapaModeloId: number | null, fallbackAgendamentoId?: number) {
  if (itemId != null) {
    return `item:${itemId}:etapa:${etapaModeloId ?? 'item'}`;
  }
  return `agendamento:${fallbackAgendamentoId ?? 'sem-origem'}`;
}

function getSituacaoAgendamento(dataAgendada: string | null): SituacaoAgendamento {
  return dataAgendada ? 'agendado_com_data' : 'agendamento_sem_data';
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

function sortSubprocedimentos(left: SubprocedimentoItem, right: SubprocedimentoItem) {
  const situacao = getSituacaoOrder(left.situacao_agendamento) - getSituacaoOrder(right.situacao_agendamento);
  if (situacao !== 0) return situacao;

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
         ag.procedimento_id,
         p.nome AS procedimento_nome,
         ag.etapa_modelo_id,
         em.nome AS etapa_modelo_nome,
         ag.status,
         ag.data_agendada,
         ag.valor,
         ag.valor_pago,
         ag.created_at AS agendamento_created_at
       FROM agendamentos ag
       INNER JOIN atendimentos a ON a.id = ag.atendimento_origem_id
       INNER JOIN clientes c ON c.id = ag.cliente_id
       LEFT JOIN procedimentos p ON p.id = ag.procedimento_id
       LEFT JOIN procedimento_etapas_modelo em ON em.id = ag.etapa_modelo_id
       LEFT JOIN itens_atendimento item_origem ON item_origem.id = ag.item_atendimento_origem_id
       WHERE ag.unidade_id = ?
         AND ag.status IN ('pendente', 'agendado')
         AND ag.atendimento_origem_id IS NOT NULL
         AND COALESCE(a.tipo, 'normal') != 'sessao'
         AND COALESCE(item_origem.adicionado_em_execucao, 0) = 0
       ORDER BY a.created_at DESC, ag.created_at DESC`,
      [context.unidadeId]
    );

    const descriptors = new Map<string, DescriptorBase>();

    await Promise.all(baseItems.map(async (item) => {
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

          const key = buildLineKey(item.item_id, etapa.id);
          descriptors.set(key, {
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

      const key = buildLineKey(item.item_id, null);
      descriptors.set(key, {
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
        valor_total: valorTotal,
        valor_pago: valorPago,
        saldo_aberto: saldoAberto,
        referencia_em: item.item_created_at,
      });
    }));

    const groups = new Map<number, Omit<OrcamentoGrupo, 'subprocedimentos' | 'valor_total_aberto'> & {
      subprocedimentos: Map<string, SubprocedimentoItem>;
    }>();
    const activeKeys = new Set<string>();

    const ensureGroup = (descriptor: Pick<DescriptorBase, 'atendimento_id' | 'cliente_id' | 'cliente_nome' | 'cliente_telefone' | 'orcamento_em'>) => {
      const current = groups.get(descriptor.atendimento_id);
      if (current) return current;

      const created = {
        atendimento_id: descriptor.atendimento_id,
        cliente_id: descriptor.cliente_id,
        cliente_nome: descriptor.cliente_nome,
        cliente_telefone: descriptor.cliente_telefone,
        orcamento_em: descriptor.orcamento_em,
        subprocedimentos: new Map<string, SubprocedimentoItem>(),
      };
      groups.set(descriptor.atendimento_id, created);
      return created;
    };

    for (const agendamento of activeAgendamentos) {
      const key = buildLineKey(
        agendamento.item_atendimento_origem_id,
        agendamento.etapa_modelo_id,
        agendamento.agendamento_id
      );
      const descriptor = descriptors.get(key);

      let valorTotal = descriptor?.valor_total ?? roundMoney(agendamento.valor ?? 0);
      let valorPago = descriptor?.valor_pago ?? roundMoney(agendamento.valor_pago ?? 0);
      let saldoAberto = descriptor?.saldo_aberto ?? roundMoney(Math.max(0, valorTotal - valorPago));

      if (valorTotal <= 0 || saldoAberto <= 0) {
        continue;
      }

      const procedimentoId = descriptor?.procedimento_id ?? agendamento.procedimento_id;
      const procedimentoNome = descriptor?.procedimento_nome ?? agendamento.procedimento_nome;
      if (procedimentoId == null || !procedimentoNome) {
        continue;
      }

      const group = ensureGroup({
        atendimento_id: descriptor?.atendimento_id ?? agendamento.atendimento_origem_id,
        cliente_id: descriptor?.cliente_id ?? agendamento.cliente_id,
        cliente_nome: descriptor?.cliente_nome ?? agendamento.cliente_nome,
        cliente_telefone: descriptor?.cliente_telefone ?? agendamento.cliente_telefone,
        orcamento_em: descriptor?.orcamento_em ?? agendamento.orcamento_em,
      });

      group.subprocedimentos.set(key, {
        key,
        item_id: descriptor?.item_id ?? agendamento.item_atendimento_origem_id,
        procedimento_id: procedimentoId,
        procedimento_nome: procedimentoNome,
        etapa_modelo_id: descriptor?.etapa_modelo_id ?? agendamento.etapa_modelo_id,
        etapa_label: descriptor?.etapa_label ?? agendamento.etapa_modelo_nome,
        valor_total: valorTotal,
        valor_pago: valorPago,
        saldo_aberto: saldoAberto,
        situacao_agendamento: getSituacaoAgendamento(agendamento.data_agendada),
        agendamento_id: agendamento.agendamento_id,
        agendamento_status: agendamento.status,
        data_agendada: agendamento.data_agendada,
        referencia_em: descriptor?.referencia_em ?? agendamento.agendamento_created_at,
      });
      activeKeys.add(key);
    }

    for (const descriptor of descriptors.values()) {
      if (activeKeys.has(descriptor.key)) {
        continue;
      }

      const group = ensureGroup(descriptor);
      group.subprocedimentos.set(descriptor.key, {
        key: descriptor.key,
        item_id: descriptor.item_id,
        procedimento_id: descriptor.procedimento_id,
        procedimento_nome: descriptor.procedimento_nome,
        etapa_modelo_id: descriptor.etapa_modelo_id,
        etapa_label: descriptor.etapa_label,
        valor_total: descriptor.valor_total,
        valor_pago: descriptor.valor_pago,
        saldo_aberto: descriptor.saldo_aberto,
        situacao_agendamento: 'sem_agendamento',
        agendamento_id: null,
        agendamento_status: null,
        data_agendada: null,
        referencia_em: descriptor.referencia_em,
      });
    }

    const items: OrcamentoGrupo[] = Array.from(groups.values())
      .map((group) => {
        const subprocedimentos = Array.from(group.subprocedimentos.values()).sort(sortSubprocedimentos);
        const valorTotalAberto = roundMoney(
          subprocedimentos.reduce((total, subprocedimento) => total + subprocedimento.saldo_aberto, 0)
        );

        return {
          atendimento_id: group.atendimento_id,
          cliente_id: group.cliente_id,
          cliente_nome: group.cliente_nome,
          cliente_telefone: group.cliente_telefone,
          orcamento_em: group.orcamento_em,
          valor_total_aberto: valorTotalAberto,
          subprocedimentos,
        };
      })
      .filter((group) => group.subprocedimentos.length > 0 && group.valor_total_aberto > 0)
      .sort((left, right) => right.orcamento_em.localeCompare(left.orcamento_em));

    const summary = items.reduce<SummaryResponse>((acc, group) => {
      acc.valor_total_aberto = roundMoney(acc.valor_total_aberto + group.valor_total_aberto);
      acc.orcamentos_abertos += 1;

      for (const subprocedimento of group.subprocedimentos) {
        acc.subprocedimentos_abertos += 1;
        if (subprocedimento.situacao_agendamento === 'sem_agendamento') {
          acc.sem_agendamento += 1;
        } else if (subprocedimento.situacao_agendamento === 'agendamento_sem_data') {
          acc.agendamento_sem_data += 1;
        } else {
          acc.agendado_com_data += 1;
        }
      }

      return acc;
    }, {
      valor_total_aberto: 0,
      orcamentos_abertos: 0,
      subprocedimentos_abertos: 0,
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
