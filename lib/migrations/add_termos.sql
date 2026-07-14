-- =====================================================
-- MIGRAÇÃO: Templates de Termos (HTML)
-- =====================================================
CREATE TABLE IF NOT EXISTS termos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  conteudo_html TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_termos_ativo ON termos (ativo);
CREATE INDEX IF NOT EXISTS idx_termos_titulo ON termos (titulo);
