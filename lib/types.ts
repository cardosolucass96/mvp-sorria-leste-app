// Tipos do banco de dados

export type UserRole = 'admin' | 'atendente' | 'avaliador' | 'executor';

export type AtendimentoStatus = 
  | 'triagem' 
  | 'avaliacao' 
  | 'aguardando_pagamento' 
  | 'em_execucao' 
  | 'finalizado';

export type ItemStatus = 'pendente' | 'pago' | 'executando' | 'concluido';

export type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito';

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
  status: AtendimentoStatus;
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
