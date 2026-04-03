-- Migration: campo de label de etapa para itens de atendimento
-- Preenchido por selecionar-hoje (etapa sendo feita hoje) e por chegou (etapa da sessão agendada)
-- Ex: "Etapa 1", "Etapa 1, Etapa 2"

ALTER TABLE itens_atendimento ADD COLUMN etapa_label TEXT;
