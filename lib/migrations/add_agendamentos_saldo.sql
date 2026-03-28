-- Migration: agendamentos, saldo_clientes, movimentacoes_saldo + alterações em atendimentos e itens_atendimento
-- GRU-45 Fase 1

-- 1. Sessões futuras agendadas
CREATE TABLE agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  atendimento_origem_id INTEGER NOT NULL,
  item_atendimento_origem_id INTEGER,
  atendimento_sessao_id INTEGER,
  procedimento_id INTEGER NOT NULL,
  executor_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','agendado','realizado','faltou','cancelado')),
  data_agendada TEXT,
  observacoes TEXT,
  motivo_cancelamento TEXT,
  reagendado_de_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_origem_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (atendimento_sessao_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (reagendado_de_id) REFERENCES agendamentos(id)
);

CREATE INDEX idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX idx_agendamentos_status ON agendamentos(status);
CREATE INDEX idx_agendamentos_data ON agendamentos(data_agendada);

-- 2. Saldo disponível por cliente
CREATE TABLE saldo_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL UNIQUE,
  saldo REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- 3. Ledger de movimentações do saldo
CREATE TABLE movimentacoes_saldo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'credito', 'debito', 'estorno',
    'transferencia_saida', 'transferencia_entrada'
  )),
  valor REAL NOT NULL,
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

-- 4. Alterações em tabelas existentes

-- atendimentos: tipo de atendimento, link ao agendamento e motivo de saída
ALTER TABLE atendimentos ADD COLUMN agendamento_id INTEGER REFERENCES agendamentos(id);
ALTER TABLE atendimentos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'normal'
  CHECK (tipo IN ('normal','sessao','orto'));
ALTER TABLE atendimentos ADD COLUMN motivo_saida TEXT;

-- itens_atendimento: rastreabilidade de qual agendamento originou o item
ALTER TABLE itens_atendimento ADD COLUMN origem_agendamento_id INTEGER REFERENCES agendamentos(id);
