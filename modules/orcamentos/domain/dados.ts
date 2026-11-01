export interface BaseItemRow {
  item_id: number;
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  atendimento_status: string;
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

export interface ActiveAgendamentoRow {
  agendamento_id: number;
  atendimento_origem_id: number;
  item_atendimento_origem_id: number | null;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  atendimento_status: string;
  procedimento_id: number | null;
  procedimento_nome: string | null;
  procedimento_valor: number | null;
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

export interface EtapaOrcamento { id: number; nome: string; valor: number; valor_pago: number; }
export interface DadosOrcamentos {
  baseItems: BaseItemRow[];
  activeAgendamentos: ActiveAgendamentoRow[];
  etapasPorItem: Record<number, EtapaOrcamento[]>;
  etapasModelo: Record<number, Array<{ id: number; nome: string; valor: number | null }>>;
}
