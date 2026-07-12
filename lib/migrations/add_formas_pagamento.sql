CREATE TABLE IF NOT EXISTS formas_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade_id INTEGER NOT NULL,
  grupo TEXT NOT NULL,
  subgrupo TEXT NOT NULL DEFAULT '',
  metodo_base TEXT NOT NULL CHECK (metodo_base IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria')),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  UNIQUE (unidade_id, grupo, subgrupo)
);

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_unidade ON formas_pagamento(unidade_id);
CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo ON formas_pagamento(unidade_id, ativo);

CREATE TABLE IF NOT EXISTS formas_pagamento_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forma_pagamento_id INTEGER NOT NULL,
  taxa_percentual REAL NOT NULL DEFAULT 0,
  taxa_fixa REAL NOT NULL DEFAULT 0,
  vigente_de TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  vigente_ate TEXT,
  alterado_por_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE CASCADE,
  FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_historico_forma
  ON formas_pagamento_historico(forma_pagamento_id, vigente_ate, vigente_de);

ALTER TABLE pagamentos ADD COLUMN forma_pagamento_id INTEGER REFERENCES formas_pagamento(id);
ALTER TABLE pagamentos ADD COLUMN forma_pagamento_grupo_snapshot TEXT;
ALTER TABLE pagamentos ADD COLUMN forma_pagamento_subgrupo_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE pagamentos ADD COLUMN taxa_percentual_snapshot REAL;
ALTER TABLE pagamentos ADD COLUMN taxa_fixa_snapshot REAL;
ALTER TABLE pagamentos ADD COLUMN valor_taxa REAL;
ALTER TABLE pagamentos ADD COLUMN valor_liquido REAL;

CREATE INDEX IF NOT EXISTS idx_pagamentos_forma_pagamento_id ON pagamentos(forma_pagamento_id);

UPDATE pagamentos
SET forma_pagamento_subgrupo_snapshot = COALESCE(forma_pagamento_subgrupo_snapshot, '');

UPDATE pagamentos
SET taxa_percentual_snapshot = COALESCE(taxa_percentual_snapshot, 0),
    taxa_fixa_snapshot = COALESCE(taxa_fixa_snapshot, 0),
    valor_taxa = COALESCE(valor_taxa, 0),
    valor_liquido = COALESCE(valor_liquido, valor)
WHERE taxa_percentual_snapshot IS NULL
   OR taxa_fixa_snapshot IS NULL
   OR valor_taxa IS NULL
   OR valor_liquido IS NULL;
