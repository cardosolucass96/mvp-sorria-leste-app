DROP TRIGGER IF EXISTS google_calendar_agendamento_update;
CREATE TRIGGER IF NOT EXISTS google_calendar_agendamento_update AFTER UPDATE OF data_agendada,status,executor_id,cliente_id,duracao_minutos,unidade_id,procedimento_id,observacoes ON agendamentos
WHEN (NEW.data_agendada IS NOT OLD.data_agendada OR NEW.status IS NOT OLD.status
  OR NEW.executor_id IS NOT OLD.executor_id OR NEW.cliente_id IS NOT OLD.cliente_id
  OR NEW.duracao_minutos IS NOT OLD.duracao_minutos OR NEW.unidade_id IS NOT OLD.unidade_id
  OR NEW.procedimento_id IS NOT OLD.procedimento_id OR NEW.observacoes IS NOT OLD.observacoes)
  AND NOT EXISTS(SELECT 1 FROM google_calendar_suppressions WHERE agendamento_id=NEW.id)
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT id,NEW.id FROM google_calendar_connections WHERE unidade_id IN (OLD.unidade_id,NEW.unidade_id) AND status!='disconnecting';
END;

DROP TRIGGER IF EXISTS google_calendar_unidade_update;
CREATE TRIGGER IF NOT EXISTS google_calendar_unidade_update AFTER UPDATE OF nome ON unidades
WHEN NEW.nome IS NOT OLD.nome
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT l.connection_id,l.agendamento_id FROM google_calendar_links l
  JOIN google_calendar_connections c ON c.id=l.connection_id
  WHERE c.unidade_id=NEW.id AND c.status!='disconnecting';
END;
CREATE TRIGGER IF NOT EXISTS google_calendar_procedimento_update AFTER UPDATE OF nome ON procedimentos
WHEN NEW.nome IS NOT OLD.nome
BEGIN
  INSERT INTO google_calendar_outbox(connection_id,agendamento_id)
  SELECT l.connection_id,l.agendamento_id FROM google_calendar_links l
  JOIN google_calendar_connections c ON c.id=l.connection_id
  JOIN agendamentos a ON a.id=l.agendamento_id AND a.unidade_id=c.unidade_id
  WHERE a.procedimento_id=NEW.id AND c.status!='disconnecting';
END;
