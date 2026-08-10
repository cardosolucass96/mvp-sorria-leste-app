export type StatusComercialProcedimento = 'proposto' | 'aceito' | 'recusado' | 'cancelado';
export type StatusClinicoProcedimento = 'nao_iniciado' | 'em_execucao' | 'concluido' | 'cancelado';
export type StatusFinanceiroProcedimento = 'nao_pago' | 'parcial' | 'quitado' | 'estornado';
export type StatusAgendaProcedimento = 'sem_agendamento' | 'agendado';
export type OrigemProcedimentoCliente = 'avaliacao' | 'acrescimo_execucao' | 'importado';

export type StatusAtendimentoClinico = 'aguardando' | 'em_andamento' | 'finalizado' | 'cancelado';
export type StatusAvaliacao = 'em_andamento' | 'concluida' | 'cancelada';
export type StatusOrcamento =
  | 'rascunho'
  | 'apresentado'
  | 'parcialmente_aceito'
  | 'aceito'
  | 'recusado'
  | 'cancelado';
export type StatusAgendaCompromisso = 'agendado' | 'realizado' | 'faltou' | 'cancelado';
export type CanalRecebimento = 'presencial' | 'remoto' | 'link' | 'importado';

export interface ProcedimentoClienteOperacional {
  id: string;
  cliente_id: number;
  unidade_id: number;
  cliente_nome: string;
  procedimento_catalogo_id: number;
  nome_snapshot: string;
  quantidade: number;
  valor_tabela_centavos: number;
  desconto_centavos: number;
  desconto_motivo: string | null;
  valor_final_centavos: number;
  valor_recebido_centavos: number;
  status_comercial: StatusComercialProcedimento;
  status_clinico: StatusClinicoProcedimento;
  status_financeiro: StatusFinanceiroProcedimento;
  status_agenda: StatusAgendaProcedimento;
  origem: OrigemProcedimentoCliente;
  executor_preferencial_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProcedimentoClienteInput {
  procedimento_catalogo_id: number;
  quantidade?: number;
  desconto_centavos?: number;
  desconto_motivo?: string | null;
  executor_preferencial_id?: number | null;
  dentes?: Array<{ dente: string; faces?: string[] }>;
}

export interface RecebimentoFormaInput {
  forma_pagamento_id: number;
  valor_centavos: number;
  taxa_bps?: number;
  taxa_fixa_centavos?: number;
  parcelas?: number;
  referencia_externa?: string | null;
}

export interface RecebimentoAlocacaoInput {
  procedimento_cliente_id: string;
  procedimento_cliente_etapa_id?: string | null;
  valor_centavos: number;
}

export interface AgendaCompromissoItemInput {
  procedimento_cliente_id: string;
  procedimento_cliente_etapa_id?: string | null;
  profissional_id?: number | null;
  observacoes?: string | null;
}

export interface V2DashboardIndicadores {
  atendimentos_clinicos_realizados: number;
  avaliacoes_concluidas: number;
  avaliacoes_com_orcamento: number;
  orcamentos_apresentados: number;
  avaliacoes_convertidas: number;
  taxa_geracao: number;
  taxa_apresentacao: number;
  conversao_comercial: number;
  valor_proposto_centavos: number;
  valor_aceito_centavos: number;
  valor_recebido_centavos: number;
  valor_executado_centavos: number;
}
