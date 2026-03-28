-- Migração: adiciona tipo e motivo_saida em atendimentos, e cria tabela agendamentos

ALTER TABLE atendimentos ADD COLUMN tipo TEXT DEFAULT NULL;
ALTER TABLE atendimentos ADD COLUMN motivo_saida TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  atendimento_origem_id INTEGER,
  atendimento_id INTEGER,
  procedimento_id INTEGER NOT NULL,
  executor_id INTEGER,
  data_agendada TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'agendado', 'chegou', 'cancelado')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
