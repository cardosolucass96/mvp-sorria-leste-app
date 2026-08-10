-- Controle das importações de dados legados para as entidades V2.
-- A tabela não armazena PII; somente janela, origem e totais reconciliados.

CREATE TABLE IF NOT EXISTS v2_importacoes_legado (
  id TEXT PRIMARY KEY,
  origem TEXT NOT NULL,
  inicio_em TEXT NOT NULL,
  fim_em TEXT NOT NULL,
  anonimizada INTEGER NOT NULL DEFAULT 1 CHECK (anonimizada IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('preparada', 'aplicada', 'reconciliada')),
  totais_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(totais_json)),
  bookmark_restauracao TEXT,
  aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reconciliada_em TEXT
);

INSERT OR IGNORE INTO schema_v2_versions (versao, descricao)
VALUES ('0002', 'Controle de importações legadas anonimizadas para a V2');
