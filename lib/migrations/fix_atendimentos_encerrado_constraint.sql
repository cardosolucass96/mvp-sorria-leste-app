-- Corrige a constraint de status da tabela atendimentos em bases legadas
-- que ainda não aceitam o status 'encerrado'.

PRAGMA foreign_keys=OFF;

CREATE TABLE atendimentos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  avaliador_id INTEGER,
  liberado_por_id INTEGER,
  status TEXT NOT NULL DEFAULT 'triagem'
    CHECK (status IN ('triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado', 'encerrado')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  liberado_em TEXT,
  finalizado_at TEXT,
  agendamento_id INTEGER REFERENCES agendamentos(id),
  tipo TEXT NOT NULL DEFAULT 'normal'
    CHECK (tipo IN ('normal','sessao','orto')),
  motivo_saida TEXT,
  unidade_id INTEGER REFERENCES unidades(id),
  observacoes_encerramento TEXT,
  categoria_id INTEGER REFERENCES categorias(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (avaliador_id) REFERENCES usuarios(id),
  FOREIGN KEY (liberado_por_id) REFERENCES usuarios(id)
);

INSERT INTO atendimentos_new (
  id,
  cliente_id,
  avaliador_id,
  liberado_por_id,
  status,
  observacoes,
  created_at,
  liberado_em,
  finalizado_at,
  agendamento_id,
  tipo,
  motivo_saida,
  unidade_id,
  observacoes_encerramento,
  categoria_id
)
SELECT
  id,
  cliente_id,
  avaliador_id,
  liberado_por_id,
  status,
  observacoes,
  created_at,
  liberado_em,
  finalizado_at,
  agendamento_id,
  tipo,
  motivo_saida,
  unidade_id,
  observacoes_encerramento,
  categoria_id
FROM atendimentos;

DROP TABLE atendimentos;
ALTER TABLE atendimentos_new RENAME TO atendimentos;

CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente ON atendimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_status ON atendimentos(status);
CREATE INDEX IF NOT EXISTS idx_atendimentos_unidade ON atendimentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_categoria ON atendimentos(categoria_id);

PRAGMA foreign_keys=ON;
