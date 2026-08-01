-- Reconcilia valores financeiros gravados antes da adoção de valor_final e do
-- rateio proporcional das etapas. A atualização é intencionalmente restrita:
-- snapshots de agendamento editados manualmente são preservados.

-- valor_final é a fonte efetiva do item. Mantém valor sincronizado para os
-- consumidores legados e para relatórios externos que ainda leiam a coluna.
UPDATE itens_atendimento
SET valor = ROUND(valor_final, 2)
WHERE valor_final IS NOT NULL
  AND ABS(COALESCE(valor, 0) - valor_final) >= 0.005;

-- Calcula o mesmo rateio em centavos usado pela aplicação. Somente corrige
-- agendamentos ativos sem valor ou cujo valor ainda seja exatamente o valor
-- bruto da etapa-modelo (sinal do rateio legado). O valor pago funciona como
-- piso para nunca reduzir a obrigação abaixo do que já foi alocado.
WITH etapas_base AS (
  SELECT
    pem.id AS etapa_modelo_id,
    pem.procedimento_id,
    pem.valor AS valor_modelo,
    pem.ordem,
    ROUND(MAX(COALESCE(p.valor, 0), 0) * 100) AS total_centavos,
    COUNT(*) OVER (PARTITION BY pem.procedimento_id) AS quantidade_etapas,
    SUM(MAX(COALESCE(pem.valor, 0), 0)) OVER (PARTITION BY pem.procedimento_id) AS soma_pesos,
    ROW_NUMBER() OVER (
      PARTITION BY pem.procedimento_id
      ORDER BY pem.ordem ASC, pem.id ASC
    ) AS numero_etapa
  FROM procedimento_etapas_modelo pem
  INNER JOIN procedimentos p ON p.id = pem.procedimento_id
),
etapas_com_quota AS (
  SELECT
    *,
    CASE
      WHEN soma_pesos > 0 THEN ROUND(MAX(COALESCE(valor_modelo, 0), 0) * total_centavos / soma_pesos)
      ELSE ROUND(total_centavos * 1.0 / quantidade_etapas)
    END AS quota_centavos
  FROM etapas_base
),
etapas_calculadas AS (
  SELECT
    *,
    CASE
      WHEN numero_etapa = quantidade_etapas THEN
        total_centavos - COALESCE(
          SUM(quota_centavos) OVER (
            PARTITION BY procedimento_id
            ORDER BY ordem ASC, etapa_modelo_id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
          0
        )
      ELSE quota_centavos
    END AS valor_reconciliado_centavos
  FROM etapas_com_quota
),
candidatos AS (
  SELECT
    ag.id AS agendamento_id,
    MAX(ec.valor_reconciliado_centavos / 100.0, COALESCE(ag.valor_pago, 0)) AS valor_reconciliado
  FROM agendamentos ag
  INNER JOIN etapas_calculadas ec ON ec.etapa_modelo_id = ag.etapa_modelo_id
  INNER JOIN procedimentos p ON p.id = ec.procedimento_id
  WHERE ag.status IN ('pendente', 'agendado')
    AND (
      ag.valor IS NULL
      OR (
        ec.valor_modelo IS NOT NULL
        AND ABS(ag.valor - ec.valor_modelo) < 0.005
        AND ABS((ec.valor_reconciliado_centavos / 100.0) - ec.valor_modelo) >= 0.005
      )
      OR (
        ec.valor_modelo IS NULL
        AND ec.soma_pesos = 0
        AND ec.quantidade_etapas > 1
        AND ABS(ag.valor - p.valor) < 0.005
        AND ABS((ec.valor_reconciliado_centavos / 100.0) - ag.valor) >= 0.005
      )
    )
)
UPDATE agendamentos
SET valor = ROUND((
  SELECT candidatos.valor_reconciliado
  FROM candidatos
  WHERE candidatos.agendamento_id = agendamentos.id
), 2)
WHERE id IN (SELECT agendamento_id FROM candidatos);

UPDATE agendamentos
SET pago = CASE
  WHEN COALESCE(valor, 0) > 0 AND COALESCE(valor_pago, 0) + 0.001 >= valor THEN 1
  ELSE 0
END
WHERE status IN ('pendente', 'agendado');
