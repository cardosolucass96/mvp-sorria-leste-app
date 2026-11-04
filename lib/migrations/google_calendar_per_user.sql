DROP TRIGGER IF EXISTS google_calendar_agendamento_insert;
DROP TRIGGER IF EXISTS google_calendar_agendamento_update;
DROP TRIGGER IF EXISTS google_calendar_agendamento_delete;
DROP TRIGGER IF EXISTS google_calendar_unidade_update;
DROP TRIGGER IF EXISTS google_calendar_switch_pending;
DROP TRIGGER IF EXISTS google_calendar_procedimento_update;
CREATE TABLE IF NOT EXISTS google_user_calendar_connections (
  id TEXT PRIMARY KEY,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id),
  connected_by INTEGER NOT NULL REFERENCES usuarios(id),
  google_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL DEFAULT 'Agenda principal',
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
CREATE TABLE IF NOT EXISTS google_user_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  owner_id INTEGER NOT NULL REFERENCES usuarios(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_user_calendar_channels (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES google_user_calendar_connections(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  resource_id TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_user_channels_connection ON google_user_calendar_channels(connection_id);
CREATE TABLE IF NOT EXISTS google_user_calendar_events (
  connection_id TEXT NOT NULL REFERENCES google_user_calendar_connections(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS google_user_calendar_links (
  connection_id TEXT NOT NULL REFERENCES google_user_calendar_connections(id) ON DELETE CASCADE,
  agendamento_id INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  etag TEXT,
  pending_write TEXT,
  remote_snapshot TEXT,
  local_snapshot TEXT,
  conflict TEXT,
  PRIMARY KEY(connection_id,agendamento_id),
  UNIQUE(agendamento_id),
  UNIQUE(connection_id,event_id)
);
CREATE TABLE IF NOT EXISTS google_user_calendar_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL REFERENCES google_user_calendar_connections(id) ON DELETE CASCADE,
  agendamento_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS google_user_outbox_pending ON google_user_calendar_outbox(connection_id,agendamento_id,id);
CREATE TABLE IF NOT EXISTS google_user_calendar_suppressions (
  agendamento_id INTEGER PRIMARY KEY
);
CREATE TRIGGER IF NOT EXISTS google_user_calendar_agendamento_insert AFTER INSERT ON agendamentos
WHEN NOT EXISTS(SELECT 1 FROM google_user_calendar_suppressions WHERE agendamento_id=NEW.id)
BEGIN
  INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
  SELECT id,NEW.id FROM google_user_calendar_connections WHERE usuario_id=NEW.executor_id AND status!='disconnecting';
END;
CREATE TRIGGER IF NOT EXISTS google_user_calendar_agendamento_update AFTER UPDATE OF data_agendada,status,executor_id,cliente_id,duracao_minutos,unidade_id,procedimento_id,observacoes ON agendamentos
WHEN (NEW.data_agendada IS NOT OLD.data_agendada OR NEW.status IS NOT OLD.status
  OR NEW.executor_id IS NOT OLD.executor_id OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.duracao_minutos IS NOT OLD.duracao_minutos OR NEW.unidade_id IS NOT OLD.unidade_id
  OR NEW.procedimento_id IS NOT OLD.procedimento_id OR NEW.observacoes IS NOT OLD.observacoes)
  AND NOT EXISTS(SELECT 1 FROM google_user_calendar_suppressions WHERE agendamento_id=NEW.id)
BEGIN
  INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
  SELECT id,NEW.id FROM google_user_calendar_connections WHERE (usuario_id IN (OLD.executor_id,NEW.executor_id) OR id IN (SELECT connection_id FROM google_user_calendar_links WHERE agendamento_id=NEW.id)) AND status!='disconnecting';
END;
CREATE TRIGGER IF NOT EXISTS google_user_calendar_agendamento_delete AFTER DELETE ON agendamentos
BEGIN
  INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
  SELECT id,OLD.id FROM google_user_calendar_connections WHERE (usuario_id=OLD.executor_id OR id IN (SELECT connection_id FROM google_user_calendar_links WHERE agendamento_id=OLD.id)) AND status!='disconnecting';
END;

CREATE TABLE IF NOT EXISTS google_user_calendar_archives (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  google_subject TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL DEFAULT 'Agenda principal',
  default_duration INTEGER NOT NULL,
  links TEXT NOT NULL,
  PRIMARY KEY(usuario_id,google_subject)
);

CREATE TRIGGER IF NOT EXISTS google_user_calendar_unidade_update AFTER UPDATE OF nome ON unidades
WHEN NEW.nome IS NOT OLD.nome
BEGIN
  INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
  SELECT l.connection_id,l.agendamento_id FROM google_user_calendar_links l
  JOIN google_user_calendar_connections c ON c.id=l.connection_id
  JOIN agendamentos a ON a.id=l.agendamento_id WHERE a.unidade_id=NEW.id AND c.status!='disconnecting';
END;

CREATE TABLE IF NOT EXISTS google_user_calendar_saved_calendars (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  google_subject TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  links TEXT NOT NULL,
  PRIMARY KEY(usuario_id,google_subject,calendar_id)
);
CREATE TRIGGER IF NOT EXISTS google_user_calendar_switch_pending BEFORE UPDATE OF calendar_id ON google_user_calendar_connections
WHEN NEW.calendar_id!=OLD.calendar_id AND EXISTS(SELECT 1 FROM google_user_calendar_outbox WHERE connection_id=OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'calendar_sync_pending');
END;

CREATE TRIGGER IF NOT EXISTS google_user_calendar_procedimento_update AFTER UPDATE OF nome ON procedimentos
WHEN NEW.nome IS NOT OLD.nome
BEGIN
  INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
  SELECT l.connection_id,l.agendamento_id FROM google_user_calendar_links l
  JOIN google_user_calendar_connections c ON c.id=l.connection_id
  JOIN agendamentos a ON a.id=l.agendamento_id AND a.executor_id=c.usuario_id
  WHERE a.procedimento_id=NEW.id AND c.status!='disconnecting';
END;

INSERT INTO google_user_calendar_connections(usuario_id,id,unidade_id,connected_by,google_subject,email,calendar_id,calendar_name,refresh_token,status,default_duration,sync_token,sync_page_token,sync_requested,last_sync_at,last_error,lease_owner,lease_until,created_at) SELECT connected_by,id,unidade_id,connected_by,google_subject,email,calendar_id,calendar_name,refresh_token,status,default_duration,sync_token,sync_page_token,sync_requested,last_sync_at,last_error,lease_owner,lease_until,created_at FROM google_calendar_connections;
INSERT INTO google_user_calendar_channels(id,connection_id,token_hash,resource_id,expires_at) SELECT id,connection_id,token_hash,resource_id,expires_at FROM google_calendar_channels;
INSERT INTO google_user_calendar_events(connection_id,event_id,summary,start_at,end_at,all_day,recurring,status,etag,payload) SELECT connection_id,event_id,summary,start_at,end_at,all_day,recurring,status,etag,payload FROM google_calendar_events;
INSERT INTO google_user_calendar_links(connection_id,agendamento_id,event_id,etag,pending_write,remote_snapshot,local_snapshot,conflict) SELECT connection_id,agendamento_id,event_id,etag,pending_write,remote_snapshot,local_snapshot,conflict FROM google_calendar_links;
INSERT INTO google_user_calendar_outbox(id,connection_id,agendamento_id,created_at) SELECT id,connection_id,agendamento_id,created_at FROM google_calendar_outbox;
DELETE FROM google_calendar_oauth_states;
INSERT INTO google_user_calendar_archives(usuario_id,google_subject,connection_id,calendar_id,calendar_name,default_duration,links)
SELECT c.connected_by,a.google_subject,a.connection_id,a.calendar_id,a.calendar_name,a.default_duration,a.links
FROM google_calendar_archives a JOIN google_calendar_connections c ON c.id=a.connection_id;
INSERT INTO google_user_calendar_saved_calendars(usuario_id,google_subject,calendar_id,links)
SELECT c.connected_by,s.google_subject,s.calendar_id,s.links FROM google_calendar_saved_calendars s
JOIN google_calendar_connections c ON c.unidade_id=s.unidade_id AND c.google_subject=s.google_subject;
INSERT INTO google_user_calendar_outbox(connection_id,agendamento_id)
SELECT connection_id,agendamento_id FROM google_user_calendar_links;
UPDATE google_user_calendar_connections SET lease_owner=NULL,lease_until=0,sync_requested=1;
DELETE FROM google_calendar_connections;
