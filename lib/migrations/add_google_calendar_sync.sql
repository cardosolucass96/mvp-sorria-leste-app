ALTER TABLE agendamentos ADD COLUMN duracao_minutos INTEGER CHECK(duracao_minutos BETWEEN 5 AND 480);
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id TEXT PRIMARY KEY,
  unidade_id INTEGER NOT NULL UNIQUE REFERENCES unidades(id),
  connected_by INTEGER NOT NULL REFERENCES usuarios(id),
  google_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected','error','reconnect','disconnecting')),
  default_duration INTEGER NOT NULL DEFAULT 30 CHECK(default_duration BETWEEN 5 AND 480),
  sync_token TEXT,
  sync_page_token TEXT,
  sync_requested INTEGER NOT NULL DEFAULT 1,
  last_sync_at TEXT,
  last_error TEXT,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(google_subject,calendar_id)
);
CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_calendar_channels (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  resource_id TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_channels_connection ON google_calendar_channels(connection_id);
CREATE TABLE IF NOT EXISTS google_calendar_events (
  connection_id TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  recurring INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  etag TEXT,
  payload TEXT NOT NULL,
  PRIMARY KEY(connection_id,event_id)
);
CREATE TABLE IF NOT EXISTS google_calendar_links (
  connection_id TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
  agendamento_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  etag TEXT,
  remote_snapshot TEXT,
  local_snapshot TEXT,
  conflict TEXT,
  PRIMARY KEY(connection_id,agendamento_id),
  UNIQUE(connection_id,event_id)
);
CREATE TABLE IF NOT EXISTS google_calendar_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
  agendamento_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS google_outbox_pending ON google_calendar_outbox(connection_id,agendamento_id,id);
CREATE TABLE IF NOT EXISTS google_calendar_suppressions (
  agendamento_id INTEGER PRIMARY KEY
);
CREATE TRIGGER IF NOT EXISTS google_calendar_agendamento_insert AFTER INSERT ON agendamentos
WHEN NOT EXISTS(SELECT 1 FROM google_calendar_suppressions WHERE agendamento_id=NEW.id)
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT id,NEW.id FROM google_calendar_connections WHERE unidade_id=NEW.unidade_id AND status!='disconnecting';
END;
CREATE TRIGGER IF NOT EXISTS google_calendar_agendamento_update AFTER UPDATE OF data_agendada,status,executor_id,cliente_id,duracao_minutos,unidade_id ON agendamentos
WHEN (NEW.data_agendada IS NOT OLD.data_agendada OR NEW.status IS NOT OLD.status
  OR NEW.executor_id IS NOT OLD.executor_id OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.duracao_minutos IS NOT OLD.duracao_minutos OR NEW.unidade_id IS NOT OLD.unidade_id)
  AND NOT EXISTS(SELECT 1 FROM google_calendar_suppressions WHERE agendamento_id=NEW.id)
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT id,NEW.id FROM google_calendar_connections WHERE unidade_id IN (OLD.unidade_id,NEW.unidade_id) AND status!='disconnecting';
END;
CREATE TRIGGER IF NOT EXISTS google_calendar_agendamento_delete AFTER DELETE ON agendamentos
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT id,OLD.id FROM google_calendar_connections WHERE unidade_id=OLD.unidade_id AND status!='disconnecting';
END;
