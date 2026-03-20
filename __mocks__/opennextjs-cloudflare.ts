/**
 * Mock CONFIGURÁVEL do @opennextjs/cloudflare para testes Jest.
 *
 * Por padrão retorna resultados vazios (retrocompatível com testes static-analysis).
 * Para testes de API, use __setMockDb / __setMockR2 para injetar mocks configuráveis.
 */

// ── Default static mock (retrocompatível) ──────────────────────────

const defaultPreparedStatement = {
  bind: function (..._args: unknown[]) {
    return defaultPreparedStatement;
  },
  first: async () => null,
  all: async () => ({
    results: [],
    success: true,
    meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 },
  }),
  run: async () => ({
    results: [],
    success: true,
    meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 },
  }),
  raw: async () => [],
};

const defaultDb = {
  prepare: () => defaultPreparedStatement,
  batch: async () => [],
  exec: async () => ({ count: 0, duration: 0 }),
};

const defaultR2Bucket = {
  put: async () => ({}),
  get: async () => null,
  delete: async () => {},
  list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
  head: async () => null,
};

// ── Mutable state — testes de API podem trocar ──────────────────────

let _currentDb: unknown = defaultDb;
let _currentR2: unknown = defaultR2Bucket;

/** Injeta um mock DB customizado (ex: o mockDb de db-mock.ts) */
export function __setMockDb(db: unknown) {
  _currentDb = db;
}

/** Injeta um mock R2 customizado (ex: o mockR2Bucket de db-mock.ts) */
export function __setMockR2(r2: unknown) {
  _currentR2 = r2;
}

/** Restaura os mocks padrão (chamar no afterEach) */
export function __resetMocks() {
  _currentDb = defaultDb;
  _currentR2 = defaultR2Bucket;
}

// ── Exported function (usada pelo lib/db.ts) ────────────────────────

export function getCloudflareContext() {
  return {
    env: {
      DB: _currentDb,
      R2_BUCKET: _currentR2,
    },
  };
}
