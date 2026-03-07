/**
 * Mock do @opennextjs/cloudflare para testes Jest
 * O D1 não está disponível no ambiente de testes local
 */

const mockPreparedStatement = {
  bind: function (..._args: unknown[]) {
    return mockPreparedStatement;
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

const mockDb = {
  prepare: () => mockPreparedStatement,
  batch: async () => [],
  exec: async () => ({ count: 0, duration: 0 }),
};

const mockR2Bucket = {
  put: async () => ({}),
  get: async () => null,
  delete: async () => {},
  list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
  head: async () => null,
};

export function getCloudflareContext() {
  return {
    env: {
      DB: mockDb,
      R2_BUCKET: mockR2Bucket,
    },
  };
}
