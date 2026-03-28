// Tipos do banco de dados

export type UserRole = 'admin' | 'atendente' | 'avaliador' | 'executor';

export type AtendimentoStatus = 
  | 'triagem' 
  | 'avaliacao' 
  | 'aguardando_pagamento' 
  | 'em_execucao' 
  | 'finalizado';

export type AtendimentoTipo = 'normal' | 'sessao' | 'orto';

export type ItemStatus = 'pendente' | 'pago' | 'executando' | 'concluido';

export type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito';

export type AgendamentoStatus =
  | 'pendente'    // gerado, sem data definida
  | 'agendado'    // tem data_agendada
  | 'realizado'   // cliente chegou, atendimento_sessao_id preenchido
  | 'faltou'      // não compareceu
  | 'cancelado';

export type MotivoSaida = 'sem_tratamento' | 'tratamento_completo' | 'continuacao';

export type OrigemCliente = 
  | 'fachada'
  | 'trafego_meta'
  | 'trafego_google'
  | 'organico'
  | 'indicacao';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  ativo: number; // 0 ou 1
  created_at: string;
}

export interface Cliente {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  origem: OrigemCliente;
  observacoes: string | null;
  created_at: string;
}

export interface Procedimento {
  id: number;
  nome: string;
  descricao: string | null;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  por_dente: number; // 0 ou 1 - indica se o valor é cobrado por dente
  ativo: number;
  created_at: string;
}

export interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  liberado_por_id: number | null;
  agendamento_id: number | null;
  status: AtendimentoStatus;
  tipo: AtendimentoTipo;
  motivo_saida: MotivoSaida | null;
  observacoes: string | null;
  created_at: string;
  liberado_em: string | null;
  finalizado_at: string | null;
}

export interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number;
  valor: number;
  valor_pago: number;
  dentes: string | null; // JSON array com números dos dentes
  quantidade: number; // Quantidade de dentes
  group_id: string | null; // UUID compartilhado entre itens do mesmo procedimento por_dente
  dente_unico: string | null; // Número do dente individual quando group_id presente
  origem_agendamento_id: number | null;
  status: ItemStatus;
  observacoes: string | null;
  created_at: string;
  concluido_at: string | null;
}

export interface Pagamento {
  id: number;
  atendimento_id: number;
  recebido_por_id: number;
  valor: number;
  metodo: MetodoPagamento;
  parcelas: number;
  observacoes: string | null;
  created_at: string;
}

export interface PagamentoCompleto extends Pagamento {
  recebido_por_nome: string;
}

export interface PagamentoItem {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number;
  valor_aplicado: number;
  created_at: string;
}

// Tipos com joins para exibição
export interface AtendimentoCompleto extends Atendimento {
  cliente_nome: string;
  avaliador_nome: string | null;
  liberado_por_nome: string | null;
}

export interface ItemAtendimentoCompleto extends ItemAtendimento {
  procedimento_nome: string;
  executor_nome: string | null;
  criado_por_nome: string;
}

export interface Agendamento {
  id: number;
  cliente_id: number;
  atendimento_origem_id: number;
  item_atendimento_origem_id: number | null;
  atendimento_sessao_id: number | null;
  procedimento_id: number;
  executor_id: number | null;
  status: AgendamentoStatus;
  data_agendada: string | null;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  reagendado_de_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgendamentoCompleto extends Agendamento {
  cliente_nome: string;
  cliente_telefone: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
}

export interface SaldoCliente {
  id: number;
  cliente_id: number;
  saldo: number;
  updated_at: string;
}

export interface MovimentacaoSaldo {
  id: number;
  cliente_id: number;
  tipo: 'credito' | 'debito' | 'estorno' | 'transferencia_saida' | 'transferencia_entrada';
  valor: number;
  pagamento_id: number | null;
  item_atendimento_id: number | null;
  atendimento_id: number | null;
  cliente_destino_id: number | null;
  observacoes: string | null;
  created_at: string;
}
