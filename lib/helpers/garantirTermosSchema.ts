import { execute, query, queryOne } from '@/lib/db';
import { TERMOS_CANONICOS_IMPLANTE } from '@/lib/helpers/termosCanonicos';
import { SQLITE_UTC_NOW_EXPRESSION } from '@/lib/time';

interface SQLiteRow {
  name: string;
}

interface SQLiteColumn {
  name: string;
}

let termosSchemaGarantido = false;

async function sincronizarTermosCanonicosImplante() {
  for (const termo of TERMOS_CANONICOS_IMPLANTE) {
    await execute(
      `INSERT INTO termos (
        slug,
        titulo,
        conteudo_html,
        ativo,
        permite_autentique,
        created_by,
        updated_by
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(slug) DO UPDATE SET
        titulo = excluded.titulo,
        conteudo_html = excluded.conteudo_html,
        ativo = excluded.ativo,
        permite_autentique = excluded.permite_autentique,
        updated_at = (${SQLITE_UTC_NOW_EXPRESSION})`,
      [
        termo.slug,
        termo.titulo,
        termo.conteudoHtml,
        termo.ativo,
        termo.permiteAutentique,
      ]
    );
  }
}

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
        permite_autentique INTEGER NOT NULL DEFAULT 1,
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
    await sincronizarTermosCanonicosImplante();
    termosSchemaGarantido = true;
    return;
  }

  const colunas = await query<SQLiteColumn>('PRAGMA table_info(termos)');
  const temAtivo = colunas.some((coluna) => coluna.name === 'ativo');
  const temPermiteAutentique = colunas.some((coluna) => coluna.name === 'permite_autentique');
  const temCreatedBy = colunas.some((coluna) => coluna.name === 'created_by');
  const temUpdatedBy = colunas.some((coluna) => coluna.name === 'updated_by');

  if (!temAtivo) {
    await execute('ALTER TABLE termos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1');
  }

  if (!temPermiteAutentique) {
    await execute('ALTER TABLE termos ADD COLUMN permite_autentique INTEGER NOT NULL DEFAULT 1');
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

  await sincronizarTermosCanonicosImplante();

  termosSchemaGarantido = true;
}
