export interface AtendimentoResumo {
  id: number;
  status: string;
  avaliador_nome: string | null;
  unidade_nome: string | null;
  created_at: string;
  finalizado_at: string | null;
  total: number;
  total_pago: number;
}

export interface ItemProcedimento {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  valor_pago: number;
  status: string;
  dentes: string | null;
  quantidade: number;
  observacoes: string | null;
  created_at: string;
  concluido_at: string | null;
}

export interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  recebido_por_nome: string | null;
  created_at: string;
}

export interface EventoHistorico {
  tipo: string;
  data: string;
  descricao: string;
  ref_id: number;
}

export interface ItemProntuario {
  item_id: number;
  atendimento_id: number;
  concluido_at: string | null;
  dentes: string | null;
  quantidade: number;
  item_observacoes: string | null;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  prontuario_id: number | null;
  prontuario_descricao: string | null;
  prontuario_observacoes: string | null;
  prontuario_data: string | null;
  prontuario_updated_at: string | null;
  prontuario_autor: string | null;
}

export interface Movimentacao {
  tipo: string;
  data: string;
  descricao: string | null;
  ref_id: number;
  valor: number;
  saldo_anterior: number;
  saldo_novo: number;
}

export interface FichaData {
  atendimentos: AtendimentoResumo[];
  procedimentos: ItemProcedimento[];
  pagamentos: Pagamento[];
  historico: EventoHistorico[];
  prontuarios: ItemProntuario[];
  movimentacoes: Movimentacao[];
}

export const METODOS_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

export const HISTORICO_CONFIG: Record<string, { label: string; cor: string }> = {
  atendimento_criado:     { label: 'Atendimento criado',     cor: 'bg-primary-500' },
  liberado:               { label: 'Liberado para execução', cor: 'bg-primary-400' },
  finalizado:             { label: 'Finalizado',             cor: 'bg-success-500' },
  pagamento:              { label: 'Pagamento',              cor: 'bg-warning-500' },
  procedimento:           { label: 'Procedimento',           cor: 'bg-neutral-400' },
  etapa_concluida:        { label: 'Etapa concluída',        cor: 'bg-success-400' },
  credito:                { label: 'Crédito de saldo',       cor: 'bg-success-600' },
  debito:                 { label: 'Débito de saldo',        cor: 'bg-error-500' },
  estorno:                { label: 'Estorno',                cor: 'bg-warning-600' },
  transferencia_saida:    { label: 'Transf. enviada',        cor: 'bg-error-400' },
  transferencia_entrada:  { label: 'Transf. recebida',       cor: 'bg-success-400' },
};
