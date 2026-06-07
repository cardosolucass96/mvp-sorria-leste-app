ALTER TABLE agendamentos ADD COLUMN legado_fonte TEXT;
ALTER TABLE agendamentos ADD COLUMN legado_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_legado_unique
  ON agendamentos(legado_fonte, legado_id)
  WHERE legado_fonte IS NOT NULL AND legado_id IS NOT NULL;
