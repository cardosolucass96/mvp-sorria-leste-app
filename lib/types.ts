// Tipos do banco de dados

export type UserRole = 'admin' | 'atendente' | 'avaliador' | 'executor' | 'ortodontista';

export type AtendimentoStatus =
  | 'triagem'
  | 'avaliacao'
  | 'aguardando_pagamento'
  | 'em_execucao'
  | 'finalizado'
  | 'encerrado';

export type AtendimentoTipo = 'normal' | 'sessao' | 'orto';

export type ItemStatus = 'pendente' | 'pago' | 'executando' | 'concluido';
export type DestinoOperacionalStatus =
  | 'indefinido'
  | 'fazer_hoje'
  | 'agendar'
  | 'pago_sem_data'
  | 'nao_pago_sem_data';

export type MetodoPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_debito'
  | 'cartao_credito'
  | 'crediario'
  | 'afins_sorria';

export type AgendamentoStatus =
  | 'pendente'    // gerado, sem data definida
  | 'agendado'    // tem data_agendada
  | 'realizado'   // cliente chegou, atendimento_sessao_id preenchido
  | 'faltou'      // não compareceu
  | 'cancelado';

export type FollowupTipo =
  | 'orcamento'
  | 'sem_posicao'
  | 'retorno'
  | 'cobranca'
  | 'outro';

export type FollowupStatus = 'aberta' | 'concluida';

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
  role: UserRole;           // Role primária (display/badge). Autorização usa `roles`.
  roles?: UserRole[];       // Todas as roles do usuário (source of truth em usuario_roles)
  ativo: number; // 0 ou 1
  created_at: string;
}

export interface Categoria {
  id: number;
  nome: string;
  slug: string;
  cor: string;
  icone: string;
  ativo: number;
  ordem: number;
  pula_avaliacao: number;
  created_at: string;
}

export interface CategoriaComRoles extends Categoria {
  roles: UserRole[];
}

export interface UsuarioRole {
  id: number;
  usuario_id: number;
  role: UserRole;
  created_at: string;
}

export interface CategoriaRole {
  id: number;
  categoria_id: number;
  role: UserRole;
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
  sexo: 'masculino' | 'feminino' | 'outro' | null;
  plano_odontologico: 'Clin' | 'Prime' | 'OdontoArt' | null;
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
  tem_etapas: number; // 0 ou 1 - indica se o procedimento tem etapas/sessões distintas
  tem_face: number; // 0 ou 1 - indica se a seleção de faces do dente é obrigatória (apenas para por_dente)
  categoria_id: number | null;
  ativo: number;
  created_at: string;
}

export interface Unidade {
  id: number;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  ativo: number;
  created_at: string;
}

export interface UsuarioUnidade {
  id: number;
  usuario_id: number;
  unidade_id: number;
  created_at: string;
}

export interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  liberado_por_id: number | null;
  agendamento_id: number | null;
  unidade_id: number;
  status: AtendimentoStatus;
  tipo: AtendimentoTipo;
  categoria_id: number | null;
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
  valor_original: number | null; // Valor de tabela/orçamento (snapshot); desconto = valor_original - valor
  valor_final: number | null;
  desconto_valor: number;
  desconto_motivo: string | null;
  desconto_aplicado_por_id: number | null;
  desconto_aplicado_em: string | null;
  etapas_valores: string | null; // JSON override por etapa: {"<etapa_modelo_id>": valor}; soma = item.valor
  valor_pago: number;
  dentes: string | null; // JSON array com números dos dentes
  quantidade: number; // Quantidade de dentes
  group_id: string | null; // UUID compartilhado entre itens do mesmo procedimento por_dente
  dente_unico: string | null; // Número do dente individual quando group_id presente
  origem_agendamento_id: number | null;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  status: ItemStatus;
  adicionado_em_execucao: number; // 1 se foi adicionado pelo executor durante a execução
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
  observacoes: string | null;
  created_at: string;
}

export interface PagamentoAlocacao {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number | null;
  agendamento_id: number | null;
  etapa_modelo_id: number | null;
  valor_alocado: number;
  created_at: string;
}

export interface ItemAtendimentoDestino {
  id: number;
  atendimento_id: number;
  item_atendimento_id: number;
  etapa_modelo_id: number | null;
  destino_status: DestinoOperacionalStatus;
  data_agendada: string | null;
  executor_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PagamentoCompleto extends Pagamento {
  recebido_por_nome: string;
}

// Tipos com joins para exibição
export interface AtendimentoCompleto extends Atendimento {
  cliente_nome: string;
  avaliador_nome: string | null;
  liberado_por_nome: string | null;
  unidade_nome?: string;
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
  etapa_modelo_id: number | null;
  unidade_id: number;
  created_at: string;
  updated_at: string;
}

export interface AgendamentoCompleto extends Agendamento {
  cliente_nome: string;
  cliente_telefone: string | null;
  procedimento_nome: string;
  etapa_modelo_nome: string | null;
  executor_nome: string | null;
  dias_desde_criacao: number;
  unidade_nome?: string;
}

export interface FollowupTarefa {
  id: number;
  cliente_id: number;
  unidade_id: number;
  responsavel_usuario_id: number;
  criado_por_id: number;
  concluida_por_id: number | null;
  excluida_por_id: number | null;
  tipo: FollowupTipo;
  titulo: string;
  descricao: string | null;
  status: FollowupStatus;
  vencimento_em: string;
  nota_conclusao: string | null;
  concluida_em: string | null;
  excluida_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupTarefaCompleta extends FollowupTarefa {
  cliente_nome: string;
  cliente_telefone: string | null;
  responsavel_usuario_nome: string;
  criado_por_nome: string;
  concluida_por_nome: string | null;
}

export interface SaldoCliente {
  id: number;
  cliente_id: number;
  saldo: number;
  updated_at: string;
}

export interface VinculoCliente {
  id: number;
  cliente_id: number;
  cliente_vinculado_id: number;
  observacao: string | null;
  created_at: string;
  // campos do outro cliente (join)
  outro_cliente_id: number;
  outro_cliente_nome: string;
  outro_cliente_cpf: string | null;
  outro_cliente_telefone: string | null;
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
