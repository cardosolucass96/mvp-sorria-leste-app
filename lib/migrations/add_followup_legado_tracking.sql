ALTER TABLE followup_tarefas ADD COLUMN legado_fonte TEXT;
ALTER TABLE followup_tarefas ADD COLUMN legado_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_legado_unique
  ON followup_tarefas(legado_fonte, legado_id)
  WHERE legado_fonte IS NOT NULL AND legado_id IS NOT NULL;
