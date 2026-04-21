-- Adiciona coluna valor_original em itens_atendimento
-- Guarda o valor "de tabela" / de orçamento no momento da criação do item,
-- permitindo que o atendente edite `valor` (aplicando desconto mental)
-- e a UI calcule o desconto como `valor_original - valor`.

ALTER TABLE itens_atendimento ADD COLUMN valor_original REAL;

-- Backfill: itens existentes recebem valor_original = valor atual
-- (não têm histórico de edição, então o valor atual é também o original).
UPDATE itens_atendimento SET valor_original = valor WHERE valor_original IS NULL;
