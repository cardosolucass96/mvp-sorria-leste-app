-- =====================================================
-- MIGRAÇÃO: Valor de diária por usuário
-- =====================================================

-- 1) Adiciona campo de valor de diária na tabela usuarios (fallback diário por profissional)
ALTER TABLE usuarios ADD COLUMN valor_diaria REAL NOT NULL DEFAULT 0;

