-- Pagamentos detalhados por item/sessão + desconto explícito + destino operacional
ALTER TABLE itens_atendimento ADD COLUMN valor_final REAL;
ALTER TABLE itens_atendimento ADD COLUMN desconto_valor REAL NOT NULL DEFAULT 0;
ALTER TABLE itens_atendimento ADD COLUMN desconto_motivo TEXT;
ALTER TABLE itens_atendimento ADD COLUMN desconto_aplicado_por_id INTEGER;
ALTER TABLE itens_atendimento ADD COLUMN desconto_aplicado_em TEXT;

UPDATE itens_atendimento
SET valor_final = COALESCE(valor_final, valor),
    valor_original = COALESCE(valor_original, valor),
    desconto_valor = COALESCE(desconto_valor, 0)
WHERE valor_final IS NULL OR valor_original IS NULL;

CREATE TABLE IF NOT EXISTS pagamentos_alocacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pagamento_id INTEGER NOT NULL,
  item_atendimento_id INTEGER,
  agendamento_id INTEGER,
  etapa_modelo_id INTEGER,
  valor_alocado REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
  FOREIGN KEY (etapa_modelo_id) REFERENCES procedimento_etapas_modelo(id)
);

CREATE TABLE IF NOT EXISTS itens_atendimento_destinos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL,
  item_atendimento_id INTEGER NOT NULL,
  etapa_modelo_id INTEGER,
  destino_status TEXT NOT NULL
    CHECK (destino_status IN ('indefinido', 'fazer_hoje', 'agendar', 'pago_sem_data', 'nao_pago_sem_data')),
  data_agendada TEXT,
  executor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (item_atendimento_id, etapa_modelo_id),
  FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
  FOREIGN KEY (item_atendimento_id) REFERENCES itens_atendimento(id),
  FOREIGN KEY (etapa_modelo_id) REFERENCES procedimento_etapas_modelo(id),
  FOREIGN KEY (executor_id) REFERENCES usuarios(id)
);

ALTER TABLE agendamentos ADD COLUMN valor REAL;
ALTER TABLE agendamentos ADD COLUMN valor_pago REAL NOT NULL DEFAULT 0;

UPDATE agendamentos
SET valor_pago = CASE
  WHEN pago = 1 AND valor IS NOT NULL THEN valor
  ELSE COALESCE(valor_pago, 0)
END
WHERE valor_pago = 0;
