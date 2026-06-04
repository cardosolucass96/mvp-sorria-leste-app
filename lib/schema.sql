-- =====================================================
-- SCHEMA DO BANCO DE DADOS - SORRIA LESTE MVP
-- =====================================================

-- Tabela de Usuários (Atendente, Avaliador, Executor, Ortodontista)
-- NOTE: `role` é a role primária (display/badge). Autorização real lê de usuario_roles (M2M).
-- O CHECK abaixo NÃO inclui 'ortodontista' — SQLite não faz DROP CONSTRAINT.
-- Um ortodontista puro tem usuarios.role = 'executor' (ou outro válido) e usuario_roles traz 'ortodontista'.
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL DEFAULT 'Sorria@123',
  role TEXT NOT NULL CHECK (role IN ('atendente', 'avaliador', 'executor', 'admin')),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- M2M: roles efetivas do usuário (source of truth de autorização)
CREATE TABLE IF NOT EXISTS usuario_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (usuario_id, role)
);

-- Categorias (filas dinâmicas — ex: Geral, Ortodontia, ...)
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT 'primary',
  icone TEXT NOT NULL DEFAULT 'Activity',
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  pula_avaliacao INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Roles que atendem cada categoria
CREATE TABLE IF NOT EXISTS categoria_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (categoria_id, role)
);

-- Tabela de Clientes (Pacientes)
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  telefone TEXT,
  email TEXT,
  data_nascimento TEXT,
  endereco TEXT,
  origem TEXT NOT NULL DEFAULT 'fachada' CHECK (origem IN ('fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao')),
  sexo TEXT CHECK (sexo IN ('masculino', 'feminino', 'outro')),
  plano_odontologico TEXT CHECK (plano_odontologico IN ('Clin', 'Prime', 'OdontoArt')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Catálogo de Procedimentos Odontológicos
CREATE TABLE IF NOT EXISTS procedimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  valor REAL NOT NULL DEFAULT 0,
  comissao_venda REAL NOT NULL DEFAULT 0,  -- % comissão do avaliador
  comissao_execucao REAL NOT NULL DEFAULT 0, -- % comissão do executor
  por_dente INTEGER NOT NULL DEFAULT 0, -- 1 se o valor é cobrado por dente
  tem_etapas INTEGER NOT NULL DEFAULT 0, -- 1 se o procedimento tem etapas/sessões distintas
  tem_face INTEGER NOT NULL DEFAULT 0, -- 1 se a seleção de faces do dente é obrigatória (apenas para por_dente)
  categoria_id INTEGER REFERENCES categorias(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Modelo de etapas/sessões de um procedimento
CREATE TABLE IF NOT EXISTS procedimento_etapas_modelo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedimento_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  valor REAL,                           -- null = proporcional ao valor total do procedimento
  comissao_venda REAL NOT NULL DEFAULT 0,
  comissao_execucao REAL NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id)
);
CREATE INDEX IF NOT EXISTS idx_proc_etapas_modelo ON procedimento_etapas_modelo(procedimento_id);

