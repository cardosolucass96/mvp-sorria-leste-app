-- =====================================================
-- MIGRAÇÃO: Categorias de fila (dinâmicas) + Múltiplas roles por usuário
-- =====================================================

-- Categorias (filas dinâmicas — ex: Geral, Ortodontia, Endodontia, ...)
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT 'primary',      -- token de cor (primary, info, amber, success, ...)
  icone TEXT NOT NULL DEFAULT 'Activity',   -- nome do ícone lucide-react
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  pula_avaliacao INTEGER NOT NULL DEFAULT 0, -- 1 = atendimento nasce direto em aguardando_pagamento
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_categorias_slug  ON categorias(slug);
CREATE INDEX IF NOT EXISTS idx_categorias_ativo ON categorias(ativo);

-- Amarra roles que atendem cada categoria (visualizam a fila e podem ser executores)
CREATE TABLE IF NOT EXISTS categoria_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (categoria_id, role)
);
CREATE INDEX IF NOT EXISTS idx_categoria_roles_cat  ON categoria_roles(categoria_id);
CREATE INDEX IF NOT EXISTS idx_categoria_roles_role ON categoria_roles(role);

-- Múltiplas roles por usuário (source of truth de autorização)
CREATE TABLE IF NOT EXISTS usuario_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (usuario_id, role)
);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_usuario ON usuario_roles(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_roles_role    ON usuario_roles(role);

-- FK categoria nas tabelas core
ALTER TABLE procedimentos ADD COLUMN categoria_id INTEGER REFERENCES categorias(id);
ALTER TABLE atendimentos  ADD COLUMN categoria_id INTEGER REFERENCES categorias(id);

CREATE INDEX IF NOT EXISTS idx_procedimentos_categoria ON procedimentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_categoria  ON atendimentos(categoria_id);

-- =====================================================
-- SEED
-- =====================================================

INSERT INTO categorias (id, nome, slug, cor, icone, ordem, pula_avaliacao) VALUES
  (1, 'Geral',      'geral', 'primary', 'Activity', 0, 0),
  (2, 'Ortodontia', 'orto',  'info',    'Smile',    1, 1);

-- Quem atende cada fila
INSERT INTO categoria_roles (categoria_id, role) VALUES
  (1, 'executor'),
  (1, 'admin'),
  (2, 'ortodontista'),
  (2, 'admin');

-- =====================================================
-- BACKFILL
-- =====================================================

-- Procedimentos "Ortodontia - *" viram categoria Ortodontia; resto vira Geral
UPDATE procedimentos SET categoria_id = 2
  WHERE categoria_id IS NULL AND nome LIKE 'Ortodontia%';
UPDATE procedimentos SET categoria_id = 1 WHERE categoria_id IS NULL;

-- Atendimentos antigos: tipo='orto' viram Ortodontia; resto vira Geral
UPDATE atendimentos SET categoria_id = 2
  WHERE categoria_id IS NULL AND tipo = 'orto';
UPDATE atendimentos SET categoria_id = 1 WHERE categoria_id IS NULL;

-- Popula usuario_roles a partir da role primária atual
INSERT OR IGNORE INTO usuario_roles (usuario_id, role)
  SELECT id, role FROM usuarios;
