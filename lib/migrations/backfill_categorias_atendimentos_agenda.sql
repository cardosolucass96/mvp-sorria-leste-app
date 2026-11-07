-- Recupera apenas atendimentos da agenda que ainda não têm fila.
-- Procedimentos sem categoria seguem a fila geral; categorias já definidas são preservadas.
WITH padrao AS (
  SELECT id FROM categorias WHERE slug = 'geral' AND ativo = 1
), pendentes AS (
  SELECT id, agendamento_id, unidade_id FROM atendimentos
  WHERE categoria_id IS NULL AND agendamento_id IS NOT NULL
), categorias_itens AS (
  SELECT DISTINCT a.id AS atendimento_id, COALESCE(p.categoria_id, padrao.id) AS categoria_id
  FROM pendentes a
  JOIN itens_atendimento i ON i.atendimento_id = a.id
  JOIN procedimentos p ON p.id = i.procedimento_id
  CROSS JOIN padrao
), categorias_agenda AS (
  SELECT a.id AS atendimento_id,
         COALESCE(p.categoria_id, origem.categoria_id, padrao.id) AS categoria_id
  FROM pendentes a
  JOIN agendamentos ag ON ag.id = a.agendamento_id AND ag.unidade_id = a.unidade_id
  LEFT JOIN procedimentos p ON p.id = ag.procedimento_id
  LEFT JOIN atendimentos origem ON origem.id = ag.atendimento_origem_id AND origem.unidade_id = a.unidade_id
  CROSS JOIN padrao
  WHERE NOT EXISTS (SELECT 1 FROM itens_atendimento i WHERE i.atendimento_id = a.id)
), candidatas AS (
  SELECT * FROM categorias_itens
  UNION
  SELECT * FROM categorias_agenda
), agrupadas AS (
  SELECT atendimento_id, MIN(categoria_id) AS categoria_id
  FROM candidatas
  GROUP BY atendimento_id
  HAVING COUNT(DISTINCT categoria_id) = 1
), resolvidas AS (
  SELECT a.atendimento_id, a.categoria_id FROM agrupadas a
  JOIN categorias c ON c.id = a.categoria_id AND c.ativo = 1
)
UPDATE atendimentos
SET categoria_id = (SELECT r.categoria_id FROM resolvidas r WHERE r.atendimento_id = atendimentos.id)
WHERE categoria_id IS NULL
  AND id IN (SELECT atendimento_id FROM resolvidas);
