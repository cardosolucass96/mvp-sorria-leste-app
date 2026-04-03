-- Migração: adiciona status 'encerrado' à tabela atendimentos
-- SQLite não permite ALTER TABLE para modificar CHECK constraints,
-- então é necessário recriar a tabela.

PRAGMA foreign_keys=OFF;

-- 1. Criar tabela temporária com a nova constraint
CREATE TABLE IF NOT EXISTS atendimentos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  avaliador_id INTEGER,
  liberado_por_id INTEGER,
  status TEXT NOT NULL DEFAULT 'triagem'
    CHECK (status IN ('triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao', 'finalizado', 'encerrado')),
  agendamento_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'normal'
    CHECK (tipo IN ('normal','sessao','orto')),
  observacoes TEXT,
  motivo_saida TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  liberado_em TEXT,
  finalizado_at TEXT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (avaliador_id) REFERENCES usuarios(id),
  FOREIGN KEY (liberado_por_id) REFERENCES usuarios(id)
);

-- 2. Copiar dados
INSERT OR IGNORE INTO atendimentos_new
  SELECT id, cliente_id, avaliador_id, liberado_por_id, status, agendamento_id, tipo, observacoes, motivo_saida, created_at, liberado_em, finalizado_at
  FROM atendimentos;

-- 3. Remover tabela antiga e renomear
DROP TABLE IF EXISTS atendimentos;
ALTER TABLE atendimentos_new RENAME TO atendimentos;

PRAGMA foreign_keys=ON;
