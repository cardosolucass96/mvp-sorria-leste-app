import { execute, queryOne } from '@/lib/db';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';
import { SQLITE_UTC_NOW_EXPRESSION } from '@/lib/time';

interface SQLiteRow {
  name: string;
}

let termosDigitaisSchemaGarantido = false;

async function garantirTabelaTermosDigitais() {
  const tabelaExiste = await queryOne<SQLiteRow>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='termos_digitais'"
  );

  if (tabelaExiste?.name) return;

  await execute(`
    CREATE TABLE termos_digitais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      unidade_id INTEGER NOT NULL REFERENCES unidades(id),
      termo_id INTEGER REFERENCES termos(id) ON DELETE SET NULL,
      termo_slug TEXT NOT NULL,
      termo_titulo TEXT NOT NULL,
      signatario_nome TEXT NOT NULL,
      signatario_cpf TEXT,
      signatario_email TEXT,
      signatario_telefone TEXT,
      placeholders_json TEXT NOT NULL,
      html_renderizado TEXT NOT NULL,
      autentique_document_id TEXT NOT NULL UNIQUE,
      autentique_signature_public_id TEXT NOT NULL UNIQUE,
      autentique_short_link TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'criado' CHECK (status IN ('criado', 'visualizado', 'assinado', 'recusado', 'concluido')),
      pdf_assinado_url TEXT,
      viewed_at TEXT,
      signed_at TEXT,
      rejected_at TEXT,
      finished_at TEXT,
      created_by INTEGER REFERENCES usuarios(id),
      created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      updated_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION})
    )
  `);
}

async function garantirTabelaWebhookAutentique() {
  const tabelaExiste = await queryOne<SQLiteRow>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='autentique_webhook_events'"
  );

  if (tabelaExiste?.name) return;

  await execute(`
    CREATE TABLE autentique_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      object_id TEXT,
      termo_digital_id INTEGER REFERENCES termos_digitais(id) ON DELETE SET NULL,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      processed_at TEXT
    )
  `);
}

export async function garantirTermosDigitaisSchema() {
  if (termosDigitaisSchemaGarantido) return;

  await garantirTermosSchema();
  await garantirTabelaTermosDigitais();
  await garantirTabelaWebhookAutentique();

  await execute('CREATE INDEX IF NOT EXISTS idx_termos_digitais_cliente ON termos_digitais (cliente_id, created_at DESC)');
  await execute('CREATE INDEX IF NOT EXISTS idx_termos_digitais_status ON termos_digitais (status)');
  await execute('CREATE INDEX IF NOT EXISTS idx_termos_digitais_documento ON termos_digitais (autentique_document_id)');
  await execute('CREATE INDEX IF NOT EXISTS idx_termos_digitais_signature ON termos_digitais (autentique_signature_public_id)');
  await execute('CREATE INDEX IF NOT EXISTS idx_autentique_webhook_events_type ON autentique_webhook_events (event_type, received_at DESC)');

  termosDigitaisSchemaGarantido = true;
}
