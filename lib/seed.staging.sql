-- Seed mínimo e idempotente do ambiente staging.
-- Não contém dados de produção.

INSERT OR IGNORE INTO unidades (id, nome, ativo)
VALUES
  (1, 'Barra do Ceará', 1),
  (2, 'Vila União', 1),
  (3, 'Pirambu', 1);

INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id)
SELECT id, 1
FROM usuarios;

INSERT OR IGNORE INTO usuario_roles (usuario_id, role)
SELECT id, role
FROM usuarios;
