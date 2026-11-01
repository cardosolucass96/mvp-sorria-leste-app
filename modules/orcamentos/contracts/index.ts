export type SituacaoAgendamento = 'sem_agendamento' | 'agendamento_sem_data' | 'agendado_com_data';

export interface ProcedimentoItem {
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

export interface OrcamentoGrupo {
  atendimento_id: number;
  atendimento_status: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  valor_total_aberto: number;
  procedimentos: ProcedimentoItem[];
}

export interface SummaryResponse {
  valor_total_aberto: number;
  orcamentos_abertos: number;
  procedimentos_abertos: number;
  sem_agendamento: number;
  agendamento_sem_data: number;
  agendado_com_data: number;
}

export interface OrcamentosEmAbertoResponse { summary: SummaryResponse; items: OrcamentoGrupo[]; }
