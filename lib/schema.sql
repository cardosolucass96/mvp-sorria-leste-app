-- =====================================================
-- SCHEMA DO BANCO DE DADOS - SORRIA LESTE MVP
-- =====================================================

-- Tabela de Usuários (Atendente, Avaliador, Executor)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL DEFAULT 'Sorria@123',
  role TEXT NOT NULL CHECK (role IN ('atendente', 'avaliador', 'executor', 'admin')),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Atendimentos (Jornada do cliente)
CREATE TABLE IF NOT EXISTS atendimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  avaliador_id INTEGER, -- Pode ser null até ser atribuído
  liberado_por_id INTEGER, -- Quem liberou para execução
  status TEXT NOT NULL DEFAULT 'triagem' 
    CHECK (status IN ('triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  liberado_em TEXT, -- Data/hora da liberação para execução
  finalizado_at TEXT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (avaliador_id) REFERENCES usuarios(id),
  FOREIGN KEY (liberado_por_id) REFERENCES usuarios(id)
);

-- Itens do Atendimento (Procedimentos vinculados)
CREATE TABLE IF NOT EXISTS itens_atendimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  procedimento_id INTEGER NOT NULL,
  executor_id INTEGER, -- Dentista que vai executar
  criado_por_id INTEGER NOT NULL, -- Quem criou (avaliador ou executor)
  valor REAL NOT NULL, -- Valor do procedimento no momento
  valor_pago REAL NOT NULL DEFAULT 0, -- Quanto já foi pago deste procedimento
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'executando', 'concluido')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  concluido_at TEXT,
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por_id) REFERENCES usuarios(id)
);

-- Pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  recebido_por_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito')),
  parcelas INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
);

-- Parcelas Agendadas (para controle de pagamentos futuros)
CREATE TABLE IF NOT EXISTS parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  numero INTEGER NOT NULL, -- Número da parcela (1, 2, 3...)
  valor REAL NOT NULL,
  data_vencimento TEXT NOT NULL, -- Data de vencimento
  pago INTEGER NOT NULL DEFAULT 0, -- 0 = não pago, 1 = pago
  pagamento_id INTEGER, -- Referência ao pagamento quando for pago
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id)
);

-- Vinculação entre Pagamentos e Itens (qual pagamento cobriu qual procedimento)
CREATE TABLE IF NOT EXISTS pagamentos_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pagamento_id INTEGER NOT NULL,
  item_atendimento_id INTEGER NOT NULL,
  valor_aplicado REAL NOT NULL, -- Quanto deste pagamento foi aplicado neste item
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id)
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
  caminho TEXT NOT NULL, -- Caminho relativo do arquivo
  tamanho INTEGER NOT NULL, -- Tamanho em bytes
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON atendimentos(status);
CREATE INDEX IF NOT EXISTS idx_itens_atendimento ON itens_atendimento(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_itens_executor ON itens_atendimento(executor_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_atendimento ON pagamentos(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_atendimento ON parcelas(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_vencimento ON parcelas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_comissoes_atendimento ON comissoes(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_usuario ON comissoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_tipo ON comissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_notas_item ON notas_execucao(item_atendimento_id);
CREATE INDEX IF NOT EXISTS idx_anexos_item ON anexos_execucao(item_atendimento_id);
