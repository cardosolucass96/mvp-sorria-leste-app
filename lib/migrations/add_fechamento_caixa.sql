-- Fechamento oficial de caixa por unidade/data com auditoria de ajustes.

CREATE TABLE IF NOT EXISTS fechamentos_caixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade_id INTEGER NOT NULL,
  data_referencia TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'fechado')),
  base_json TEXT,
  draft_json TEXT,
  snapshot_json TEXT,
  editado_manual INTEGER NOT NULL DEFAULT 0,
  ajustes_count INTEGER NOT NULL DEFAULT 0,
  fechado_por_id INTEGER,
  fechado_em TEXT,
  updated_by_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (fechado_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (updated_by_id) REFERENCES usuarios(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamentos_caixa_unidade_data
  ON fechamentos_caixa(unidade_id, data_referencia);

CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_status
  ON fechamentos_caixa(status);

CREATE TABLE IF NOT EXISTS fechamento_caixa_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade_id INTEGER NOT NULL,
  data_referencia TEXT NOT NULL,
  tipo_evento TEXT NOT NULL
    CHECK (tipo_evento IN ('ajuste', 'fechado', 'reaberto')),
  entidade_tipo TEXT NOT NULL,
  entidade_chave TEXT NOT NULL,
  antes_json TEXT,
  depois_json TEXT,
  motivo TEXT,
  usuario_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_eventos_unidade_data
  ON fechamento_caixa_eventos(unidade_id, data_referencia);

CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_eventos_tipo
  ON fechamento_caixa_eventos(tipo_evento);