-- Atendimentos (Jornada do cliente)
CREATE TABLE IF NOT EXISTS atendimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  avaliador_id INTEGER, -- Pode ser null até ser atribuído
  liberado_por_id INTEGER, -- Quem liberou para execução
  status TEXT NOT NULL DEFAULT 'triagem'
    CHECK (status IN ('triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado', 'encerrado')),
  agendamento_id INTEGER,
  unidade_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'normal'
    CHECK (tipo IN ('normal','sessao','orto')), -- LEGADO: categoria_id é o novo discriminador de fila
  categoria_id INTEGER REFERENCES categorias(id),
  motivo_saida TEXT,
  observacoes TEXT,
  observacoes_encerramento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  liberado_em TEXT, -- Data/hora da liberação para execução
  finalizado_at TEXT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (avaliador_id) REFERENCES usuarios(id),
  FOREIGN KEY (liberado_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

-- Itens do Atendimento (Procedimentos vinculados)
CREATE TABLE IF NOT EXISTS itens_atendimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  procedimento_id INTEGER NOT NULL,
  executor_id INTEGER, -- Dentista que vai executar
  criado_por_id INTEGER NOT NULL, -- Quem criou (avaliador ou executor)
  valor REAL NOT NULL, -- Valor efetivo do procedimento (pode ter sido editado pelo atendente)
  valor_original REAL, -- Valor de tabela/orçamento no momento da criação (snapshot); desconto = valor_original - valor
  valor_pago REAL NOT NULL DEFAULT 0, -- Quanto já foi pago deste procedimento
  dentes TEXT, -- Dentes selecionados (JSON array: ["11", "21", "31"])
  quantidade INTEGER NOT NULL DEFAULT 1, -- Quantidade de dentes (para cálculo do valor)
  group_id TEXT, -- UUID compartilhado entre itens do mesmo procedimento por_dente
  dente_unico TEXT, -- Número do dente individual (ex: "11") quando group_id presente
  origem_agendamento_id INTEGER, -- Qual agendamento originou este item
  etapa_modelo_id INTEGER, -- Etapa específica do procedimento (quando tem_etapas=1 e é uma sessão)
  etapa_label TEXT,        -- Label da(s) etapa(s) desta sessão ex: "Etapa 1" ou "Etapa 1, Etapa 2"
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'executando', 'concluido')),
  adicionado_em_execucao INTEGER NOT NULL DEFAULT 0, -- 1 se foi adicionado pelo executor durante a execução (pode ser concluído antes do pagamento)
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  concluido_at TEXT,
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (origem_agendamento_id) REFERENCES agendamentos(id),
  FOREIGN KEY (etapa_modelo_id) REFERENCES procedimento_etapas_modelo(id)
);

-- Pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  recebido_por_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria')),
  observacoes TEXT,
  cancelado INTEGER DEFAULT 0,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
);

-- Comissões (geradas ao finalizar atendimento)
CREATE TABLE IF NOT EXISTS comissoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  item_atendimento_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL, -- Quem recebe a comissão
  tipo TEXT NOT NULL CHECK (tipo IN ('venda', 'execucao')), -- Tipo de comissão
  percentual REAL NOT NULL, -- % da comissão aplicada
  valor_base REAL NOT NULL, -- Valor do procedimento
  valor_comissao REAL NOT NULL, -- Valor calculado da comissão
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Notas de Execução (anotações durante a execução do procedimento)
CREATE TABLE IF NOT EXISTS notas_execucao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_atendimento_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL, -- Quem escreveu a nota
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Anexos de Execução (arquivos/imagens de exames)
CREATE TABLE IF NOT EXISTS anexos_execucao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_atendimento_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL, -- Quem fez upload
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL, -- ex: image/jpeg, application/pdf
  caminho TEXT NOT NULL, -- Caminho no R2 ou local
  tamanho INTEGER NOT NULL, -- Tamanho em bytes
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Anexos do Cliente (arquivos vinculados diretamente ao cliente — exames, prontuários externos, etc.)
CREATE TABLE IF NOT EXISTS anexos_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL, -- Quem fez upload
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL, -- ex: image/jpeg, application/pdf
  caminho TEXT NOT NULL, -- Chave no R2
  tamanho INTEGER NOT NULL, -- Tamanho em bytes
  descricao TEXT, -- Observação do atendente sobre o arquivo
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Prontuário de Execução (obrigatório para conclusão do procedimento)
CREATE TABLE IF NOT EXISTS prontuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_atendimento_id INTEGER NOT NULL UNIQUE, -- Um prontuário por item
  usuario_id INTEGER NOT NULL, -- Executor que preencheu
  descricao TEXT NOT NULL, -- Descrição detalhada do procedimento realizado (mínimo 50 caracteres)
  observacoes TEXT, -- Observações adicionais opcionais
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Sessões futuras agendadas
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  atendimento_origem_id INTEGER,            -- Null para agendamentos avulsos (avaliação)
  item_atendimento_origem_id INTEGER,
  atendimento_sessao_id INTEGER,
  procedimento_id INTEGER,                  -- Null para agendamento de avaliação
  executor_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'procedimento'
    CHECK (tipo IN ('avaliacao','procedimento')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','agendado','realizado','faltou','cancelado')),
  data_agendada TEXT,
  observacoes TEXT,
  motivo_cancelamento TEXT,
  reagendado_de_id INTEGER,
  etapa_modelo_id INTEGER, -- Etapa específica do procedimento (quando tem_etapas=1)
  pago INTEGER NOT NULL DEFAULT 0, -- 1 se o item já foi pago antes de ser adiado
  unidade_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_origem_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (atendimento_sessao_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (reagendado_de_id) REFERENCES agendamentos(id),
  FOREIGN KEY (etapa_modelo_id) REFERENCES procedimento_etapas_modelo(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

-- Follow-up operacional da recepção
CREATE TABLE IF NOT EXISTS followup_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  unidade_id INTEGER NOT NULL,
  responsavel_usuario_id INTEGER NOT NULL,
  criado_por_id INTEGER NOT NULL,
  concluida_por_id INTEGER,
  excluida_por_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('orcamento', 'sem_posicao', 'retorno', 'cobranca', 'outro')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'concluida')),
  vencimento_em TEXT NOT NULL, -- YYYY-MM-DD HH:MM:SS (horário local)
  nota_conclusao TEXT,
  concluida_em TEXT,
  excluida_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (responsavel_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (concluida_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (excluida_por_id) REFERENCES usuarios(id)
);

-- Saldo disponível por cliente
CREATE TABLE IF NOT EXISTS saldo_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL UNIQUE,
  saldo REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- Ledger de movimentações do saldo
CREATE TABLE IF NOT EXISTS movimentacoes_saldo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'credito', 'debito', 'estorno',
    'transferencia_saida', 'transferencia_entrada'
  )),
  valor REAL NOT NULL,
  saldo_anterior REAL NOT NULL,
  saldo_novo REAL NOT NULL,
  pagamento_id INTEGER,
  item_atendimento_id INTEGER,
  atendimento_id INTEGER,
  cliente_destino_id INTEGER,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (cliente_destino_id) REFERENCES clientes(id)
);

