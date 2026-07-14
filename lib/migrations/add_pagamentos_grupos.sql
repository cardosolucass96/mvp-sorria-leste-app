-- =====================================================
-- MIGRAÇÃO: Grupos de cobrança para múltiplas formas
-- =====================================================

CREATE TABLE IF NOT EXISTS pagamentos_grupos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  recebido_por_id INTEGER NOT NULL,
  valor_total REAL NOT NULL,
  observacoes TEXT,
  cancelado INTEGER NOT NULL DEFAULT 0,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
);

ALTER TABLE pagamentos ADD COLUMN pagamento_grupo_id INTEGER REFERENCES pagamentos_grupos(id);

CREATE INDEX IF NOT EXISTS idx_pagamentos_grupos_atendimento ON pagamentos_grupos(atendimento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pagamento_grupo ON pagamentos(pagamento_grupo_id);
