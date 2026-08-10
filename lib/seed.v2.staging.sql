-- Dados sintéticos e idempotentes para homologar o fluxo V2 no staging.

INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id)
SELECT u.id, un.id FROM usuarios u CROSS JOIN unidades un WHERE un.ativo = 1;

INSERT OR IGNORE INTO cliente_unidades_v2 (cliente_id, unidade_id, vinculado_por_id)
SELECT c.id, 1, (SELECT id FROM usuarios WHERE email = 'admin@sorrialeste.com')
FROM clientes c;

INSERT OR IGNORE INTO atendimentos_clinicos (
  id, cliente_id, unidade_id, status, criado_por_id, checkin_em, iniciado_em, finalizado_em
)
SELECT 'v2-seed-atendimento-avaliacao', c.id, 1, 'finalizado', admin.id,
  '2026-08-03T12:00:00.000Z', '2026-08-03T12:05:00.000Z', '2026-08-03T12:45:00.000Z'
FROM clientes c, usuarios admin
WHERE c.cpf = '111.111.111-11' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO avaliacoes (
  id, atendimento_clinico_id, cliente_id, unidade_id, avaliador_id, status, concluida_em
)
SELECT 'v2-seed-avaliacao-com-orcamento', 'v2-seed-atendimento-avaliacao', c.id, 1, av.id,
  'concluida', '2026-08-03T12:40:00.000Z'
FROM clientes c, usuarios av
WHERE c.cpf = '111.111.111-11' AND av.email = 'dr.carlos@sorrialeste.com';

INSERT OR IGNORE INTO orcamentos (
  id, avaliacao_id, cliente_id, unidade_id, avaliador_id, status, apresentado_em
)
SELECT 'v2-seed-orcamento', 'v2-seed-avaliacao-com-orcamento', c.id, 1, av.id,
  'parcialmente_aceito', '2026-08-03T12:35:00.000Z'
FROM clientes c, usuarios av
WHERE c.cpf = '111.111.111-11' AND av.email = 'dr.carlos@sorrialeste.com';

INSERT OR IGNORE INTO procedimentos_cliente (
  id, cliente_id, unidade_id, orcamento_id, avaliacao_id, procedimento_catalogo_id,
  origem, criado_por_id, avaliador_id, nome_snapshot, descricao_snapshot, quantidade,
  valor_tabela_centavos, desconto_centavos, valor_final_centavos,
  comissao_avaliacao_bps, comissao_acrescimo_bps, comissao_execucao_bps, status_comercial
)
SELECT 'v2-seed-proposto', c.id, 1, 'v2-seed-orcamento', 'v2-seed-avaliacao-com-orcamento', p.id,
  'avaliacao', av.id, av.id, p.nome, p.descricao, 1, 15000, 0, 15000,
  400, 1000, 3000, 'proposto'
FROM clientes c, procedimentos p, usuarios av
WHERE c.cpf = '111.111.111-11' AND p.nome = 'Limpeza/Profilaxia'
  AND av.email = 'dr.carlos@sorrialeste.com';

INSERT OR IGNORE INTO procedimentos_cliente (
  id, cliente_id, unidade_id, orcamento_id, avaliacao_id, procedimento_catalogo_id,
  origem, criado_por_id, avaliador_id, executor_preferencial_id, nome_snapshot,
  descricao_snapshot, quantidade, valor_tabela_centavos, desconto_centavos,
  valor_final_centavos, comissao_avaliacao_bps, comissao_acrescimo_bps,
  comissao_execucao_bps, status_comercial, aceite_tipo, aceito_por_id, aceito_em
)
SELECT 'v2-seed-aceito-parcial', c.id, 1, 'v2-seed-orcamento', 'v2-seed-avaliacao-com-orcamento', p.id,
  'avaliacao', av.id, av.id, ex.id, p.nome, p.descricao, 1, 20000, 0, 20000,
  1000, 1000, 3500, 'aceito', 'orcamento', av.id, '2026-08-03T12:36:00.000Z'
FROM clientes c, procedimentos p, usuarios av, usuarios ex
WHERE c.cpf = '111.111.111-11' AND p.nome = 'Restauração Simples'
  AND av.email = 'dr.carlos@sorrialeste.com' AND ex.email = 'dr.pedro@sorrialeste.com';

INSERT OR IGNORE INTO procedimento_cliente_dentes (id, procedimento_cliente_id, dente, faces_json)
VALUES ('v2-seed-dente', 'v2-seed-aceito-parcial', '11', '["V"]');

