/**
 * Dados de seed padrão para testes.
 * Contém registros base usados nos testes de integração e de API.
 */

import type { Usuario, Cliente, Procedimento, Atendimento, ItemAtendimento } from '@/lib/types';

// ===========================================
// USUÁRIOS
// ===========================================

export const USUARIO_ADMIN: Usuario = {
  id: 1,
  nome: 'Admin Sistema',
  email: 'admin@sorrialeste.com',
  role: 'admin',
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const USUARIO_ATENDENTE: Usuario = {
  id: 2,
  nome: 'Maria Atendente',
  email: 'maria@sorrialeste.com',
  role: 'atendente',
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const USUARIO_AVALIADOR: Usuario = {
  id: 3,
  nome: 'Dr. João Avaliador',
  email: 'joao@sorrialeste.com',
  role: 'avaliador',
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const USUARIO_EXECUTOR: Usuario = {
  id: 4,
  nome: 'Dr. Carlos Executor',
  email: 'carlos@sorrialeste.com',
  role: 'executor',
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const USUARIO_INATIVO: Usuario = {
  id: 5,
  nome: 'Paulo Inativo',
  email: 'paulo@sorrialeste.com',
  role: 'atendente',
  ativo: 0,
  created_at: '2025-01-01 00:00:00',
};

export const TODOS_USUARIOS: Usuario[] = [
  USUARIO_ADMIN,
  USUARIO_ATENDENTE,
  USUARIO_AVALIADOR,
  USUARIO_EXECUTOR,
  USUARIO_INATIVO,
];

// ===========================================
// CLIENTES
// ===========================================

export const CLIENTE_BASICO: Cliente = {
  id: 1,
  nome: 'Lucas Cardoso',
  cpf: '52998224725', // CPF válido
  telefone: '11999887766',
  email: 'lucas@email.com',
  data_nascimento: '1990-05-15',
  endereco: 'Rua das Flores, 123',
  origem: 'fachada',
  observacoes: null,
  created_at: '2025-01-10 10:00:00',
};

export const CLIENTE_MINIMO: Cliente = {
  id: 2,
  nome: 'Ana Silva',
  cpf: null,
  telefone: null,
  email: null,
  data_nascimento: null,
  endereco: null,
  origem: 'indicacao',
  observacoes: null,
  created_at: '2025-01-11 10:00:00',
};

export const CLIENTE_COMPLETO: Cliente = {
  id: 3,
  nome: 'Roberto Souza',
  cpf: '11144477735', // CPF válido
  telefone: '21988776655',
  email: 'roberto@email.com',
  data_nascimento: '1985-12-25',
  endereco: 'Av Brasil, 456',
  origem: 'trafego_meta',
  observacoes: 'Cliente VIP',
  created_at: '2025-01-12 10:00:00',
};

export const TODOS_CLIENTES: Cliente[] = [
  CLIENTE_BASICO,
  CLIENTE_MINIMO,
  CLIENTE_COMPLETO,
];

// ===========================================
// PROCEDIMENTOS
// ===========================================

export const PROC_LIMPEZA: Procedimento = {
  id: 1,
  nome: 'Limpeza Dental',
  descricao: 'Profilaxia completa',
  valor: 150.0,
  comissao_venda: 10,
  comissao_execucao: 20,
  por_dente: 0,
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const PROC_RESTAURACAO: Procedimento = {
  id: 2,
  nome: 'Restauração',
  descricao: 'Restauração em resina',
  valor: 200.0,
  comissao_venda: 15,
  comissao_execucao: 25,
  por_dente: 1, // Cobrado por dente
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const PROC_CANAL: Procedimento = {
  id: 3,
  nome: 'Tratamento de Canal',
  descricao: 'Endodontia',
  valor: 800.0,
  comissao_venda: 10,
  comissao_execucao: 30,
  por_dente: 1,
  ativo: 1,
  created_at: '2025-01-01 00:00:00',
};

export const PROC_INATIVO: Procedimento = {
  id: 4,
  nome: 'Procedimento Antigo',
  descricao: 'Não mais oferecido',
  valor: 100.0,
  comissao_venda: 5,
  comissao_execucao: 10,
  por_dente: 0,
  ativo: 0,
  created_at: '2025-01-01 00:00:00',
};

export const TODOS_PROCEDIMENTOS: Procedimento[] = [
  PROC_LIMPEZA,
  PROC_RESTAURACAO,
  PROC_CANAL,
  PROC_INATIVO,
];

// ===========================================
// ATENDIMENTOS
// ===========================================

export const ATENDIMENTO_TRIAGEM: Atendimento = {
  id: 1,
  cliente_id: 1,
  avaliador_id: 3,
  liberado_por_id: null,
  status: 'triagem',
  observacoes: null,
  created_at: '2025-02-01 10:00:00',
  liberado_em: null,
  finalizado_at: null,
};

export const ATENDIMENTO_AVALIACAO: Atendimento = {
  id: 2,
  cliente_id: 2,
  avaliador_id: 3,
  liberado_por_id: null,
  status: 'avaliacao',
  observacoes: 'Paciente com dor',
  created_at: '2025-02-02 10:00:00',
  liberado_em: null,
  finalizado_at: null,
};

export const ATENDIMENTO_AGUARDANDO_PGTO: Atendimento = {
  id: 3,
  cliente_id: 3,
  avaliador_id: 3,
  liberado_por_id: null,
  status: 'aguardando_pagamento',
  observacoes: null,
  created_at: '2025-02-03 10:00:00',
  liberado_em: null,
  finalizado_at: null,
};

export const ATENDIMENTO_EM_EXECUCAO: Atendimento = {
  id: 4,
  cliente_id: 1,
  avaliador_id: 3,
  liberado_por_id: 1,
  status: 'em_execucao',
  observacoes: null,
  created_at: '2025-02-04 10:00:00',
  liberado_em: '2025-02-05 14:00:00',
  finalizado_at: null,
};

// ===========================================
// ITENS DE ATENDIMENTO
// ===========================================

export const ITEM_LIMPEZA_PENDENTE: ItemAtendimento = {
  id: 1,
  atendimento_id: 3,
  procedimento_id: 1,
  executor_id: 4,
  criado_por_id: 3,
  valor: 150.0,
  valor_pago: 0,
  dentes: null,
  quantidade: 1,
  status: 'pendente',
  observacoes: null,
  created_at: '2025-02-03 11:00:00',
  concluido_at: null,
};

export const ITEM_RESTAURACAO_PAGO: ItemAtendimento = {
  id: 2,
  atendimento_id: 4,
  procedimento_id: 2,
  executor_id: 4,
  criado_por_id: 3,
  valor: 400.0, // 200 x 2 dentes
  valor_pago: 400.0,
  dentes: '["11","21"]',
  quantidade: 2,
  status: 'pago',
  observacoes: null,
  created_at: '2025-02-04 11:00:00',
  concluido_at: null,
};

export const ITEM_CANAL_EXECUTANDO: ItemAtendimento = {
  id: 3,
  atendimento_id: 4,
  procedimento_id: 3,
  executor_id: 4,
  criado_por_id: 3,
  valor: 800.0,
  valor_pago: 800.0,
  dentes: '["36"]',
  quantidade: 1,
  status: 'executando',
  observacoes: 'Em andamento',
  created_at: '2025-02-04 11:30:00',
  concluido_at: null,
};

// ===========================================
// CPFs VÁLIDOS E INVÁLIDOS para testes
// ===========================================

export const CPFS_VALIDOS = [
  '52998224725',
  '11144477735',
  '98765432100',
  '45612378900',
];

export const CPFS_INVALIDOS = [
  '00000000000',  // todos iguais
  '11111111111',  // todos iguais
  '12345678901',  // dígito verificador errado
  '12345',        // muito curto
  '123456789012', // muito longo
  '',             // vazio
  'abcdefghijk',  // letras
];
