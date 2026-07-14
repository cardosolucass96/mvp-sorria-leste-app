-- =====================================================
-- MIGRAÇÃO: Suporte a Múltiplas Unidades (Multi-Clínica)
-- =====================================================

-- Tabela de unidades (clínicas)
CREATE TABLE IF NOT EXISTS unidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Tabela ponte: usuários <-> unidades (N:N)
CREATE TABLE IF NOT EXISTS usuario_unidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  unidade_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  UNIQUE(usuario_id, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_usu_unid_usuario ON usuario_unidades(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usu_unid_unidade ON usuario_unidades(unidade_id);

-- Coluna unidade_id nas tabelas core
ALTER TABLE atendimentos ADD COLUMN unidade_id INTEGER REFERENCES unidades(id);
ALTER TABLE agendamentos ADD COLUMN unidade_id INTEGER REFERENCES unidades(id);

CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade ON atendimentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade ON agendamentos(unidade_id);

-- Seed das duas unidades iniciais
INSERT INTO unidades (id, nome) VALUES (1, 'Barra do Ceará');
INSERT INTO unidades (id, nome) VALUES (2, 'Vila União');

-- Backfill: todos os registros existentes vão para unidade 1
UPDATE atendimentos SET unidade_id = 1 WHERE unidade_id IS NULL;
UPDATE agendamentos SET unidade_id = 1 WHERE unidade_id IS NULL;

-- Todos os usuários existentes são atribuídos à unidade 1
INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id)
  SELECT id, 1 FROM usuarios;
