import { addDaysToClinicDateKey, getClinicDateKey } from '@/lib/time';
import { obterFechamentoCaixaResponse } from '@/lib/helpers/fechamentoCaixa';
import type { FechamentoCaixaResponse, FechamentoCaixaVisao } from '@/lib/fechamento-caixa/types';
import type {
  FinanceiroDiaResumo,
  FinanceiroMetodoResumo,
  FinanceiroReceitaPeriodo,
  FinanceiroResponse,
} from './types';

export const FINANCEIRO_PERIODO_MAXIMO_DIAS = 31;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const METODO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

export interface ObterFinanceiroParams {
  unidadeId: number;
  data?: string | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  hoje?: string;
}

function roundMoney(value: number): number {
  return Number((value || 0).toFixed(2));
}

function assertDateKey(value: string, campo: string): string {
  if (!DATE_ONLY_REGEX.test(value)) {
    throw new Error(`Data inválida em ${campo}. Use o formato YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  const isSameDate =
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;

  if (!isSameDate) {
    throw new Error(`Data inválida em ${campo}. Use uma data existente.`);
  }

  return value;
}

function normalizeOptionalDate(value: string | null | undefined, campo: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return assertDateKey(normalized, campo);
}

function dateKeyToDayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 12) / 86_400_000);
}

function enumerateDateKeys(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    current = addDaysToClinicDateKey(current, 1);
  }

  return dates;
}

function getMetodoLabel(metodo: string): string {
  return METODO_LABELS[metodo] ?? metodo;
}

function createDiaResumo(response: FechamentoCaixaResponse): FinanceiroDiaResumo {
  const { fechamento, resultado } = response;
  const resumo = resultado.resumo;
  const totalComissaoAvaliacao = roundMoney(resumo.total_comissao_avaliacao);
  const totalComissaoExecucao = roundMoney(resumo.total_comissao_execucao);

  return {
    data_referencia: resultado.data_referencia,
    unidade_id: resultado.unidade_id,
    unidade_nome: resultado.unidade_nome,
    status: fechamento.status,
    editado_manual: Boolean(fechamento.editado_manual || resultado.editado_manual),
    ajustes_count: fechamento.ajustes_count || resultado.ajustes_count || 0,
    fechado_por_nome: fechamento.fechado_por_nome,
    fechado_em: fechamento.fechado_em,
    total_bruto: roundMoney(resumo.total_bruto),
    total_liquido: roundMoney(resumo.total_liquido),
    total_final: roundMoney(resumo.total_final),
    total_diarias: roundMoney(resumo.total_diarias),
    total_comissoes: roundMoney(totalComissaoAvaliacao + totalComissaoExecucao),
    total_comissao_avaliacao: totalComissaoAvaliacao,
    total_comissao_execucao: totalComissaoExecucao,
    ajustes_manuais: roundMoney(resumo.ajustes_manuais),
    procedimentos_executados: resumo.procedimentos_executados,
    pagamentos: resultado.pagamentos_recebidos_dia.filter((pagamento) => !pagamento.cancelado).length,
    pagamentos_cancelados: resumo.pagamentos_cancelados_dia.quantidade,
    valor_cancelado: roundMoney(resumo.pagamentos_cancelados_dia.valor),
  };
}

function createPeriodoResumo(dias: FinanceiroDiaResumo[]): FinanceiroResponse['resumo_periodo'] {
  const first = dias[0];

  return dias.reduce<FinanceiroResponse['resumo_periodo']>(
    (total, dia) => ({
      unidade_id: dia.unidade_id,
      unidade_nome: dia.unidade_nome,
      editado_manual: total.editado_manual || dia.editado_manual,
      ajustes_count: total.ajustes_count + dia.ajustes_count,
      total_bruto: roundMoney(total.total_bruto + dia.total_bruto),
      total_liquido: roundMoney(total.total_liquido + dia.total_liquido),
      total_final: roundMoney(total.total_final + dia.total_final),
      total_diarias: roundMoney(total.total_diarias + dia.total_diarias),
      total_comissoes: roundMoney(total.total_comissoes + dia.total_comissoes),
      total_comissao_avaliacao: roundMoney(total.total_comissao_avaliacao + dia.total_comissao_avaliacao),
      total_comissao_execucao: roundMoney(total.total_comissao_execucao + dia.total_comissao_execucao),
      ajustes_manuais: roundMoney(total.ajustes_manuais + dia.ajustes_manuais),
      procedimentos_executados: total.procedimentos_executados + dia.procedimentos_executados,
      pagamentos: total.pagamentos + dia.pagamentos,
      pagamentos_cancelados: total.pagamentos_cancelados + dia.pagamentos_cancelados,
      valor_cancelado: roundMoney(total.valor_cancelado + dia.valor_cancelado),
    }),
    {
      unidade_id: first?.unidade_id ?? 0,
      unidade_nome: first?.unidade_nome ?? null,
      editado_manual: false,
      ajustes_count: 0,
      total_bruto: 0,
      total_liquido: 0,
      total_final: 0,
      total_diarias: 0,
      total_comissoes: 0,
      total_comissao_avaliacao: 0,
      total_comissao_execucao: 0,
      ajustes_manuais: 0,
      procedimentos_executados: 0,
      pagamentos: 0,
      pagamentos_cancelados: 0,
      valor_cancelado: 0,
    }
  );
}

function aggregateMetodos(periodoViews: FechamentoCaixaVisao[]): FinanceiroMetodoResumo[] {
  const metodos = new Map<string, FinanceiroMetodoResumo>();

  periodoViews.forEach((view) => {
    view.resumo.faturamento_por_metodo.forEach((item) => {
      const current = metodos.get(item.metodo) ?? {
        metodo: item.metodo,
        label: getMetodoLabel(item.metodo),
        total: 0,
        quantidade: 0,
      };
      current.total = roundMoney(current.total + Number(item.total || 0));
      current.quantidade += Number(item.quantidade || 0);
      metodos.set(item.metodo, current);
    });
  });

  return Array.from(metodos.values()).sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    if (right.quantidade !== left.quantidade) return right.quantidade - left.quantidade;
    return left.label.localeCompare(right.label, 'pt-BR');
  });
}

function createReceitasPeriodo(periodoResponses: FechamentoCaixaResponse[]): FinanceiroReceitaPeriodo[] {
  return periodoResponses
    .flatMap((response) => response.resultado.pagamentos_recebidos_dia.map((pagamento) => ({
      ...pagamento,
      data_referencia: response.resultado.data_referencia,
    })))
    .sort((left, right) => {
      const createdAtComparison = right.created_at.localeCompare(left.created_at);
      if (createdAtComparison !== 0) return createdAtComparison;
      return right.id.localeCompare(left.id);
    });
}

export function normalizarParametrosFinanceiro(params: ObterFinanceiroParams): {
  data: string;
  dataInicio: string;
  dataFim: string;
  diasPeriodo: number;
  datasPeriodo: string[];
} {
  const hoje = assertDateKey(params.hoje ?? getClinicDateKey(), 'hoje');
  const dataFim = normalizeOptionalDate(params.dataFim, 'data_fim') ?? hoje;
  const dataInicio = normalizeOptionalDate(params.dataInicio, 'data_inicio') ?? addDaysToClinicDateKey(dataFim, -6);
  const data = normalizeOptionalDate(params.data, 'data') ?? dataFim;
  const diasPeriodo = dateKeyToDayNumber(dataFim) - dateKeyToDayNumber(dataInicio) + 1;

  if (diasPeriodo <= 0) {
    throw new Error('Data início não pode ser maior que data fim.');
  }

  if (diasPeriodo > FINANCEIRO_PERIODO_MAXIMO_DIAS) {
    throw new Error(`Período máximo permitido é de ${FINANCEIRO_PERIODO_MAXIMO_DIAS} dias.`);
  }

  return {
    data,
    dataInicio,
    dataFim,
    diasPeriodo,
    datasPeriodo: enumerateDateKeys(dataInicio, dataFim),
  };
}

export async function obterFinanceiroResponse(params: ObterFinanceiroParams): Promise<FinanceiroResponse> {
  const normalized = normalizarParametrosFinanceiro(params);
  const diaResponse = await obterFechamentoCaixaResponse(params.unidadeId, normalized.data);
  const periodoDates = normalized.datasPeriodo.filter((date) => date !== normalized.data);
  const periodoResponsesCarregadas = await Promise.all(periodoDates.map(async (date) => ({
    date,
    response: await obterFechamentoCaixaResponse(params.unidadeId, date, { incluirRecentes: false }),
  })));
  const responsesByDate = new Map(periodoResponsesCarregadas.map(({ date, response }) => [date, response]));
  responsesByDate.set(normalized.data, diaResponse);

  const periodoResponses = normalized.datasPeriodo
    .map((date) => responsesByDate.get(date))
    .filter((response): response is FechamentoCaixaResponse => Boolean(response));
  const dias = periodoResponses.map(createDiaResumo);
  const receitasPeriodo = createReceitasPeriodo(periodoResponses);
  const resumoPeriodo = createPeriodoResumo(dias);
  const diaResumo = createDiaResumo(diaResponse);

  return {
    dia: {
      meta: diaResponse.fechamento,
      resultado: diaResponse.resultado,
      recentes: diaResponse.recentes,
    },
    periodo: {
      data_inicio: normalized.dataInicio,
      data_fim: normalized.dataFim,
      dias: normalized.diasPeriodo,
    },
    dias,
    receitas_periodo: receitasPeriodo,
    resumo_periodo: resumoPeriodo,
    graficos: {
      faturamento_por_dia: dias.map((dia) => ({
        data_referencia: dia.data_referencia,
        total_bruto: dia.total_bruto,
        total_liquido: dia.total_liquido,
        total_final: dia.total_final,
      })),
      metodos_pagamento: aggregateMetodos(periodoResponses.map((response) => response.resultado)),
      composicao_resultado_dia: {
        total_liquido: diaResumo.total_liquido,
        total_diarias: diaResumo.total_diarias,
        total_comissoes: diaResumo.total_comissoes,
        ajustes_manuais: diaResumo.ajustes_manuais,
        total_final: diaResumo.total_final,
      },
      cancelamentos_por_dia: dias.map((dia) => ({
        data_referencia: dia.data_referencia,
        quantidade: dia.pagamentos_cancelados,
        valor: dia.valor_cancelado,
      })),
    },
  };
}
