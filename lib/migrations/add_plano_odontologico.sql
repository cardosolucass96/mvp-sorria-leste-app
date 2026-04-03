-- Adiciona campo plano_odontologico (opcional) na tabela de clientes
ALTER TABLE clientes ADD COLUMN plano_odontologico TEXT CHECK (plano_odontologico IN ('Clin', 'Prime', 'OdontoArt'));
