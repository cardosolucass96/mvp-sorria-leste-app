-- Migração: adiciona group_id em itens_atendimento
ALTER TABLE itens_atendimento ADD COLUMN group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_itens_group_id ON itens_atendimento(group_id);
