-- Seed idempotente das formas de pagamento padrao para todas as unidades.
-- Fonte: tabela enviada pelo usuario em 2026-07-12.
-- Observacao: parcelas de credito usam zero-padding (01x..12x) para manter a
-- ordenacao correta no select agrupado atual, que eh alfabetico.

WITH source(grupo, subgrupo, metodo_base, taxa_percentual, taxa_fixa, ativo) AS (
VALUES
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 02x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 03x', 'cartao_credito', 5.49, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 04x', 'cartao_credito', 6.83, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 05x', 'cartao_credito', 7.33, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 06x', 'cartao_credito', 7.44, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 07x', 'cartao_credito', 8.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 08x', 'cartao_credito', 9.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 09x', 'cartao_credito', 9.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 10x', 'cartao_credito', 10.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 11x', 'cartao_credito', 10.99, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 12x', 'cartao_credito', 11.64, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 02x', 'cartao_credito', 5.83, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 03x', 'cartao_credito', 5.69, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 04x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 05x', 'cartao_credito', 5.99, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 06x', 'cartao_credito', 7.03, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 07x', 'cartao_credito', 7.59, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 08x', 'cartao_credito', 8.32, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 09x', 'cartao_credito', 8.89, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 10x', 'cartao_credito', 9.82, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 11x', 'cartao_credito', 10.19, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 12x', 'cartao_credito', 10.84, 0, 1),
  ('Cartão Débito', 'REDE ELO/HIPER/AMERICAN', 'cartao_debito', 1.49, 0, 1),
  ('Cartão Débito', 'REDE VISA/MASTER', 'cartao_debito', 0.69, 0, 1),
  ('PIX', 'Empresa', 'pix', 0.5, 0, 1),
  ('PIX', 'Stone', 'pix', 0.5, 0, 1),
  ('Dinheiro', '', 'dinheiro', 0, 0, 1),
  ('Financiamento', 'Unicred', 'crediario', 8, 0, 1),
  ('Afins Sorria', 'Cartão Afinz', 'afins_sorria', 20, 0, 1),
  ('Planos', 'Clean', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoArt', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrev', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrime', 'crediario', 0, 0, 1)
)
INSERT INTO formas_pagamento (
  unidade_id,
  grupo,
  subgrupo,
  metodo_base,
  ativo,
  created_at,
  updated_at
)
SELECT
  u.id,
  source.grupo,
  source.subgrupo,
  source.metodo_base,
  source.ativo,
  datetime('now', 'localtime'),
  datetime('now', 'localtime')
FROM unidades u
CROSS JOIN source
LEFT JOIN formas_pagamento fp
  ON fp.unidade_id = u.id
 AND fp.grupo = source.grupo
 AND fp.subgrupo = source.subgrupo
WHERE fp.id IS NULL;

WITH source(grupo, subgrupo, metodo_base, taxa_percentual, taxa_fixa, ativo) AS (
VALUES
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 02x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 03x', 'cartao_credito', 5.49, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 04x', 'cartao_credito', 6.83, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 05x', 'cartao_credito', 7.33, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 06x', 'cartao_credito', 7.44, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 07x', 'cartao_credito', 8.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 08x', 'cartao_credito', 9.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 09x', 'cartao_credito', 9.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 10x', 'cartao_credito', 10.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 11x', 'cartao_credito', 10.99, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 12x', 'cartao_credito', 11.64, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 02x', 'cartao_credito', 5.83, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 03x', 'cartao_credito', 5.69, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 04x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 05x', 'cartao_credito', 5.99, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 06x', 'cartao_credito', 7.03, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 07x', 'cartao_credito', 7.59, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 08x', 'cartao_credito', 8.32, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 09x', 'cartao_credito', 8.89, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 10x', 'cartao_credito', 9.82, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 11x', 'cartao_credito', 10.19, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 12x', 'cartao_credito', 10.84, 0, 1),
  ('Cartão Débito', 'REDE ELO/HIPER/AMERICAN', 'cartao_debito', 1.49, 0, 1),
  ('Cartão Débito', 'REDE VISA/MASTER', 'cartao_debito', 0.69, 0, 1),
  ('PIX', 'Empresa', 'pix', 0.5, 0, 1),
  ('PIX', 'Stone', 'pix', 0.5, 0, 1),
  ('Dinheiro', '', 'dinheiro', 0, 0, 1),
  ('Financiamento', 'Unicred', 'crediario', 8, 0, 1),
  ('Afins Sorria', 'Cartão Afinz', 'afins_sorria', 20, 0, 1),
  ('Planos', 'Clean', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoArt', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrev', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrime', 'crediario', 0, 0, 1)
)
UPDATE formas_pagamento
SET metodo_base = (
      SELECT source.metodo_base
      FROM source
      WHERE source.grupo = formas_pagamento.grupo
        AND source.subgrupo = formas_pagamento.subgrupo
    ),
    ativo = (
      SELECT source.ativo
      FROM source
      WHERE source.grupo = formas_pagamento.grupo
        AND source.subgrupo = formas_pagamento.subgrupo
    ),
    updated_at = datetime('now', 'localtime')
WHERE EXISTS (
    SELECT 1
    FROM source
    WHERE source.grupo = formas_pagamento.grupo
      AND source.subgrupo = formas_pagamento.subgrupo
  )
  AND (
    metodo_base <> (
      SELECT source.metodo_base
      FROM source
      WHERE source.grupo = formas_pagamento.grupo
        AND source.subgrupo = formas_pagamento.subgrupo
    )
    OR ativo <> (
      SELECT source.ativo
      FROM source
      WHERE source.grupo = formas_pagamento.grupo
        AND source.subgrupo = formas_pagamento.subgrupo
    )
  );

