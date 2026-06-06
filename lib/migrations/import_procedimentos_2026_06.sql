-- Importa tabela de procedimentos enviada em 2026-06
-- Estratégia:
-- 1. Atualiza procedimentos equivalentes já existentes
-- 2. Desativa o "Canal" genérico em favor das variações por dente
-- 3. Insere os demais procedimentos ausentes
--
-- Convenções:
-- categoria_id 1 = Execução
-- categoria_id 2 = Ortodontia

UPDATE procedimentos
SET ativo = 0
WHERE nome = 'Canal';

UPDATE procedimentos
SET nome = 'Enxerto',
    descricao = NULL,
    valor = 800,
    ativo = 1,
    por_dente = 1,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Enxerto Ósseo';

UPDATE procedimentos
SET nome = 'Extração de Decíduo',
    descricao = NULL,
    valor = 80,
    ativo = 1,
    por_dente = 1,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Extração de Dente Decíduo (de leite)';

UPDATE procedimentos
SET nome = 'Extração Normal',
    descricao = NULL,
    valor = 120,
    ativo = 1,
    por_dente = 1,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Extração de Dente Permanente';

UPDATE procedimentos
SET nome = 'Limpeza Completa',
    descricao = NULL,
    valor = 100,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Limpeza';

UPDATE procedimentos
SET nome = 'Tratamento Periodontal',
    descricao = NULL,
    valor = 200,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Tratamento Periodontal (Supra + Sub gengival)';

UPDATE procedimentos
SET nome = 'Manutenção Autoligado',
    descricao = NULL,
    valor = 210,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 2
WHERE nome = 'Manutenção Aparelho Autoligado';

UPDATE procedimentos
SET nome = 'Manutenção 2',
    descricao = NULL,
    valor = 70,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 2
WHERE nome = 'Manutenção Aparelho Completa';

UPDATE procedimentos
SET nome = 'Manutenção 1',
    descricao = 'Somente manutenção',
    valor = 50,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 2
WHERE nome = 'Manutenção Aparelho Simples';

UPDATE procedimentos
SET descricao = 'Por arcada',
    valor = 500,
    ativo = 1,
    por_dente = 0,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Prótese Total';

UPDATE procedimentos
SET descricao = NULL,
    valor = 60,
    ativo = 1,
    por_dente = 1,
    tem_face = 1,
    categoria_id = 1
WHERE nome = 'Restauração Classe 2';

UPDATE procedimentos
SET descricao = NULL,
    valor = 100,
    ativo = 1,
    por_dente = 1,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Restauração Estética';

UPDATE procedimentos
SET descricao = NULL,
    valor = 2000,
    ativo = 1,
    por_dente = 1,
    tem_face = 0,
    categoria_id = 1
WHERE nome = 'Implante';