-- Vínculos entre clientes
CREATE TABLE IF NOT EXISTS vinculos_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_vinculado_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  CHECK (cliente_id != cliente_vinculado_id)
);

-- Unidades (clínicas)
CREATE TABLE IF NOT EXISTS unidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Tabela ponte: usuários <-> unidades (N:N)
CREATE TABLE IF NOT EXISTS usuario_unidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  unidade_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  UNIQUE(usuario_id, unidade_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON atendimentos(status);
CREATE INDEX IF NOT EXISTS idx_itens_atendimento ON itens_atendimento(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_itens_executor ON itens_atendimento(executor_id);
CREATE INDEX IF NOT EXISTS idx_itens_group_id ON itens_atendimento(group_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_atendimento ON pagamentos(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_atendimento ON comissoes(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_usuario ON comissoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_tipo ON comissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_notas_item ON notas_execucao(item_atendimento_id);
CREATE INDEX IF NOT EXISTS idx_anexos_item ON anexos_execucao(item_atendimento_id);
CREATE INDEX IF NOT EXISTS idx_anexos_cliente ON anexos_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_atendimento ON agendamentos(atendimento_origem_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendada);
CREATE INDEX IF NOT EXISTS idx_followup_unidade_status_vencimento
  ON followup_tarefas(unidade_id, status, vencimento_em);
CREATE INDEX IF NOT EXISTS idx_followup_cliente ON followup_tarefas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_followup_responsavel ON followup_tarefas(responsavel_usuario_id);
CREATE INDEX IF NOT EXISTS idx_followup_excluida_em ON followup_tarefas(excluida_em);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_cliente ON movimentacoes_saldo(cliente_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON movimentacoes_saldo(tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes_saldo(created_at);
CREATE INDEX IF NOT EXISTS idx_vinculos_cliente_id ON vinculos_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_cliente_vinculado_id ON vinculos_clientes(cliente_vinculado_id);
CREATE INDEX IF NOT EXISTS idx_usu_unid_usuario ON usuario_unidades(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usu_unid_unidade ON usuario_unidades(unidade_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade ON atendimentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade ON agendamentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_categorias_slug ON categorias(slug);
CREATE INDEX IF NOT EXISTS idx_categorias_ativo ON categorias(ativo);
CREATE INDEX IF NOT EXISTS idx_categoria_roles_cat ON categoria_roles(categoria_id);
CREATE INDEX IF NOT EXISTS idx_categoria_roles_role ON categoria_roles(role);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario ON usuario_roles(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_role ON usuario_roles(role);
CREATE INDEX IF NOT EXISTS idx_procedimentos_categoria ON procedimentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_categoria ON atendimentos(categoria_id);
