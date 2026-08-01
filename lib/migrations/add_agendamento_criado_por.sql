-- Registra o usuário responsável pela criação do agendamento.
ALTER TABLE agendamentos
  ADD COLUMN criado_por_id INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_criado_por
  ON agendamentos(criado_por_id);
