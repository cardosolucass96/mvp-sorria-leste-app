-- Tabela de Agendamentos (retornos agendados)
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  procedimento_id INTEGER,
  data_agendada TEXT,              -- Data do retorno (pode ser null = "Sem data")
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'agendado', 'faltou', 'realizado', 'cancelado')),
  motivo_cancelamento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendada);
