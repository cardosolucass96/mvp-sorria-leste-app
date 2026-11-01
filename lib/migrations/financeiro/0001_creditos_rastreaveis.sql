-- Aditiva: configuração desativada por padrão. Não atribui origem ao legado.
CREATE TABLE IF NOT EXISTS financeiro_configuracao (
  unidade_id INTEGER PRIMARY KEY REFERENCES unidades(id),
  creditos_rastreaveis INTEGER NOT NULL DEFAULT 0 CHECK (creditos_rastreaveis IN (0,1))
);
CREATE TABLE IF NOT EXISTS financeiro_versao (id INTEGER PRIMARY KEY CHECK(id=1), versao INTEGER NOT NULL);
INSERT OR IGNORE INTO financeiro_versao VALUES (1,0);
CREATE TABLE IF NOT EXISTS financeiro_operacoes (
  id TEXT PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  assinatura TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  resposta TEXT NOT NULL,
  status INTEGER NOT NULL,
  validado INTEGER NOT NULL CONSTRAINT financeiro_conflito CHECK(validado=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS financeiro_contas (
  cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id),
  saldo_abertura_centavos INTEGER NOT NULL CHECK(saldo_abertura_centavos>=0),
  movimento_legado_max INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS financeiro_itens (
  item_id INTEGER PRIMARY KEY REFERENCES itens_atendimento(id)
);
CREATE TABLE IF NOT EXISTS financeiro_creditos (
  id TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  pagamento_origem_id INTEGER REFERENCES pagamentos(id),
  movimento_id INTEGER REFERENCES movimentacoes_saldo(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
  operacao_id TEXT NOT NULL REFERENCES financeiro_operacoes(id),
  origem TEXT NOT NULL CHECK(origem IN ('abertura','manual','pagamento','procedimento','devolucao_credito','transferencia'))
);
CREATE TABLE IF NOT EXISTS financeiro_consumos (
  id TEXT PRIMARY KEY,
  credito_id TEXT NOT NULL REFERENCES financeiro_creditos(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
  tipo TEXT NOT NULL CHECK(tipo IN ('uso','transferencia','devolucao','cancelamento')),
  operacao_id TEXT NOT NULL REFERENCES financeiro_operacoes(id)
);
CREATE TABLE IF NOT EXISTS financeiro_coberturas (
  id TEXT PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES itens_atendimento(id),
  etapa_modelo_id INTEGER REFERENCES procedimento_etapas_modelo(id),
  consumo_id TEXT NOT NULL REFERENCES financeiro_consumos(id),
  valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),
  liberada INTEGER NOT NULL DEFAULT 0 CHECK(liberada IN (0,1))
);
CREATE TABLE IF NOT EXISTS financeiro_liberacoes (
  alocacao_id INTEGER PRIMARY KEY REFERENCES pagamentos_alocacoes(id),
  operacao_id TEXT NOT NULL REFERENCES financeiro_operacoes(id)
);
CREATE TABLE IF NOT EXISTS financeiro_comissoes_credito (
  cobertura_id TEXT PRIMARY KEY REFERENCES financeiro_coberturas(id),
  comissao_id INTEGER NOT NULL UNIQUE REFERENCES comissoes(id)
);
CREATE INDEX IF NOT EXISTS idx_fin_creditos_cliente ON financeiro_creditos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fin_creditos_pagamento ON financeiro_creditos(pagamento_origem_id);
CREATE INDEX IF NOT EXISTS idx_fin_consumos_credito ON financeiro_consumos(credito_id);
CREATE INDEX IF NOT EXISTS idx_fin_coberturas_item ON financeiro_coberturas(item_id, etapa_modelo_id);
CREATE TRIGGER IF NOT EXISTS fin_versao_saldo_clientes_insert AFTER INSERT ON saldo_clientes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_saldo_clientes_update AFTER UPDATE ON saldo_clientes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_saldo_clientes_delete AFTER DELETE ON saldo_clientes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_movimentacoes_saldo_insert AFTER INSERT ON movimentacoes_saldo
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_movimentacoes_saldo_update AFTER UPDATE ON movimentacoes_saldo
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_movimentacoes_saldo_delete AFTER DELETE ON movimentacoes_saldo
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_itens_atendimento_insert AFTER INSERT ON itens_atendimento
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_itens_atendimento_update AFTER UPDATE ON itens_atendimento
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_itens_atendimento_delete AFTER DELETE ON itens_atendimento
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_atendimentos_insert AFTER INSERT ON atendimentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_atendimentos_update AFTER UPDATE ON atendimentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_atendimentos_delete AFTER DELETE ON atendimentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_insert AFTER INSERT ON pagamentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_update AFTER UPDATE ON pagamentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_delete AFTER DELETE ON pagamentos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_grupos_insert AFTER INSERT ON pagamentos_grupos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_grupos_update AFTER UPDATE ON pagamentos_grupos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_grupos_delete AFTER DELETE ON pagamentos_grupos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_alocacoes_insert AFTER INSERT ON pagamentos_alocacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_alocacoes_update AFTER UPDATE ON pagamentos_alocacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_pagamentos_alocacoes_delete AFTER DELETE ON pagamentos_alocacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_comissoes_insert AFTER INSERT ON comissoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_comissoes_update AFTER UPDATE ON comissoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_comissoes_delete AFTER DELETE ON comissoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_configuracao_insert AFTER INSERT ON financeiro_configuracao
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_configuracao_update AFTER UPDATE ON financeiro_configuracao
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_configuracao_delete AFTER DELETE ON financeiro_configuracao
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_contas_insert AFTER INSERT ON financeiro_contas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_contas_update AFTER UPDATE ON financeiro_contas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_contas_delete AFTER DELETE ON financeiro_contas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_itens_insert AFTER INSERT ON financeiro_itens
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_itens_update AFTER UPDATE ON financeiro_itens
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_itens_delete AFTER DELETE ON financeiro_itens
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_creditos_insert AFTER INSERT ON financeiro_creditos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_creditos_update AFTER UPDATE ON financeiro_creditos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_creditos_delete AFTER DELETE ON financeiro_creditos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_consumos_insert AFTER INSERT ON financeiro_consumos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_consumos_update AFTER UPDATE ON financeiro_consumos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_consumos_delete AFTER DELETE ON financeiro_consumos
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_coberturas_insert AFTER INSERT ON financeiro_coberturas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_coberturas_update AFTER UPDATE ON financeiro_coberturas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_coberturas_delete AFTER DELETE ON financeiro_coberturas
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_liberacoes_insert AFTER INSERT ON financeiro_liberacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_liberacoes_update AFTER UPDATE ON financeiro_liberacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS fin_versao_financeiro_liberacoes_delete AFTER DELETE ON financeiro_liberacoes
BEGIN UPDATE financeiro_versao SET versao=versao+1 WHERE id=1; END;
