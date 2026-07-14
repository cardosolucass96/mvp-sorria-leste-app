import { execute, query, queryOne } from '@/lib/db';
import { SQLITE_UTC_NOW_EXPRESSION } from '@/lib/time';

interface SQLiteRow {
  name: string;
}

interface SQLiteColumn {
  name: string;
}

let termosSchemaGarantido = false;

export async function garantirTermosSchema() {
  if (termosSchemaGarantido) return;

  const tabelaExiste = await queryOne<SQLiteRow>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='termos'"
  );

  if (!tabelaExiste?.name) {
    await execute(`
      CREATE TABLE termos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        conteudo_html TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
        updated_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
        FOREIGN KEY (created_by) REFERENCES usuarios (id),
        FOREIGN KEY (updated_by) REFERENCES usuarios (id)
      )
    `);
    await execute('CREATE INDEX IF NOT EXISTS idx_termos_ativo ON termos (ativo)');
    await execute('CREATE INDEX IF NOT EXISTS idx_termos_titulo ON termos (titulo)');
    termosSchemaGarantido = true;
    return;
  }

  const colunas = await query<SQLiteColumn>('PRAGMA table_info(termos)');
  const temAtivo = colunas.some((coluna) => coluna.name === 'ativo');
  const temCreatedBy = colunas.some((coluna) => coluna.name === 'created_by');
  const temUpdatedBy = colunas.some((coluna) => coluna.name === 'updated_by');

  if (!temAtivo) {
    await execute('ALTER TABLE termos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1');
  }

  if (!temCreatedBy) {
    await execute('ALTER TABLE termos ADD COLUMN created_by INTEGER REFERENCES usuarios(id)');
  }

  if (!temUpdatedBy) {
    await execute('ALTER TABLE termos ADD COLUMN updated_by INTEGER REFERENCES usuarios(id)');
  }

  await execute(`
    CREATE INDEX IF NOT EXISTS idx_termos_ativo ON termos (ativo)
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_termos_titulo ON termos (titulo)
  `);

  termosSchemaGarantido = true;
}
