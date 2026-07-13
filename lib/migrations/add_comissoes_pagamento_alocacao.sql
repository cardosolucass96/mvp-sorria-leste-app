ALTER TABLE comissoes ADD COLUMN pagamento_alocacao_id INTEGER REFERENCES pagamentos_alocacoes(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comissoes_pagamento_alocacao_unq
  ON comissoes(pagamento_alocacao_id)
  WHERE pagamento_alocacao_id IS NOT NULL;