INSERT OR IGNORE INTO agenda_compromissos (
  id, cliente_id, unidade_id, data_agendada, duracao_minutos, status, criado_por_id
)
SELECT 'v2-seed-agenda-execucao', c.id, 1, '2026-08-18T12:00:00.000Z', 60, 'agendado', admin.id
FROM clientes c, usuarios admin
WHERE c.cpf = '111.111.111-11' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO agenda_compromisso_itens (
  id, agenda_compromisso_id, procedimento_cliente_id, profissional_id
)
SELECT 'v2-seed-agenda-item', 'v2-seed-agenda-execucao', 'v2-seed-aceito-parcial', ex.id
FROM usuarios ex WHERE ex.email = 'dr.pedro@sorrialeste.com';

INSERT OR IGNORE INTO recebimentos (
  id, cliente_id, unidade_id, recebido_por_id, canal, valor_total_centavos, idempotency_key
)
SELECT 'v2-seed-recebimento-avulso', c.id, 1, admin.id, 'presencial', 10000, 'v2-seed-recebimento-avulso'
FROM clientes c, usuarios admin
WHERE c.cpf = '111.111.111-11' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO recebimento_formas (
  id, recebimento_id, forma_pagamento_id, valor_centavos
)
SELECT 'v2-seed-recebimento-forma', 'v2-seed-recebimento-avulso', fp.id, 10000
FROM formas_pagamento fp WHERE fp.unidade_id = 1 AND fp.ativo = 1 ORDER BY fp.id LIMIT 1;

INSERT OR IGNORE INTO recebimento_alocacoes (
  id, recebimento_id, procedimento_cliente_id, valor_centavos
)
VALUES ('v2-seed-alocacao', 'v2-seed-recebimento-avulso', 'v2-seed-aceito-parcial', 10000);

INSERT OR IGNORE INTO cliente_saldo_movimentos (
  id, cliente_id, unidade_id, recebimento_id, tipo, valor_centavos, criado_por_id, idempotency_key
)
SELECT 'v2-seed-saldo-credito', c.id, 1, 'v2-seed-recebimento-avulso', 'credito', 10000, admin.id, 'v2-seed-saldo-credito'
FROM clientes c, usuarios admin
WHERE c.cpf = '111.111.111-11' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO cliente_saldo_movimentos (
  id, cliente_id, unidade_id, recebimento_id, procedimento_cliente_id, tipo,
  valor_centavos, criado_por_id
)
SELECT 'v2-seed-saldo-alocacao', c.id, 1, 'v2-seed-recebimento-avulso', 'v2-seed-aceito-parcial',
  'alocacao', -10000, admin.id
FROM clientes c, usuarios admin
WHERE c.cpf = '111.111.111-11' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO atendimentos_clinicos (
  id, cliente_id, unidade_id, status, criado_por_id, checkin_em, iniciado_em, finalizado_em
)
SELECT 'v2-seed-atendimento-sem-orcamento', c.id, 1, 'finalizado', admin.id,
  '2026-08-04T15:00:00.000Z', '2026-08-04T15:05:00.000Z', '2026-08-04T15:25:00.000Z'
FROM clientes c, usuarios admin
WHERE c.cpf = '333.333.333-33' AND admin.email = 'admin@sorrialeste.com';

INSERT OR IGNORE INTO avaliacoes (
  id, atendimento_clinico_id, cliente_id, unidade_id, avaliador_id, status,
  motivo_sem_orcamento, concluida_em
)
SELECT 'v2-seed-avaliacao-sem-orcamento', 'v2-seed-atendimento-sem-orcamento', c.id, 1, av.id,
  'concluida', 'Paciente veio apenas para segunda opinião; nenhum tratamento indicado.', '2026-08-04T15:20:00.000Z'
FROM clientes c, usuarios av
WHERE c.cpf = '333.333.333-33' AND av.email = 'dra.ana@sorrialeste.com';

INSERT OR IGNORE INTO orcamentos (
  id, avaliacao_id, cliente_id, unidade_id, avaliador_id, status
)
SELECT 'v2-seed-orcamento-vazio', 'v2-seed-avaliacao-sem-orcamento', c.id, 1, av.id, 'rascunho'
FROM clientes c, usuarios av
WHERE c.cpf = '333.333.333-33' AND av.email = 'dra.ana@sorrialeste.com';

INSERT OR IGNORE INTO agenda_compromissos (
  id, cliente_id, unidade_id, finalidade_avaliacao, avaliador_id, data_agendada,
  duracao_minutos, status, criado_por_id
)
SELECT 'v2-seed-agenda-avaliacao', c.id, 1, 1, av.id, '2026-08-20T13:00:00.000Z', 45, 'agendado', admin.id
FROM clientes c, usuarios av, usuarios admin
WHERE c.cpf = '444.444.444-44' AND av.email = 'dra.ana@sorrialeste.com'
  AND admin.email = 'admin@sorrialeste.com';
