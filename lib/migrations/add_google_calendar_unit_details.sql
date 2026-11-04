CREATE TRIGGER IF NOT EXISTS google_calendar_unidade_update AFTER UPDATE OF nome,endereco ON unidades
WHEN NEW.nome IS NOT OLD.nome OR NEW.endereco IS NOT OLD.endereco
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT l.connection_id,l.agendamento_id FROM google_calendar_links l
  JOIN google_calendar_connections c ON c.id=l.connection_id
  WHERE c.unidade_id=NEW.id AND c.status!='disconnecting';
END;
