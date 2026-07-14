-- Normaliza timestamps legados do financeiro para UTC ISO 8601 com Z.
-- Idempotente: so toca linhas no formato "YYYY-MM-DD HH:MM:SS".

UPDATE pagamentos
SET created_at = replace(TRIM(created_at), ' ', 'T') || 'Z'
WHERE created_at LIKE '% %'
  AND created_at NOT LIKE '%T%';

UPDATE pagamentos_grupos
SET created_at = replace(TRIM(created_at), ' ', 'T') || 'Z'
WHERE created_at LIKE '% %'
  AND created_at NOT LIKE '%T%';

UPDATE pagamentos_alocacoes
SET created_at = replace(TRIM(created_at), ' ', 'T') || 'Z'
WHERE created_at LIKE '% %'
  AND created_at NOT LIKE '%T%';

UPDATE comissoes
SET created_at = replace(TRIM(created_at), ' ', 'T') || 'Z'
WHERE created_at LIKE '% %'
  AND created_at NOT LIKE '%T%';
