-- Migração: cria tabela agendamentos e adiciona colunas de referência
-- NOTA: Se o banco já foi criado com o schema.sql atualizado, esta migração é no-op.

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS agendamentos (
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_origem_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (atendimento_sessao_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (reagendado_de_id) REFERENCES agendamentos(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendada);
