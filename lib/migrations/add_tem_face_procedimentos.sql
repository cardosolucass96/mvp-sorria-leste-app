-- Adiciona coluna tem_face em procedimentos.
-- Indica se a seleção de faces do dente é obrigatória para procedimentos por_dente.
-- Ex: Restauração tem_face=1 (escolhe dente E face), Canal tem_face=0 (só dente).
ALTER TABLE procedimentos ADD COLUMN tem_face INTEGER NOT NULL DEFAULT 0;
