-- Adiciona comissão de acréscimo no catálogo e origem nas comissões.
-- Migração pensada para bases legadas já existentes.

ALTER TABLE procedimentos ADD COLUMN comissao_acrescimo REAL NOT NULL DEFAULT 10;
ALTER TABLE procedimento_etapas_modelo ADD COLUMN comissao_acrescimo REAL NOT NULL DEFAULT 10;
ALTER TABLE comissoes ADD COLUMN origem TEXT NOT NULL DEFAULT 'avaliacao';

UPDATE procedimentos
SET comissao_venda = 4,
    comissao_acrescimo = 10;

UPDATE procedimento_etapas_modelo
SET comissao_venda = 4,
    comissao_acrescimo = 10;

UPDATE comissoes
SET origem = CASE
  WHEN tipo = 'execucao' THEN 'execucao'
  ELSE 'avaliacao'
END
WHERE origem IS NULL OR origem = '' OR origem = 'avaliacao';
