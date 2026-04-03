-- Migration: etapas modelo de procedimento (sessões multi-etapa)
-- Adiciona suporte para procedimentos com etapas/sessões distintas

ALTER TABLE procedimentos ADD COLUMN tem_etapas INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS procedimento_etapas_modelo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedimento_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  valor REAL,                           -- null = proporcional ao valor total
  comissao_venda REAL NOT NULL DEFAULT 0,
  comissao_execucao REAL NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id)
);

CREATE INDEX IF NOT EXISTS idx_proc_etapas_modelo ON procedimento_etapas_modelo(procedimento_id);
