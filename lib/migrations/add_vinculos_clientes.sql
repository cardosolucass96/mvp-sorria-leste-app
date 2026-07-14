-- Migration: add_vinculos_clientes
-- Adiciona tabela de vínculos entre clientes

CREATE TABLE IF NOT EXISTS vinculos_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_vinculado_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  observacao TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (cliente_id != cliente_vinculado_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vinculos_par
  ON vinculos_clientes (MIN(cliente_id, cliente_vinculado_id), MAX(cliente_id, cliente_vinculado_id));

CREATE INDEX IF NOT EXISTS idx_vinculos_cliente_id ON vinculos_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_cliente_vinculado_id ON vinculos_clientes(cliente_vinculado_id);
