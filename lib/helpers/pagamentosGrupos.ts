import { execute, query, queryOne } from '@/lib/db';

interface SQLiteTabela {
  name: string;
}

interface SQLiteColuna {
  name: string;
}

let estruturaPronta = false;

export async function garantirEsquemaPagamentosGrupos() {
  if (estruturaPronta) return;

  const tabelaExiste = await queryOne<SQLiteTabela>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pagamentos_grupos'"
  );

  await execute(`
    CREATE TABLE IF NOT EXISTS pagamentos_grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atendimento_id INTEGER NOT NULL,
      recebido_por_id INTEGER NOT NULL,
      valor_total REAL NOT NULL,
      observacoes TEXT,
      cancelado INTEGER NOT NULL DEFAULT 0,
      motivo_cancelamento TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
      FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
    )
  `);
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_pagamentos_grupos_atendimento ON pagamentos_grupos(atendimento_id)'
  );

  const colunas = await query<SQLiteColuna>('PRAGMA table_info(pagamentos)');
  const temPagamentoGrupoId = colunas.some((coluna) => coluna.name === 'pagamento_grupo_id');

  if (!temPagamentoGrupoId) {
    await execute(
      'ALTER TABLE pagamentos ADD COLUMN pagamento_grupo_id INTEGER REFERENCES pagamentos_grupos(id)'
    );
  }

  await execute(
    'CREATE INDEX IF NOT EXISTS idx_pagamentos_pagamento_grupo ON pagamentos(pagamento_grupo_id)'
  );

  if (!tabelaExiste?.name) {
    console.warn('[MIGRATION] Tabela pagamentos_grupos foi criada automaticamente para recuperar deploy sem migration.');
  } else if (!temPagamentoGrupoId) {
    console.warn('[MIGRATION] Coluna pagamentos.pagamento_grupo_id foi adicionada automaticamente.');
  }

  estruturaPronta = true;
}
