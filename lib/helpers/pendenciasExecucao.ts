export const AGENDAMENTO_VENCIDO_SQL = `
  ag.status IN ('pendente', 'agendado') AND
  CASE WHEN length(trim(ag.data_agendada)) = 10
    THEN date(ag.data_agendada) < date('now', '-3 hours')
    ELSE datetime(ag.data_agendada) < datetime('now', '-3 hours', 'start of day', '+3 hours')
  END`;

export const POSSUI_AGENDAMENTO_VENCIDO_SQL = `EXISTS (
  SELECT 1 FROM agendamentos ag
  WHERE ag.item_atendimento_origem_id = i.id AND ag.unidade_id = a.unidade_id
    AND ${AGENDAMENTO_VENCIDO_SQL}
)`;
