-- Migration: add_anexos_cliente
-- Adiciona tabela de anexos vinculados diretamente ao cliente (exames, prontuários externos, etc.)

CREATE TABLE IF NOT EXISTS anexos_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL, -- Quem fez upload
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL, -- ex: image/jpeg, application/pdf
  caminho TEXT NOT NULL, -- Chave no R2
  tamanho INTEGER NOT NULL, -- Tamanho em bytes
  descricao TEXT, -- Observação do atendente sobre o arquivo
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_anexos_cliente ON anexos_cliente(cliente_id);
