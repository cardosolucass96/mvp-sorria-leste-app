ALTER TABLE google_calendar_links ADD COLUMN pending_write TEXT;
CREATE TABLE IF NOT EXISTS google_calendar_archives (
  unidade_id INTEGER NOT NULL REFERENCES unidades(id),
  google_subject TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  default_duration INTEGER NOT NULL,
  links TEXT NOT NULL,
  PRIMARY KEY(unidade_id,google_subject)
);
