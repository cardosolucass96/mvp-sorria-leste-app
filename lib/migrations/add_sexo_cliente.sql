-- Adiciona campo sexo (opcional) na tabela de clientes
ALTER TABLE clientes ADD COLUMN sexo TEXT CHECK (sexo IN ('masculino', 'feminino', 'outro'));
