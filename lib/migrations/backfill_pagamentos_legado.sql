-- Backfill legado para aproximar pagamentos antigos ao novo modelo
-- Estratégia:
-- 1. Preenche agendamentos.valor / valor_pago quando ainda estiverem vazios
-- 2. Distribui pagamentos reais já existentes sequencialmente entre itens pagos do mesmo atendimento
-- 3. Quando ainda restar valor_pago sem cobertura por pagamento local, cria 1 pagamento sintético por atendimento
-- 4. Aloca o residual dos itens a esse pagamento sintético

-- 1. Backfill de valores em agendamentos já existentes
UPDATE agendamentos
SET valor = COALESCE(
  CASE
    WHEN procedimento_id IS NULL THEN valor
    WHEN etapa_modelo_id IS NOT NULL THEN (
      SELECT COALESCE(
        CAST(json_extract(io.etapas_valores, '$."' || agendamentos.etapa_modelo_id || '"') AS REAL),
        pem.valor,
        io.valor_final,
        io.valor,
        p.valor
      )
      FROM procedimentos p
      LEFT JOIN itens_atendimento io ON io.id = agendamentos.item_atendimento_origem_id
      LEFT JOIN procedimento_etapas_modelo pem ON pem.id = agendamentos.etapa_modelo_id
      WHERE p.id = agendamentos.procedimento_id
    )
    WHEN item_atendimento_origem_id IS NOT NULL THEN (
      SELECT COALESCE(io.valor_final, io.valor, p.valor)
      FROM procedimentos p
      LEFT JOIN itens_atendimento io ON io.id = agendamentos.item_atendimento_origem_id
      WHERE p.id = agendamentos.procedimento_id
    )
    ELSE (
      SELECT p.valor
      FROM procedimentos p
      WHERE p.id = agendamentos.procedimento_id
    )
  END,
  valor
)
WHERE agendamentos.valor IS NULL;

UPDATE agendamentos
SET valor_pago = CASE
  WHEN COALESCE(valor_pago, 0) > 0 THEN valor_pago
  WHEN pago = 1 AND valor IS NOT NULL THEN valor
  ELSE 0
END
WHERE COALESCE(valor_pago, 0) = 0;

