-- Reconciliacao manual de legados quebrados no fluxo de continuacao.
-- Nao execute em lote sem revisar cada caso.
-- Objetivo: reconstruir item_atendimento ausente, religar pagamentos ao item
-- e apontar agendamentos de retorno para o mesmo item.

-- 1. Casos com pagamento ou continuacao ativa, mas sem item no atendimento.
SELECT
  a.id AS atendimento_id,
  a.cliente_id,
  a.unidade_id,
  a.status,
  a.motivo_saida,
  COUNT(DISTINCT ia.id) AS itens_count,
  COUNT(DISTINCT CASE WHEN p.cancelado = 0 THEN p.id END) AS pagamentos_ativos,
  COUNT(DISTINCT CASE WHEN ag.status IN ('pendente', 'agendado') THEN ag.id END) AS continuacoes_ativas
FROM atendimentos a
LEFT JOIN itens_atendimento ia ON ia.atendimento_id = a.id
LEFT JOIN pagamentos p ON p.atendimento_id = a.id
LEFT JOIN agendamentos ag ON ag.atendimento_origem_id = a.id AND ag.tipo = 'procedimento'
GROUP BY a.id, a.cliente_id, a.unidade_id, a.status, a.motivo_saida
HAVING itens_count = 0
   AND (pagamentos_ativos > 0 OR continuacoes_ativas > 0)
ORDER BY a.id;

-- 2. Agendamentos legados de procedimento sem vinculo ao item de origem.
SELECT
  ag.id AS agendamento_id,
  ag.atendimento_origem_id,
  ag.cliente_id,
  ag.procedimento_id,
  ag.executor_id,
  ag.valor,
  ag.status,
  ag.created_at
FROM agendamentos ag
WHERE ag.tipo = 'procedimento'
  AND ag.atendimento_origem_id IS NOT NULL
  AND ag.item_atendimento_origem_id IS NULL
  AND ag.status IN ('pendente', 'agendado', 'realizado')
ORDER BY ag.atendimento_origem_id, ag.id;

-- 3. Casos que exigem vendedor manual antes de gerar comissao.
SELECT
  ag.id AS agendamento_id,
  ag.atendimento_origem_id,
  ag.cliente_id,
  ag.procedimento_id,
  pa.criado_por_id,
  pa.origem_comissao,
  pa.percentual_comissao
FROM agendamentos ag
INNER JOIN pagamentos_alocacoes pa ON pa.agendamento_id = ag.id
WHERE ag.tipo = 'procedimento'
  AND ag.atendimento_origem_id IS NOT NULL
  AND pa.criado_por_id IS NULL
ORDER BY ag.atendimento_origem_id, ag.id, pa.id;

-- 4. Template de reparo por caso.
-- Substitua os valores marcados entre << >> apos revisar os SELECTs acima.
-- O reparo abaixo supoe um unico procedimento legado por atendimento.

-- BEGIN TRANSACTION;

-- 4.1. Recriar o item original a partir do agendamento legado mais representativo.
-- INSERT INTO itens_atendimento (
--   atendimento_id,
--   procedimento_id,
--   executor_id,
--   criado_por_id,
--   valor,
--   valor_original,
--   valor_final,
--   valor_pago,
--   status,
--   adicionado_em_execucao,
--   created_at
-- )
-- SELECT
--   ag.atendimento_origem_id,
--   ag.procedimento_id,
--   ag.executor_id,
--   pa.criado_por_id,
--   COALESCE(ag.valor, SUM(pa.valor_alocado), 0),
--   COALESCE(ag.valor, SUM(pa.valor_alocado), 0),
--   COALESCE(ag.valor, SUM(pa.valor_alocado), 0),
--   0,
--   CASE
--     WHEN COALESCE(SUM(pa.valor_alocado), 0) >= COALESCE(ag.valor, SUM(pa.valor_alocado), 0)
--       THEN 'pago'
--     WHEN COALESCE(SUM(pa.valor_alocado), 0) > 0
--       THEN 'pendente'
--     ELSE 'pendente'
--   END,
--   0,
--   ag.created_at
-- FROM agendamentos ag
-- LEFT JOIN pagamentos_alocacoes pa ON pa.agendamento_id = ag.id
-- WHERE ag.id = <<AGENDAMENTO_BASE_ID>>
-- GROUP BY ag.id;

-- 4.2. Descubra o id inserido e use-o abaixo como <<NOVO_ITEM_ID>>.
-- SELECT last_insert_rowid() AS novo_item_id;

-- 4.3. Mover as alocacoes financeiras legadas de volta para o item.
-- UPDATE pagamentos_alocacoes
-- SET item_atendimento_id = <<NOVO_ITEM_ID>>,
--     agendamento_id = NULL
-- WHERE agendamento_id IN (
--   SELECT id
--   FROM agendamentos
--   WHERE atendimento_origem_id = <<ATENDIMENTO_ID>>
--     AND tipo = 'procedimento'
-- );

-- 4.4. Regravar os agendamentos ativos/realizados para apontarem ao mesmo item.
-- UPDATE agendamentos
-- SET atendimento_origem_id = <<ATENDIMENTO_ID>>,
--     item_atendimento_origem_id = <<NOVO_ITEM_ID>>
-- WHERE atendimento_origem_id = <<ATENDIMENTO_ID>>
--   AND tipo = 'procedimento';

-- 4.5. Recalcular valor_pago e status financeiro do item recriado.
-- UPDATE itens_atendimento
-- SET valor_pago = (
--       SELECT COALESCE(SUM(pa.valor_alocado), 0)
--       FROM pagamentos_alocacoes pa
--       INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
--       WHERE pa.item_atendimento_id = <<NOVO_ITEM_ID>>
--         AND pg.cancelado = 0
--     ),
--     status = CASE
--       WHEN (
--         SELECT COALESCE(SUM(pa.valor_alocado), 0)
--         FROM pagamentos_alocacoes pa
--         INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
--         WHERE pa.item_atendimento_id = <<NOVO_ITEM_ID>>
--           AND pg.cancelado = 0
--       ) >= COALESCE(valor_final, valor)
--         THEN 'pago'
--       ELSE 'pendente'
--     END
-- WHERE id = <<NOVO_ITEM_ID>>;

-- 4.6. Se nao existir criado_por_id confiavel, pare aqui e ajuste manualmente antes
-- de rodar qualquer rotina de comissao de venda.

-- COMMIT;

-- 5. Validacao final do caso reparado.
-- SELECT
--   a.id AS atendimento_id,
--   ia.id AS item_id,
--   ia.procedimento_id,
--   ia.criado_por_id,
--   ia.executor_id,
--   ia.valor,
--   ia.valor_pago,
--   ia.status,
--   ag.id AS agendamento_id,
--   ag.status AS agendamento_status,
--   ag.item_atendimento_origem_id
-- FROM atendimentos a
-- LEFT JOIN itens_atendimento ia ON ia.atendimento_id = a.id
-- LEFT JOIN agendamentos ag ON ag.atendimento_origem_id = a.id AND ag.tipo = 'procedimento'
-- WHERE a.id = <<ATENDIMENTO_ID>>
-- ORDER BY ag.id;