WITH source(grupo, subgrupo, metodo_base, taxa_percentual, taxa_fixa, ativo) AS (
VALUES
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 02x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 03x', 'cartao_credito', 5.49, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 04x', 'cartao_credito', 6.83, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 05x', 'cartao_credito', 7.33, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 06x', 'cartao_credito', 7.44, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 07x', 'cartao_credito', 8.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 08x', 'cartao_credito', 9.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 09x', 'cartao_credito', 9.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 10x', 'cartao_credito', 10.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 11x', 'cartao_credito', 10.99, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 12x', 'cartao_credito', 11.64, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 02x', 'cartao_credito', 5.83, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 03x', 'cartao_credito', 5.69, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 04x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 05x', 'cartao_credito', 5.99, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 06x', 'cartao_credito', 7.03, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 07x', 'cartao_credito', 7.59, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 08x', 'cartao_credito', 8.32, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 09x', 'cartao_credito', 8.89, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 10x', 'cartao_credito', 9.82, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 11x', 'cartao_credito', 10.19, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 12x', 'cartao_credito', 10.84, 0, 1),
  ('Cartão Débito', 'REDE ELO/HIPER/AMERICAN', 'cartao_debito', 1.49, 0, 1),
  ('Cartão Débito', 'REDE VISA/MASTER', 'cartao_debito', 0.69, 0, 1),
  ('PIX', 'Empresa', 'pix', 0.5, 0, 1),
  ('PIX', 'Stone', 'pix', 0.5, 0, 1),
  ('Dinheiro', '', 'dinheiro', 0, 0, 1),
  ('Financiamento', 'Unicred', 'crediario', 8, 0, 1),
  ('Afins Sorria', 'Cartão Afinz', 'afins_sorria', 20, 0, 1),
  ('Planos', 'Clean', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoArt', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrev', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrime', 'crediario', 0, 0, 1)
)
UPDATE formas_pagamento_historico
SET vigente_ate = datetime('now', 'localtime')
WHERE id IN (
  SELECT h.id
  FROM formas_pagamento_historico h
  JOIN formas_pagamento fp
    ON fp.id = h.forma_pagamento_id
  JOIN source
    ON source.grupo = fp.grupo
   AND source.subgrupo = fp.subgrupo
  WHERE h.vigente_ate IS NULL
    AND (
      ABS(COALESCE(h.taxa_percentual, 0) - source.taxa_percentual) > 0.000001
      OR ABS(COALESCE(h.taxa_fixa, 0) - source.taxa_fixa) > 0.000001
    )
);

WITH source(grupo, subgrupo, metodo_base, taxa_percentual, taxa_fixa, ativo) AS (
VALUES
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 02x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 03x', 'cartao_credito', 5.49, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 04x', 'cartao_credito', 6.83, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 05x', 'cartao_credito', 7.33, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 06x', 'cartao_credito', 7.44, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 07x', 'cartao_credito', 8.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 08x', 'cartao_credito', 9.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 09x', 'cartao_credito', 9.69, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 10x', 'cartao_credito', 10.34, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 11x', 'cartao_credito', 10.99, 0, 1),
  ('Cartão Crédito', 'REDE ELO/HIPER/AME 12x', 'cartao_credito', 11.64, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 01x', 'cartao_credito', 3.74, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 02x', 'cartao_credito', 5.83, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 03x', 'cartao_credito', 5.69, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 04x', 'cartao_credito', 5.84, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 05x', 'cartao_credito', 5.99, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 06x', 'cartao_credito', 7.03, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 07x', 'cartao_credito', 7.59, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 08x', 'cartao_credito', 8.32, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 09x', 'cartao_credito', 8.89, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 10x', 'cartao_credito', 9.82, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 11x', 'cartao_credito', 10.19, 0, 1),
  ('Cartão Crédito', 'REDE VISA/MASTER 12x', 'cartao_credito', 10.84, 0, 1),
  ('Cartão Débito', 'REDE ELO/HIPER/AMERICAN', 'cartao_debito', 1.49, 0, 1),
  ('Cartão Débito', 'REDE VISA/MASTER', 'cartao_debito', 0.69, 0, 1),
  ('PIX', 'Empresa', 'pix', 0.5, 0, 1),
  ('PIX', 'Stone', 'pix', 0.5, 0, 1),
  ('Dinheiro', '', 'dinheiro', 0, 0, 1),
  ('Financiamento', 'Unicred', 'crediario', 8, 0, 1),
  ('Afins Sorria', 'Cartão Afinz', 'afins_sorria', 20, 0, 1),
  ('Planos', 'Clean', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoArt', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrev', 'crediario', 0, 0, 1),
  ('Planos', 'OdontoPrime', 'crediario', 0, 0, 1)
)
INSERT INTO formas_pagamento_historico (
  forma_pagamento_id,
  taxa_percentual,
  taxa_fixa,
  vigente_de,
  vigente_ate,
  alterado_por_id,
  created_at
)
SELECT
  fp.id,
  source.taxa_percentual,
  source.taxa_fixa,
  datetime('now', 'localtime'),
  NULL,
  NULL,
  datetime('now', 'localtime')
FROM formas_pagamento fp
JOIN source
  ON source.grupo = fp.grupo
 AND source.subgrupo = fp.subgrupo
LEFT JOIN formas_pagamento_historico h
  ON h.forma_pagamento_id = fp.id
 AND h.vigente_ate IS NULL
WHERE h.id IS NULL;
