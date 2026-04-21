-- Adiciona métodos de pagamento: crediario, afins_sorria
-- SQLite não suporta ALTER CHECK, então recria a tabela

PRAGMA foreign_keys=OFF;

CREATE TABLE pagamentos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  recebido_por_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria')),
  parcelas INTEGER DEFAULT 1,
  observacoes TEXT,
  cancelado INTEGER DEFAULT 0,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
);

INSERT INTO pagamentos_new SELECT * FROM pagamentos;

DROP TABLE pagamentos;

ALTER TABLE pagamentos_new RENAME TO pagamentos;

CREATE INDEX IF NOT EXISTS idx_pagamentos_atendimento ON pagamentos(atendimento_id);

PRAGMA foreign_keys=ON;
