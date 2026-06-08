import { execute, query } from '@/lib/db';

interface SQLiteColumn {
  name: string;
}

let schemaUsuariosGarantido = false;

export async function garantirSchemaUsuariosValorDiaria() {
  if (schemaUsuariosGarantido) return;

  const colunasUsuarios = await query<SQLiteColumn>('PRAGMA table_info(usuarios)');
  const temValorDiaria = colunasUsuarios.some((coluna) => coluna.name === 'valor_diaria');

  if (!temValorDiaria) {
    await execute('ALTER TABLE usuarios ADD COLUMN valor_diaria REAL NOT NULL DEFAULT 0');
    console.warn('[MIGRATION] Coluna usuarios.valor_diaria foi adicionada automaticamente.');
  }

  schemaUsuariosGarantido = true;
}
