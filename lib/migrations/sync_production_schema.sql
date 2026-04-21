-- =====================================================
-- MIGRAÇÃO: Sincronizar schema de produção
-- Adiciona colunas faltantes e corrige constraints
-- =====================================================

-- 1. clientes: adicionar sexo e plano_odontologico
ALTER TABLE clientes ADD COLUMN sexo TEXT CHECK (sexo IN ('masculino', 'feminino', 'outro'));
ALTER TABLE clientes ADD COLUMN plano_odontologico TEXT CHECK (plano_odontologico IN ('Clin', 'Prime', 'OdontoArt'));

-- 2. atendimentos: adicionar observacoes_encerramento
ALTER TABLE atendimentos ADD COLUMN observacoes_encerramento TEXT;

-- 3. itens_atendimento: adicionar dente_unico, etapa_modelo_id, etapa_label
ALTER TABLE itens_atendimento ADD COLUMN dente_unico TEXT;
ALTER TABLE itens_atendimento ADD COLUMN etapa_modelo_id INTEGER REFERENCES procedimento_etapas_modelo(id);
ALTER TABLE itens_atendimento ADD COLUMN etapa_label TEXT;
CREATE INDEX IF NOT EXISTS idx_itens_etapa_modelo ON itens_atendimento(etapa_modelo_id);

-- 4. movimentacoes_saldo: adicionar saldo_anterior e saldo_novo
ALTER TABLE movimentacoes_saldo ADD COLUMN saldo_anterior REAL NOT NULL DEFAULT 0;
ALTER TABLE movimentacoes_saldo ADD COLUMN saldo_novo REAL NOT NULL DEFAULT 0;

-- 5. agendamentos: recriar tabela para corrigir constraints (NOT NULL → nullable)
--    e adicionar colunas faltantes (tipo, etapa_modelo_id)
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS agendamentos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  atendimento_origem_id INTEGER,
  item_atendimento_origem_id INTEGER,
  atendimento_sessao_id INTEGER,
  procedimento_id INTEGER,
  executor_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'procedimento'
    CHECK (tipo IN ('avaliacao','procedimento')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','agendado','realizado','faltou','cancelado')),
  data_agendada TEXT,
  observacoes TEXT,
  motivo_cancelamento TEXT,
  reagendado_de_id INTEGER,
  etapa_modelo_id INTEGER,
  pago INTEGER NOT NULL DEFAULT 0,
  unidade_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (atendimento_origem_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_origem_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (atendimento_sessao_id) REFERENCES atendimentos(id),
  FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id),
  FOREIGN KEY (reagendado_de_id) REFERENCES agendamentos(id),
  FOREIGN KEY (etapa_modelo_id) REFERENCES procedimento_etapas_modelo(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

-- Copiar dados existentes (colunas que existem na tabela antiga)
INSERT OR IGNORE INTO agendamentos_new (
  id, cliente_id, atendimento_origem_id, item_atendimento_origem_id,
  atendimento_sessao_id, procedimento_id, executor_id,
  tipo, status, data_agendada, observacoes, motivo_cancelamento,
  reagendado_de_id, pago, unidade_id, created_at, updated_at
)
SELECT
  id, cliente_id, atendimento_origem_id, item_atendimento_origem_id,
  atendimento_sessao_id, procedimento_id, executor_id,
  'procedimento', status, data_agendada, observacoes, motivo_cancelamento,
  reagendado_de_id, pago, unidade_id, created_at, updated_at
FROM agendamentos;

DROP TABLE agendamentos;
ALTER TABLE agendamentos_new RENAME TO agendamentos;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_atendimento ON agendamentos(atendimento_origem_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data_agendada);
CREATE INDEX IF NOT EXISTS idx_agendamentos_unidade ON agendamentos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_etapa_modelo ON agendamentos(etapa_modelo_id);

PRAGMA foreign_keys=ON;

-- 6. pagamentos: remover coluna legado 'parcelas'
ALTER TABLE pagamentos DROP COLUMN parcelas;
