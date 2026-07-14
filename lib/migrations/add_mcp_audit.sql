-- Auditoria mínima do MCP: não armazena payloads, CPF, senha ou conteúdo clínico.
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  client_id TEXT,
  ferramenta TEXT NOT NULL,
  unidade_id INTEGER,
  sucesso INTEGER NOT NULL CHECK (sucesso IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_usuario_created
  ON mcp_audit_log (usuario_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_ferramenta_created
  ON mcp_audit_log (ferramenta, created_at);
