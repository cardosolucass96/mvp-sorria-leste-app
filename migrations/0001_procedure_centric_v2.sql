-- Sorria Leste V2: procedimento do paciente como entidade operacional central.
-- Migração exclusivamente aditiva. Aplicar somente no ambiente staging durante a homologação.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_v2_versions (
  versao TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  aplicada_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cliente_unidades_v2 (
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  vinculado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cliente_id, unidade_id)
);

CREATE TABLE IF NOT EXISTS agenda_compromissos (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  finalidade_avaliacao INTEGER NOT NULL DEFAULT 0 CHECK (finalidade_avaliacao IN (0, 1)),
  avaliador_id INTEGER REFERENCES usuarios(id),
  data_agendada TEXT NOT NULL CHECK (length(trim(data_agendada)) > 0),
  duracao_minutos INTEGER NOT NULL DEFAULT 60 CHECK (duracao_minutos > 0),
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'realizado', 'faltou', 'cancelado')),
  observacoes TEXT,
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  cancelado_por_id INTEGER REFERENCES usuarios(id),
  cancelado_em TEXT,
  motivo_cancelamento TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS atendimentos_clinicos (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  agenda_compromisso_id TEXT UNIQUE REFERENCES agenda_compromissos(id),
  categoria_id INTEGER REFERENCES categorias(id),
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'em_andamento', 'finalizado', 'cancelado')),
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  checkin_em TEXT,
  iniciado_em TEXT,
  finalizado_em TEXT,
  cancelado_em TEXT,
  cancelado_por_id INTEGER REFERENCES usuarios(id),
  motivo_cancelamento TEXT,
  observacoes TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id TEXT PRIMARY KEY,
  atendimento_clinico_id TEXT NOT NULL UNIQUE REFERENCES atendimentos_clinicos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  avaliador_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'concluida', 'cancelada')),
  motivo_sem_orcamento TEXT,
  observacoes TEXT,
  concluida_em TEXT,
  cancelada_em TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'concluida' OR concluida_em IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id TEXT PRIMARY KEY,
  avaliacao_id TEXT NOT NULL UNIQUE REFERENCES avaliacoes(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  avaliador_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'apresentado', 'parcialmente_aceito', 'aceito', 'recusado', 'cancelado')),
  observacoes TEXT,
  validade_em TEXT,
  apresentado_em TEXT,
  cancelado_em TEXT,
  cancelado_por_id INTEGER REFERENCES usuarios(id),
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS procedimentos_cliente (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  orcamento_id TEXT REFERENCES orcamentos(id),
  avaliacao_id TEXT REFERENCES avaliacoes(id),
  procedimento_catalogo_id INTEGER NOT NULL REFERENCES procedimentos(id),
  atendimento_origem_id TEXT REFERENCES atendimentos_clinicos(id),
  origem TEXT NOT NULL DEFAULT 'avaliacao'
    CHECK (origem IN ('avaliacao', 'acrescimo_execucao', 'importado')),
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  avaliador_id INTEGER REFERENCES usuarios(id),
  executor_preferencial_id INTEGER REFERENCES usuarios(id),
  nome_snapshot TEXT NOT NULL,
  descricao_snapshot TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_tabela_centavos INTEGER NOT NULL CHECK (valor_tabela_centavos >= 0),
  desconto_centavos INTEGER NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
  valor_final_centavos INTEGER NOT NULL CHECK (valor_final_centavos >= 0),
  desconto_motivo TEXT,
  comissao_avaliacao_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_avaliacao_bps >= 0),
  comissao_acrescimo_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_acrescimo_bps >= 0),
  comissao_execucao_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_execucao_bps >= 0),
  status_comercial TEXT NOT NULL DEFAULT 'proposto'
    CHECK (status_comercial IN ('proposto', 'aceito', 'recusado', 'cancelado')),
  status_clinico TEXT NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status_clinico IN ('nao_iniciado', 'em_execucao', 'concluido', 'cancelado')),
  aceite_tipo TEXT CHECK (aceite_tipo IN ('orcamento', 'verbal_execucao', 'administrativo')),
  aceite_observacao TEXT,
  aceito_por_id INTEGER REFERENCES usuarios(id),
  aceito_em TEXT,
  recusado_por_id INTEGER REFERENCES usuarios(id),
  recusado_em TEXT,
  motivo_recusa TEXT,
  cancelado_por_id INTEGER REFERENCES usuarios(id),
  cancelado_em TEXT,
  motivo_cancelamento TEXT,
  concluido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (valor_final_centavos = valor_tabela_centavos - desconto_centavos),
  CHECK (desconto_centavos <= valor_tabela_centavos),
  CHECK (origem <> 'avaliacao' OR (orcamento_id IS NOT NULL AND avaliacao_id IS NOT NULL)),
  CHECK (origem <> 'acrescimo_execucao' OR atendimento_origem_id IS NOT NULL),
  CHECK (aceite_tipo <> 'verbal_execucao' OR length(trim(COALESCE(aceite_observacao, ''))) > 0)
);

