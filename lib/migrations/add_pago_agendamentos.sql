-- Migration: add pago column to agendamentos
-- Tracks whether an item was already paid before being deferred to the agenda
ALTER TABLE agendamentos ADD COLUMN pago INTEGER NOT NULL DEFAULT 0;
