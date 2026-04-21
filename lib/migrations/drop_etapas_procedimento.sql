-- Remove tabelas de face etapas (MVP não suporta face-por-dente)
DROP INDEX IF EXISTS idx_prontuarios_etapa;
DROP INDEX IF EXISTS idx_etapas_status;
DROP INDEX IF EXISTS idx_etapas_item;
DROP TABLE IF EXISTS prontuarios_etapa;
DROP TABLE IF EXISTS etapas_procedimento;
