-- Migração: cria tabela agendamentos e adiciona colunas de referência

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  atendimento_origem_id INTEGER,
  procedimento_id INTEGER NOT NULL,
  item_atendimento_origem_id INTEGER,
  executor_id INTEGER,
  data_agendada TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'agendado', 'realizado', 'faltou', 'cancelado')),
  atendimento_sessao_id INTEGER,
  observacoes TEXT,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (item_atendimento_origem_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (atendimento_sessao_id) REFERENCES atendimentos(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendada);

-- Coluna de referência ao agendamento no atendimento
ALTER TABLE atendimentos ADD COLUMN agendamento_id INTEGER REFERENCES agendamentos(id);

-- Coluna de origem no item de atendimento
ALTER TABLE itens_atendimento ADD COLUMN origem_agendamento_id INTEGER REFERENCES agendamentos(id);
