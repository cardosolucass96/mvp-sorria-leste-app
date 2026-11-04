ALTER TABLE google_calendar_archives ADD COLUMN calendar_name TEXT NOT NULL DEFAULT 'Agenda principal';
ALTER TABLE google_calendar_connections ADD COLUMN calendar_name TEXT NOT NULL DEFAULT 'Agenda principal';
CREATE TABLE IF NOT EXISTS google_calendar_saved_calendars (
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  google_subject TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  links TEXT NOT NULL,
  PRIMARY KEY(unidade_id,google_subject,calendar_id)
);
CREATE TRIGGER IF NOT EXISTS google_calendar_switch_pending BEFORE UPDATE OF calendar_id ON google_calendar_connections
WHEN NEW.calendar_id!=OLD.calendar_id AND EXISTS(SELECT 1 FROM google_calendar_outbox WHERE connection_id=OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'calendar_sync_pending');
END;
