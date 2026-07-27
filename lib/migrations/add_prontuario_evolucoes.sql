-- Evoluções clínicas flexíveis.
-- Mantém `prontuarios` legado intacto e cria um modelo onde uma evolução
-- pode documentar vários itens do mesmo atendimento.

CREATE TABLE IF NOT EXISTS prontuario_evolucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  atendimento_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  observacoes TEXT,
  legacy_prontuario_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (legacy_prontuario_id) REFERENCES prontuarios(id)
);

CREATE TABLE IF NOT EXISTS prontuario_evolucao_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evolucao_id INTEGER NOT NULL,
  item_atendimento_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (evolucao_id) REFERENCES prontuario_evolucoes(id) ON DELETE CASCADE,
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id)
);

CREATE INDEX IF NOT EXISTS idx_prontuario_evolucoes_atendimento
  ON prontuario_evolucoes(atendimento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prontuario_evolucao_itens_evolucao
  ON prontuario_evolucao_itens(evolucao_id);

INSERT OR IGNORE INTO prontuario_evolucoes (
  uuid,
  atendimento_id,
  usuario_id,
  descricao,
  observacoes,
  legacy_prontuario_id,
  created_at,
  updated_at
)
SELECT
  'legacy-prontuario-' || pr.id,
  i.atendimento_id,
  pr.usuario_id,
  pr.descricao,
  pr.observacoes,
  pr.id,
  pr.created_at,
  pr.updated_at
FROM prontuarios pr
INNER JOIN itens_atendimento i ON i.id = pr.item_atendimento_id;

INSERT OR IGNORE INTO prontuario_evolucao_itens (
  evolucao_id,
  item_atendimento_id,
  created_at
)
SELECT
  pe.id,
  pr.item_atendimento_id,
  pr.created_at
FROM prontuarios pr
INNER JOIN prontuario_evolucoes pe ON pe.legacy_prontuario_id = pr.id;