-- 2. Distribui pagamentos reais já existentes pelos itens pagos do mesmo atendimento
WITH item_alloc_base AS (
  SELECT
    i.id AS item_id,
    i.atendimento_id,
    i.etapa_modelo_id,
    i.created_at,
    ROUND(MAX(0, COALESCE(i.valor_pago, 0) - COALESCE((
      SELECT SUM(pa.valor_alocado)
      FROM pagamentos_alocacoes pa
      INNER JOIN pagamentos p ON p.id = pa.pagamento_id
      WHERE pa.item_atendimento_id = i.id
        AND p.cancelado = 0
    ), 0)), 2) AS residual
  FROM itens_atendimento i
  WHERE COALESCE(i.valor_pago, 0) > 0
),
item_alloc AS (
  SELECT
    item_id,
    atendimento_id,
    etapa_modelo_id,
    created_at,
    residual,
    ROUND(
      SUM(residual) OVER (
        PARTITION BY atendimento_id
        ORDER BY datetime(created_at), item_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
      2
    ) AS item_end
  FROM item_alloc_base
  WHERE residual > 0.004
),
payment_alloc_base AS (
  SELECT
    p.id AS pagamento_id,
    p.atendimento_id,
    p.created_at,
    ROUND(MAX(0, COALESCE(p.valor, 0) - COALESCE((
      SELECT SUM(pa.valor_alocado)
      FROM pagamentos_alocacoes pa
      INNER JOIN pagamentos p2 ON p2.id = pa.pagamento_id
      WHERE pa.pagamento_id = p.id
        AND p2.cancelado = 0
    ), 0)), 2) AS residual
  FROM pagamentos p
  WHERE p.cancelado = 0
),
payment_alloc AS (
  SELECT
    pagamento_id,
    atendimento_id,
    created_at,
    residual,
    ROUND(
      SUM(residual) OVER (
        PARTITION BY atendimento_id
        ORDER BY datetime(created_at), pagamento_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
      2
    ) AS pay_end
  FROM payment_alloc_base
  WHERE residual > 0.004
),
overlap AS (
  SELECT
    p.pagamento_id,
    i.item_id,
    i.etapa_modelo_id,
    ROUND(
      MIN(i.item_end, p.pay_end) - MAX(i.item_end - i.residual, p.pay_end - p.residual),
      2
    ) AS valor_alocado
  FROM item_alloc i
  INNER JOIN payment_alloc p
    ON p.atendimento_id = i.atendimento_id
  WHERE MIN(i.item_end, p.pay_end) - MAX(i.item_end - i.residual, p.pay_end - p.residual) > 0.004
)
INSERT INTO pagamentos_alocacoes (pagamento_id, item_atendimento_id, etapa_modelo_id, valor_alocado)
SELECT
  o.pagamento_id,
  o.item_id,
  o.etapa_modelo_id,
  o.valor_alocado
FROM overlap o
WHERE NOT EXISTS (
  SELECT 1
  FROM pagamentos_alocacoes pa
  WHERE pa.pagamento_id = o.pagamento_id
    AND pa.item_atendimento_id = o.item_id
    AND COALESCE(pa.etapa_modelo_id, 0) = COALESCE(o.etapa_modelo_id, 0)
);

-- 3. Cria um pagamento sintético por atendimento para o residual sem lastro em pagamentos locais
WITH item_remaining AS (
  SELECT
    i.id AS item_id,
    i.atendimento_id,
    ROUND(MAX(0, COALESCE(i.valor_pago, 0) - COALESCE((
      SELECT SUM(pa.valor_alocado)
      FROM pagamentos_alocacoes pa
      INNER JOIN pagamentos p ON p.id = pa.pagamento_id
      WHERE pa.item_atendimento_id = i.id
        AND p.cancelado = 0
    ), 0)), 2) AS residual
  FROM itens_atendimento i
  WHERE COALESCE(i.valor_pago, 0) > 0
),
atendimento_remaining AS (
  SELECT
    ir.atendimento_id,
    ROUND(SUM(ir.residual), 2) AS residual_total
  FROM item_remaining ir
  WHERE ir.residual > 0.004
  GROUP BY ir.atendimento_id
)
INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, observacoes, created_at)
SELECT
  ar.atendimento_id,
  COALESCE(
    (SELECT a.liberado_por_id FROM atendimentos a WHERE a.id = ar.atendimento_id AND a.liberado_por_id IS NOT NULL),
    (SELECT a.avaliador_id FROM atendimentos a WHERE a.id = ar.atendimento_id AND a.avaliador_id IS NOT NULL),
    (SELECT MIN(id) FROM usuarios)
  ) AS recebido_por_id,
  ar.residual_total,
  'afins_sorria',
  printf('Backfill legado automático (%d)', ar.atendimento_id),
  COALESCE(
    (SELECT MAX(i.created_at) FROM itens_atendimento i WHERE i.atendimento_id = ar.atendimento_id AND COALESCE(i.valor_pago, 0) > 0),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
FROM atendimento_remaining ar
WHERE ar.residual_total > 0.004
  AND NOT EXISTS (
    SELECT 1
    FROM pagamentos p
    WHERE p.atendimento_id = ar.atendimento_id
      AND p.observacoes = printf('Backfill legado automático (%d)', ar.atendimento_id)
  );

-- 4. Aloca o residual dos itens para o pagamento sintético criado acima
WITH item_remaining AS (
  SELECT
    i.id AS item_id,
    i.atendimento_id,
    i.etapa_modelo_id,
    ROUND(MAX(0, COALESCE(i.valor_pago, 0) - COALESCE((
      SELECT SUM(pa.valor_alocado)
      FROM pagamentos_alocacoes pa
      INNER JOIN pagamentos p ON p.id = pa.pagamento_id
      WHERE pa.item_atendimento_id = i.id
        AND p.cancelado = 0
    ), 0)), 2) AS residual
  FROM itens_atendimento i
  WHERE COALESCE(i.valor_pago, 0) > 0
)
INSERT INTO pagamentos_alocacoes (pagamento_id, item_atendimento_id, etapa_modelo_id, valor_alocado)
SELECT
  p.id AS pagamento_id,
  ir.item_id,
  ir.etapa_modelo_id,
  ir.residual
FROM item_remaining ir
INNER JOIN pagamentos p
  ON p.atendimento_id = ir.atendimento_id
 AND p.observacoes = printf('Backfill legado automático (%d)', ir.atendimento_id)
WHERE ir.residual > 0.004
  AND NOT EXISTS (
    SELECT 1
    FROM pagamentos_alocacoes pa
    WHERE pa.pagamento_id = p.id
      AND pa.item_atendimento_id = ir.item_id
      AND COALESCE(pa.etapa_modelo_id, 0) = COALESCE(ir.etapa_modelo_id, 0)
  );