WITH novos(nome, descricao, valor, ativo, por_dente, tem_face, categoria_id) AS (
  VALUES
    ('Canal Molar', NULL, 550, 1, 1, 0, 1),
    ('Canal Pré-Molar', NULL, 350, 1, 1, 0, 1),
    ('Canal Incisivo', NULL, 300, 1, 1, 0, 1),
    ('Retratamento Canal Molar', NULL, 500, 1, 1, 0, 1),
    ('Retratamento Canal Incisivo', NULL, 300, 1, 1, 0, 1),
    ('Retratamento Canal Pré-Molar', NULL, 400, 1, 1, 0, 1),
    ('Retratamento + Canal Molar', NULL, 800, 1, 1, 0, 1),
    ('Retratamento + Canal Pré-Molar', NULL, 600, 1, 1, 0, 1),
    ('Retratamento + Canal Incisivo/Canino', NULL, 500, 1, 1, 0, 1),
    ('Prótese PPR', 'Por arcada', 600, 1, 0, 0, 1),
    ('Ponte Móvel', 'Por arcada', 500, 1, 0, 0, 1),
    ('Prótese Flex', 'Por arcada', 800, 1, 0, 0, 1),
    ('Ponte Móvel (Dente Importado)', 'Por arcada', 700, 1, 0, 0, 1),
    ('Ponte Móvel (Dente Importado + Gengiva Caracterizada)', 'Por arcada', 850, 1, 0, 0, 1),
    ('PT (Dente Importado)', 'Por arcada', 850, 1, 0, 0, 1),
    ('PT (Dente Importado + Gengiva Caracterizada)', 'Por arcada', 1000, 1, 0, 0, 1),
    ('Restauração Classe 1', NULL, 50, 1, 1, 1, 1),
    ('Restauração Classe 3', NULL, 70, 1, 1, 1, 1),
    ('Restauração Decíduo', NULL, 60, 1, 1, 0, 1),
    ('Gengivoplastia', 'Por arcada', 250, 1, 0, 0, 1),
    ('Remoção de Tártaro', NULL, 50, 1, 0, 0, 1),
    ('Aumento de Coroa', NULL, 200, 1, 1, 0, 1),
    ('Extração de Siso', NULL, 200, 1, 1, 0, 1),
    ('Faceta', NULL, 200, 1, 1, 0, 1),
    ('Faceta Dentária Resina Forma', 'Faixa sugerida: 180,00 a 200,00.', 180, 1, 1, 0, 1),
    ('Faceta Dentária Resina Estelite ou Palfique', NULL, 250, 1, 1, 0, 1),
    ('Reconstrução', NULL, 150, 1, 1, 0, 1),
    ('Placa Bruxismo', NULL, 400, 1, 0, 0, 1),
    ('Clareamento', 'Por sessão', 200, 1, 0, 0, 1),
    ('Clareamento Caseiro', '2 bisnagas', 350, 1, 0, 0, 1),
    ('Selante', 'Por dente', 50, 1, 1, 0, 1),
    ('Coroa Metal', NULL, 750, 1, 1, 0, 1),
    ('Coroa Porcelana', NULL, 1200, 1, 1, 0, 1),
    ('Coroa Provisória em Resina', NULL, 250, 1, 1, 0, 1),
    ('Coroa Provisória em Cerômero', NULL, 400, 1, 1, 0, 1),
    ('Pino', NULL, 150, 1, 1, 0, 1),
    ('Bloco', NULL, 300, 1, 1, 0, 1),
    ('Botox 3 Regiões', NULL, 700, 1, 0, 0, 1),
    ('Preenchimento', NULL, 900, 1, 0, 0, 1),
    ('Ácido Hialurônico', NULL, 1200, 1, 0, 0, 1),
    ('Cirurgia Implante Guiada', NULL, 2600, 1, 1, 0, 1),
    ('Implante + Exo + Enxerto', '2000+100+500', 2600, 1, 1, 0, 1),
    ('Tracionamento Dentário', NULL, 550, 1, 1, 0, 2),
    ('Frenectomia Lingual', NULL, 500, 1, 0, 0, 1),
    ('Cirurgia Levantamento de Seio', NULL, 2500, 1, 0, 0, 1),
    ('Pacote Orto Semestral', '6 manutenções + 6 limpezas completas; parcelável em 6x', 300, 1, 0, 0, 2),
    ('Pacote Orto Anual', '12 manutenções + 12 limpezas completas + 1 sessão de clareamento; parcelável em 12x', 600, 1, 0, 0, 2),
    ('Aparelho Autoligado', 'Manutenção inclusa', 1000, 1, 0, 0, 2)
)
INSERT INTO procedimentos (
  nome,
  descricao,
  valor,
  ativo,
  por_dente,
  tem_face,
  categoria_id
)
SELECT
  novos.nome,
  novos.descricao,
  novos.valor,
  novos.ativo,
  novos.por_dente,
  novos.tem_face,
  novos.categoria_id
FROM novos
WHERE NOT EXISTS (
  SELECT 1
  FROM procedimentos
  WHERE procedimentos.nome = novos.nome
);
