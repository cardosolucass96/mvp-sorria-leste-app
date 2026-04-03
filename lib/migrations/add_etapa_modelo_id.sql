-- Migration: rastrear etapa específica em agendamentos e itens de sessão
-- Quando um procedimento tem_etapas=1 e uma etapa é adiada, o agendamento
-- precisa saber qual etapa específica está sendo agendada (e qual valor usar).

ALTER TABLE agendamentos ADD COLUMN etapa_modelo_id INTEGER REFERENCES procedimento_etapas_modelo(id);
ALTER TABLE itens_atendimento ADD COLUMN etapa_modelo_id INTEGER REFERENCES procedimento_etapas_modelo(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_etapa_modelo ON agendamentos(etapa_modelo_id);
CREATE INDEX IF NOT EXISTS idx_itens_etapa_modelo ON itens_atendimento(etapa_modelo_id);