CREATE TABLE IF NOT EXISTS procedimento_cliente_dentes (
  id TEXT PRIMARY KEY,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id) ON DELETE CASCADE,
  dente TEXT NOT NULL,
  faces_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faces_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (procedimento_cliente_id, dente)
);

CREATE TABLE IF NOT EXISTS procedimento_cliente_etapas (
  id TEXT PRIMARY KEY,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id) ON DELETE CASCADE,
  etapa_modelo_id INTEGER REFERENCES procedimento_etapas_modelo(id),
  nome_snapshot TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  comissao_avaliacao_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_avaliacao_bps >= 0),
  comissao_acrescimo_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_acrescimo_bps >= 0),
  comissao_execucao_bps INTEGER NOT NULL DEFAULT 0 CHECK (comissao_execucao_bps >= 0),
  executor_id INTEGER REFERENCES usuarios(id),
  status_clinico TEXT NOT NULL DEFAULT 'nao_iniciada'
    CHECK (status_clinico IN ('nao_iniciada', 'em_execucao', 'concluida', 'cancelada')),
  iniciado_em TEXT,
  concluido_em TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (procedimento_cliente_id, ordem)
);

CREATE TABLE IF NOT EXISTS agenda_compromisso_itens (
  id TEXT PRIMARY KEY,
  agenda_compromisso_id TEXT NOT NULL REFERENCES agenda_compromissos(id) ON DELETE CASCADE,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  procedimento_cliente_etapa_id TEXT REFERENCES procedimento_cliente_etapas(id),
  profissional_id INTEGER REFERENCES usuarios(id),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_item_procedimento_etapa
  ON agenda_compromisso_itens (
    agenda_compromisso_id,
    procedimento_cliente_id,
    IFNULL(procedimento_cliente_etapa_id, '')
  );

CREATE TABLE IF NOT EXISTS atendimento_procedimentos (
  id TEXT PRIMARY KEY,
  atendimento_clinico_id TEXT NOT NULL REFERENCES atendimentos_clinicos(id) ON DELETE CASCADE,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  procedimento_cliente_etapa_id TEXT REFERENCES procedimento_cliente_etapas(id),
  executor_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado', 'em_execucao', 'realizado', 'cancelado')),
  iniciado_em TEXT,
  concluido_em TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_atendimento_procedimento_etapa
  ON atendimento_procedimentos (
    atendimento_clinico_id,
    procedimento_cliente_id,
    IFNULL(procedimento_cliente_etapa_id, '')
  );

CREATE TABLE IF NOT EXISTS evolucoes_clinicas (
  id TEXT PRIMARY KEY,
  atendimento_clinico_id TEXT NOT NULL REFERENCES atendimentos_clinicos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  profissional_id INTEGER NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL CHECK (length(trim(texto)) > 0),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS evolucao_procedimentos (
  id TEXT PRIMARY KEY,
  evolucao_id TEXT NOT NULL REFERENCES evolucoes_clinicas(id) ON DELETE CASCADE,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  procedimento_cliente_etapa_id TEXT REFERENCES procedimento_cliente_etapas(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_evolucao_procedimento_etapa
  ON evolucao_procedimentos (
    evolucao_id,
    procedimento_cliente_id,
    IFNULL(procedimento_cliente_etapa_id, '')
  );

CREATE TABLE IF NOT EXISTS liberacoes_execucao (
  id TEXT PRIMARY KEY,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  atendimento_clinico_id TEXT NOT NULL REFERENCES atendimentos_clinicos(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  liberado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
  revogada_em TEXT,
  revogada_por_id INTEGER REFERENCES usuarios(id),
  motivo_revogacao TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  atendimento_clinico_id TEXT REFERENCES atendimentos_clinicos(id),
  recebido_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  canal TEXT NOT NULL CHECK (canal IN ('presencial', 'remoto', 'link', 'importado')),
  status TEXT NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado', 'parcialmente_estornado', 'estornado')),
  valor_total_centavos INTEGER NOT NULL CHECK (valor_total_centavos > 0),
  observacoes TEXT,
  idempotency_key TEXT NOT NULL,
  estornado_em TEXT,
  estornado_por_id INTEGER REFERENCES usuarios(id),
  motivo_estorno TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS recebimento_formas (
  id TEXT PRIMARY KEY,
  recebimento_id TEXT NOT NULL REFERENCES recebimentos(id) ON DELETE CASCADE,
  forma_pagamento_id INTEGER NOT NULL REFERENCES formas_pagamento(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  taxa_bps INTEGER NOT NULL DEFAULT 0 CHECK (taxa_bps >= 0),
  taxa_fixa_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxa_fixa_centavos >= 0),
  parcelas INTEGER NOT NULL DEFAULT 1 CHECK (parcelas > 0),
  referencia_externa TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS recebimento_alocacoes (
  id TEXT PRIMARY KEY,
  recebimento_id TEXT NOT NULL REFERENCES recebimentos(id) ON DELETE CASCADE,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  procedimento_cliente_etapa_id TEXT REFERENCES procedimento_cliente_etapas(id),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  valor_estornado_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_estornado_centavos >= 0),
  estornado_em TEXT,
  estornado_por_id INTEGER REFERENCES usuarios(id),
  motivo_estorno TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (valor_estornado_centavos <= valor_centavos)
);

CREATE TABLE IF NOT EXISTS cliente_saldo_movimentos (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  recebimento_id TEXT REFERENCES recebimentos(id),
  procedimento_cliente_id TEXT REFERENCES procedimentos_cliente(id),
  movimento_origem_id TEXT REFERENCES cliente_saldo_movimentos(id),
  tipo TEXT NOT NULL
    CHECK (tipo IN ('credito', 'alocacao', 'estorno_credito', 'estorno_alocacao', 'ajuste_credito', 'ajuste_debito')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos <> 0),
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS comissoes_v2 (
  id TEXT PRIMARY KEY,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  recebimento_alocacao_id TEXT REFERENCES recebimento_alocacoes(id),
  atendimento_procedimento_id TEXT REFERENCES atendimento_procedimentos(id),
  comissao_origem_id TEXT REFERENCES comissoes_v2(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('avaliacao', 'acrescimo', 'execucao')),
  evento TEXT NOT NULL CHECK (evento IN ('credito', 'reversao', 'ajuste')),
  base_centavos INTEGER NOT NULL CHECK (base_centavos >= 0),
  taxa_bps INTEGER NOT NULL CHECK (taxa_bps >= 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos <> 0),
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS procedimento_cliente_followups (
  id TEXT PRIMARY KEY,
  procedimento_cliente_id TEXT NOT NULL REFERENCES procedimentos_cliente(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('decisao', 'cobranca', 'agendamento')),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'concluido', 'cancelado')),
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  vencimento_em TEXT,
  descricao TEXT,
  concluido_em TEXT,
  concluido_por_id INTEGER REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS eventos_dominio (
  id TEXT PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  cliente_id INTEGER REFERENCES clientes(id),
  entidade_tipo TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  evento_tipo TEXT NOT NULL,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  dados_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(dados_json)),
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (unidade_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agenda_v2_unidade_data ON agenda_compromissos(unidade_id, data_agendada);
CREATE INDEX IF NOT EXISTS idx_cliente_unidades_v2_unidade ON cliente_unidades_v2(unidade_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_agenda_v2_cliente ON agenda_compromissos(cliente_id, data_agendada);
CREATE INDEX IF NOT EXISTS idx_atendimentos_clinicos_unidade_status ON atendimentos_clinicos(unidade_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_atendimentos_clinicos_cliente ON atendimentos_clinicos(cliente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_unidade_status ON avaliacoes(unidade_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_orcamentos_unidade_status ON orcamentos(unidade_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_procedimentos_cliente_fila ON procedimentos_cliente(unidade_id, status_comercial, status_clinico, created_at);
CREATE INDEX IF NOT EXISTS idx_procedimentos_cliente_cliente ON procedimentos_cliente(cliente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agenda_itens_procedimento ON agenda_compromisso_itens(procedimento_cliente_id);
CREATE INDEX IF NOT EXISTS idx_atendimento_procedimentos_proc ON atendimento_procedimentos(procedimento_cliente_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_unidade_data ON recebimentos(unidade_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recebimentos_cliente ON recebimentos(cliente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recebimento_alocacoes_proc ON recebimento_alocacoes(procedimento_cliente_id);
CREATE INDEX IF NOT EXISTS idx_saldo_movimentos_cliente ON cliente_saldo_movimentos(cliente_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comissoes_v2_usuario ON comissoes_v2(usuario_id, created_at);
CREATE INDEX IF NOT EXISTS idx_followups_v2_fila ON procedimento_cliente_followups(unidade_id, status, tipo, vencimento_em);
CREATE INDEX IF NOT EXISTS idx_eventos_dominio_entidade ON eventos_dominio(entidade_tipo, entidade_id, created_at);

-- Bloqueia a alteração comercial de itens que já foram aceitos ou receberam alocação.
CREATE TRIGGER IF NOT EXISTS trg_procedimento_cliente_bloquear_campos_comerciais
BEFORE UPDATE OF procedimento_catalogo_id, nome_snapshot, descricao_snapshot, quantidade,
  valor_tabela_centavos, desconto_centavos, valor_final_centavos,
  comissao_avaliacao_bps, comissao_acrescimo_bps, comissao_execucao_bps
ON procedimentos_cliente
WHEN OLD.status_comercial <> 'proposto'
  OR EXISTS (
    SELECT 1
    FROM recebimento_alocacoes ra
    WHERE ra.procedimento_cliente_id = OLD.id
      AND ra.valor_centavos > ra.valor_estornado_centavos
  )
BEGIN
  SELECT RAISE(ABORT, 'procedimento_aceito_ou_pago_bloqueado');
END;

CREATE VIEW IF NOT EXISTS v_procedimentos_cliente_operacional AS
SELECT
  pc.*,
  c.nome AS cliente_nome,
  p.nome AS procedimento_catalogo_nome,
  COALESCE((
    SELECT SUM(ra.valor_centavos - ra.valor_estornado_centavos)
    FROM recebimento_alocacoes ra
    JOIN recebimentos r ON r.id = ra.recebimento_id
    WHERE ra.procedimento_cliente_id = pc.id
      AND r.status <> 'estornado'
  ), 0) AS valor_recebido_centavos,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM recebimento_alocacoes hx
      WHERE hx.procedimento_cliente_id = pc.id
    ) AND COALESCE((
      SELECT SUM(ra.valor_centavos - ra.valor_estornado_centavos)
      FROM recebimento_alocacoes ra
      JOIN recebimentos r ON r.id = ra.recebimento_id
      WHERE ra.procedimento_cliente_id = pc.id AND r.status <> 'estornado'
    ), 0) = 0 THEN 'estornado'
    WHEN COALESCE((
      SELECT SUM(ra.valor_centavos - ra.valor_estornado_centavos)
      FROM recebimento_alocacoes ra
      JOIN recebimentos r ON r.id = ra.recebimento_id
      WHERE ra.procedimento_cliente_id = pc.id AND r.status <> 'estornado'
    ), 0) = 0 THEN 'nao_pago'
    WHEN COALESCE((
      SELECT SUM(ra.valor_centavos - ra.valor_estornado_centavos)
      FROM recebimento_alocacoes ra
      JOIN recebimentos r ON r.id = ra.recebimento_id
      WHERE ra.procedimento_cliente_id = pc.id AND r.status <> 'estornado'
    ), 0) < pc.valor_final_centavos THEN 'parcial'
    ELSE 'quitado'
  END AS status_financeiro,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM agenda_compromisso_itens aci
      JOIN agenda_compromissos ac ON ac.id = aci.agenda_compromisso_id
      WHERE aci.procedimento_cliente_id = pc.id
        AND ac.status = 'agendado'
    ) THEN 'agendado'
    ELSE 'sem_agendamento'
  END AS status_agenda
FROM procedimentos_cliente pc
JOIN clientes c ON c.id = pc.cliente_id
JOIN procedimentos p ON p.id = pc.procedimento_catalogo_id;

INSERT OR IGNORE INTO schema_v2_versions (versao, descricao)
VALUES ('0001', 'Procedimento do paciente como entidade operacional central');
