export type FechamentoCaixaStatus = 'aberto' | 'fechado';
export type FechamentoCaixaEventoTipo = 'ajuste' | 'fechado' | 'reaberto';
export type FechamentoCaixaEscopoLancamento = 'geral' | 'profissional';

export interface FechamentoCaixaAjusteResumo {
  tipo:
    | 'profissional_excluido'
    | 'procedimento_excluido'
    | 'diaria_override'
    | 'comissao_avaliacao_override'
    | 'comissao_execucao_override'
    | 'procedimento_valor_override'
    | 'lancamento_manual';
  label: string;
  motivo: string;
  antes?: number | string | boolean | null;
  depois?: number | string | boolean | null;
}

export interface FechamentoCaixaLancamentoManual {
  id: string;
  escopo: FechamentoCaixaEscopoLancamento;
  usuario_id: number | null;
  descricao: string;
  valor: number;
  motivo: string;
  created_at: string;
}

export interface FechamentoCaixaProfissionalDraft {
  included?: boolean;
  included_motivo?: string | null;
  valor_diaria_override?: number | null;
  valor_diaria_motivo?: string | null;
  comissao_avaliacao_override?: number | null;
  comissao_avaliacao_motivo?: string | null;
  comissao_execucao_override?: number | null;
  comissao_execucao_motivo?: string | null;
}

export interface FechamentoCaixaProcedimentoDraft {
  included?: boolean;
  included_motivo?: string | null;
  valor_override?: number | null;
  valor_motivo?: string | null;
}

export interface FechamentoCaixaDraft {
  profissionais: Record<string, FechamentoCaixaProfissionalDraft>;
  procedimentos: Record<string, FechamentoCaixaProcedimentoDraft>;
  lancamentos_manuais: FechamentoCaixaLancamentoManual[];
}

export interface FechamentoCaixaRankingVinculo {
  usuario_id: number;
  nome: string;
  valor_gerado: number;
  valor_comissao?: number;
  origem?: 'avaliacao' | 'acrescimo' | 'execucao';
}

export interface FechamentoCaixaProcedimento {
  key: string;
  item_id: number;
  atendimento_id: number;
  cliente_nome: string;
  procedimento_nome: string;
  procedimento_label: string;
  valor: number;
  concluido_at: string | null;
  included: boolean;
  manualmente_editado: boolean;
  ajustes: FechamentoCaixaAjusteResumo[];
  ranking_avaliadores: FechamentoCaixaRankingVinculo[];
  ranking_executores: FechamentoCaixaRankingVinculo[];
}

export interface FechamentoCaixaDentista {
  usuario_id: number;
  nome: string;
  included: boolean;
  manualmente_editado: boolean;
  ajuste_count: number;
  valor_diaria: number;
  comissao_avaliacao: number;
  comissao_execucao: number;
  ajustes: FechamentoCaixaAjusteResumo[];
  lancamentos_manuais: FechamentoCaixaLancamentoManual[];
  total_dia: number;
  procedimentos_executados: FechamentoCaixaProcedimento[];
}

export interface FechamentoCaixaResumo {
  faturamento_dia: number;
  faturamento_por_metodo: Array<{
    metodo: string;
    total: number;
    quantidade: number;
  }>;
  procedimentos_executados: number;
  total_diarias: number;
  total_comissao_avaliacao: number;
  total_comissao_execucao: number;
  ajustes_manuais: number;
  total_final: number;
  pagamentos_cancelados_dia: {
    quantidade: number;
    valor: number;
  };
}

export interface FechamentoCaixaGraficos {
  procedimentos_por_quantidade: Array<{
    nome: string;
    quantidade: number;
    valor_total: number;
  }>;
  ranking_avaliadores: Array<{
    usuario_id: number;
    nome: string;
    valor_gerado: number;
    quantidade: number;
  }>;
  ranking_executores: Array<{
    usuario_id: number;
    nome: string;
    valor_gerado: number;
    quantidade: number;
  }>;
}

export interface FechamentoCaixaPagamentoForma {
  id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  cancelado: boolean;
  motivo_cancelamento: string | null;
  created_at: string;
}

export interface FechamentoCaixaPagamentoRecebido {
  id: string;
  pagamento_grupo_id: number | null;
  pagamento_representante_id: number;
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  valor_total: number;
  observacoes: string | null;
  cancelado: boolean;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_id: number | null;
  recebido_por_nome: string | null;
  formas: FechamentoCaixaPagamentoForma[];
}

export interface FechamentoCaixaVisao {
  data_referencia: string;
  unidade_id: number;
  unidade_nome: string | null;
  editado_manual: boolean;
  ajustes_count: number;
  resumo: FechamentoCaixaResumo;
  graficos: FechamentoCaixaGraficos;
  dentistas: FechamentoCaixaDentista[];
  lancamentos_manuais_gerais: FechamentoCaixaLancamentoManual[];
  pagamentos_recebidos_dia: FechamentoCaixaPagamentoRecebido[];
}

export interface FechamentoCaixaMeta {
  id: number | null;
  unidade_id: number;
  data_referencia: string;
  status: FechamentoCaixaStatus;
  editado_manual: boolean;
  ajustes_count: number;
  fechado_por_id: number | null;
  fechado_por_nome: string | null;
  fechado_em: string | null;
  updated_by_id: number | null;
  updated_by_nome: string | null;
  updated_at: string | null;
}

export interface FechamentoCaixaRecente {
  id: number;
  data_referencia: string;
  status: FechamentoCaixaStatus;
  editado_manual: boolean;
  ajustes_count: number;
  fechado_por_nome: string | null;
  fechado_em: string | null;
}

export interface FechamentoCaixaResponse {
  fechamento: FechamentoCaixaMeta;
  draft: FechamentoCaixaDraft;
  base: FechamentoCaixaVisao;
  resultado: FechamentoCaixaVisao;
  recentes: FechamentoCaixaRecente[];
}
