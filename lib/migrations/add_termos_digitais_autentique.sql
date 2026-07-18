CREATE TABLE IF NOT EXISTS termos_digitais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  termo_id INTEGER REFERENCES termos(id) ON DELETE SET NULL,
  termo_slug TEXT NOT NULL,
  termo_titulo TEXT NOT NULL,
  signatario_nome TEXT NOT NULL,
  signatario_cpf TEXT,
  signatario_email TEXT,
  signatario_telefone TEXT,
  placeholders_json TEXT NOT NULL,
  html_renderizado TEXT NOT NULL,
  autentique_document_id TEXT NOT NULL UNIQUE,
  autentique_signature_public_id TEXT NOT NULL UNIQUE,
  autentique_short_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'criado' CHECK (status IN ('criado', 'visualizado', 'assinado', 'recusado', 'concluido')),
  pdf_assinado_url TEXT,
  viewed_at TEXT,
  signed_at TEXT,
  rejected_at TEXT,
  finished_at TEXT,
  created_by INTEGER REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_termos_digitais_cliente ON termos_digitais (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_termos_digitais_status ON termos_digitais (status);
CREATE INDEX IF NOT EXISTS idx_termos_digitais_documento ON termos_digitais (autentique_document_id);
CREATE INDEX IF NOT EXISTS idx_termos_digitais_signature ON termos_digitais (autentique_signature_public_id);

CREATE TABLE IF NOT EXISTS autentique_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  object_id TEXT,
  termo_digital_id INTEGER REFERENCES termos_digitais(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_autentique_webhook_events_type ON autentique_webhook_events (event_type, received_at DESC);
