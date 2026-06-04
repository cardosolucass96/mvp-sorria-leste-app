CREATE TABLE IF NOT EXISTS followup_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  unidade_id INTEGER NOT NULL,
  responsavel_usuario_id INTEGER NOT NULL,
  criado_por_id INTEGER NOT NULL,
  concluida_por_id INTEGER,
  excluida_por_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('orcamento', 'sem_posicao', 'retorno', 'cobranca', 'outro')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'concluida')),
  vencimento_em TEXT NOT NULL,
  nota_conclusao TEXT,
  concluida_em TEXT,
  excluida_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (responsavel_usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (concluida_por_id) REFERENCES usuarios(id),
  FOREIGN KEY (excluida_por_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_followup_unidade_status_vencimento
  ON followup_tarefas(unidade_id, status, vencimento_em);
CREATE INDEX IF NOT EXISTS idx_followup_cliente ON followup_tarefas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_followup_responsavel ON followup_tarefas(responsavel_usuario_id);
CREATE INDEX IF NOT EXISTS idx_followup_excluida_em ON followup_tarefas(excluida_em);
