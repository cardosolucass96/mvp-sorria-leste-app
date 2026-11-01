export interface Pagamento {
  id: number;
  atendimento_id: number;
  pagamento_grupo_id: number | null;
  forma_pagamento_id: number | null;
  valor: number;
  metodo: string;
  forma_pagamento_grupo_snapshot: string | null;
  forma_pagamento_subgrupo_snapshot: string | null;
  taxa_percentual_snapshot: number | null;
  taxa_fixa_snapshot: number | null;
  valor_taxa: number | null;
  valor_liquido: number | null;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
}

export interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
}

export interface AlocacaoPagamentoInput {
  item_id: number;
  etapa_modelo_id?: number | null;
  valor: number;
}

export interface PagamentoFormaInput {
  forma_pagamento_id?: number;
  metodo?: string;
  valor: number;
}

export interface PagamentoFormaResolvedInput {
  forma_pagamento_id: number | null;
  metodo: string;
  valor: number;
  forma_pagamento_grupo_snapshot: string | null;
  forma_pagamento_subgrupo_snapshot: string | null;
  taxa_percentual_snapshot: number;
  taxa_fixa_snapshot: number;
  valor_taxa: number;
  valor_liquido: number;
}

export interface ItemPagamentoRow {
  id: number;
  procedimento_id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  etapas_valores: string | null;
  criado_por_id: number;
  adicionado_em_execucao: number;
  comissao_venda: number | null;
  comissao_acrescimo: number | null;
}

export interface PagamentoAgrupadoRow extends Pagamento {
  recebido_por_nome: string | null;
  grupo_valor_total: number | null;
  grupo_observacoes: string | null;
  grupo_cancelado: number | null;
  grupo_motivo_cancelamento: string | null;
  grupo_created_at: string | null;
}

export interface PagamentoAlocacaoResponse {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number | null;
  agendamento_id: number | null;
  etapa_modelo_id: number | null;
  valor_alocado: number;
  procedimento_nome: string;
  etapa_label: string | null;
  dentes: string | null;
  dente_unico: string | null;
  quantidade: number | null;
  data_agendada: string | null;
  agendamento_status: string | null;
}

export interface PagamentoAgrupadoResponse {
  id: string;
  pagamento_grupo_id: number | null;
  pagamento_representante_id: number;
  valor_total: number;
  valor_taxa_total: number;
  valor_liquido_total: number;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  alocacoes: PagamentoAlocacaoResponse[];
  formas: Array<{
    id: number;
    valor: number;
    metodo: string;
    forma_pagamento_id: number | null;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    taxa_percentual_snapshot: number | null;
    taxa_fixa_snapshot: number | null;
    valor_taxa: number | null;
    valor_liquido: number | null;
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
    alocacoes: PagamentoAlocacaoResponse[];
  }>;
}

export interface NormalizedAlocacao {
  item_id: number;
  etapa_modelo_id: number | null;
  valor: number;
}
