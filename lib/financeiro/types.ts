import type {
  FechamentoCaixaMeta,
  FechamentoCaixaPagamentoRecebido,
  FechamentoCaixaRecente,
  FechamentoCaixaVisao,
} from '@/lib/fechamento-caixa/types';

export interface FinanceiroDiaResumo {
  data_referencia: string;
  unidade_id: number;
  unidade_nome: string | null;
  status: FechamentoCaixaMeta['status'];
  editado_manual: boolean;
  ajustes_count: number;
  fechado_por_nome: string | null;
  fechado_em: string | null;
  total_bruto: number;
  total_liquido: number;
  total_final: number;
  total_diarias: number;
  total_comissoes: number;
  total_comissao_avaliacao: number;
  total_comissao_execucao: number;
  ajustes_manuais: number;
  procedimentos_executados: number;
  pagamentos: number;
  pagamentos_cancelados: number;
  valor_cancelado: number;
}

export interface FinanceiroMetodoResumo {
  metodo: string;
  label: string;
  total: number;
  quantidade: number;
}

export interface FinanceiroComposicaoResultado {
  total_liquido: number;
  total_diarias: number;
  total_comissoes: number;
  ajustes_manuais: number;
  total_final: number;
}

export interface FinanceiroReceitaPeriodo extends FechamentoCaixaPagamentoRecebido {
  data_referencia: string;
}

export interface FinanceiroGraficos {
  faturamento_por_dia: Array<{
    data_referencia: string;
    total_bruto: number;
    total_liquido: number;
    total_final: number;
  }>;
  metodos_pagamento: FinanceiroMetodoResumo[];
  composicao_resultado_dia: FinanceiroComposicaoResultado;
  cancelamentos_por_dia: Array<{
    data_referencia: string;
    quantidade: number;
    valor: number;
  }>;
}

export interface FinanceiroResponse {
  dia: {
    meta: FechamentoCaixaMeta;
    resultado: FechamentoCaixaVisao;
    recentes: FechamentoCaixaRecente[];
  };
  periodo: {
    data_inicio: string;
    data_fim: string;
    dias: number;
  };
  dias: FinanceiroDiaResumo[];
  receitas_periodo: FinanceiroReceitaPeriodo[];
  resumo_periodo: Omit<FinanceiroDiaResumo, 'data_referencia' | 'status' | 'fechado_por_nome' | 'fechado_em'>;
  graficos: FinanceiroGraficos;
}
