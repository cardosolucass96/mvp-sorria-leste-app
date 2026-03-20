/**
 * Mock do banco de dados D1 para testes.
 * Usa um Map em memória para simular tabelas e queries SQL básicas.
 * 
 * Para testes de API, permite configurar retornos esperados para queries específicas.
 * Integra com o mock global de @opennextjs/cloudflare via __setMockDb / __setMockR2.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfMock = require('@opennextjs/cloudflare') as {
  __setMockDb: (db: unknown) => void;
  __setMockR2: (r2: unknown) => void;
  __resetMocks: () => void;
};

type MockRow = Record<string, unknown>;

interface MockQueryResult {
  results: MockRow[];
  success: boolean;
  meta: { duration: number; changes: number; last_row_id: number; rows_read: number; rows_written: number };
}

// Estado global do mock — resetado entre testes
let mockResponses: Map<string, MockRow[]> = new Map();
let lastInsertId = 0;
let executedQueries: { sql: string; params: unknown[] }[] = [];

/** Reseta todo o estado do mock DB */
export function resetMockDb() {
  mockResponses = new Map();
  lastInsertId = 0;
  executedQueries = [];
}

/** Configura o próximo retorno para uma query que contenha a substring dada */
export function mockQueryResponse(sqlSubstring: string, rows: MockRow[]) {
  mockResponses.set(sqlSubstring.toLowerCase(), rows);
}

/** Define o último ID inserido (para simular AUTO_INCREMENT) */
export function setLastInsertId(id: number) {
  lastInsertId = id;
}

/** Retorna todas as queries executadas (para assertions) */
export function getExecutedQueries() {
  return [...executedQueries];
}

/** Encontra o mock response que faz match com a SQL */
function findMockResponse(sql: string): MockRow[] {
  const sqlLower = sql.toLowerCase().trim();
  for (const [key, value] of mockResponses.entries()) {
    if (sqlLower.includes(key)) {
      return value;
    }
  }
  return [];
}

// Mock do D1PreparedStatement
function createMockStatement(sql: string, boundParams: unknown[] = []) {
  return {
    bind(...args: unknown[]) {
      return createMockStatement(sql, args);
    },
    async first<T = unknown>(): Promise<T | null> {
      executedQueries.push({ sql, params: boundParams });
      const rows = findMockResponse(sql);
      return (rows[0] as T) ?? null;
    },
    async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: MockQueryResult['meta'] }> {
      executedQueries.push({ sql, params: boundParams });
      const rows = findMockResponse(sql);
      return {
        results: rows as T[],
        success: true,
        meta: { duration: 0, changes: 0, last_row_id: lastInsertId, rows_read: rows.length, rows_written: 0 },
      };
    },
    async run(): Promise<MockQueryResult> {
      executedQueries.push({ sql, params: boundParams });
      return {
        results: [],
        success: true,
        meta: { duration: 0, changes: 1, last_row_id: lastInsertId, rows_read: 0, rows_written: 1 },
      };
    },
    async raw<T = unknown>(): Promise<T[]> {
      executedQueries.push({ sql, params: boundParams });
      return findMockResponse(sql) as T[];
    },
  };
}

/** Mock do D1Database completo */
export const mockDb = {
  prepare(sql: string) {
    return createMockStatement(sql);
  },
  async batch(statements: ReturnType<typeof createMockStatement>[]) {
    return statements.map(() => ({
      results: [],
      success: true,
      meta: { duration: 0, changes: 1, last_row_id: lastInsertId, rows_read: 0, rows_written: 1 },
    }));
  },
  async exec(_sql: string) {
    return { count: 0, duration: 0 };
  },
};

/** Mock do R2Bucket completo */
const r2Store = new Map<string, { body: Buffer; httpMetadata?: Record<string, string> }>();

export function resetR2Store() {
  r2Store.clear();
}

export const mockR2Bucket = {
  async put(key: string, value: unknown, options?: Record<string, unknown>) {
    const body = value instanceof Buffer ? value : Buffer.from(String(value));
    r2Store.set(key, { body, httpMetadata: options?.httpMetadata as Record<string, string> });
    return {
      key,
      version: '1',
      size: body.length,
      etag: 'mock-etag',
      httpEtag: '"mock-etag"',
      checksums: {},
      uploaded: new Date(),
      httpMetadata: options?.httpMetadata,
    };
  },
  async get(key: string) {
    const item = r2Store.get(key);
    if (!item) return null;
    return {
      key,
      version: '1',
      size: item.body.length,
      etag: 'mock-etag',
      httpEtag: '"mock-etag"',
      checksums: {},
      uploaded: new Date(),
      httpMetadata: item.httpMetadata,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(item.body);
          controller.close();
        },
      }),
      bodyUsed: false,
      async arrayBuffer() { return item.body.buffer.slice(item.body.byteOffset, item.body.byteOffset + item.body.byteLength); },
      async text() { return item.body.toString(); },
      async json<T>() { return JSON.parse(item.body.toString()) as T; },
      async blob() { return new Blob([item.body]); },
    };
  },
  async delete(keys: string | string[]) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach((k) => r2Store.delete(k));
  },
  async list(options?: { prefix?: string }) {
    const objects = [];
    for (const [key, item] of r2Store.entries()) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        objects.push({
          key,
          version: '1',
          size: item.body.length,
          etag: 'mock-etag',
          httpEtag: '"mock-etag"',
          checksums: {},
          uploaded: new Date(),
        });
      }
    }
    return { objects, truncated: false, delimitedPrefixes: [] };
  },
  async head(key: string) {
    const item = r2Store.get(key);
    if (!item) return null;
    return {
      key,
      version: '1',
      size: item.body.length,
      etag: 'mock-etag',
      httpEtag: '"mock-etag"',
      checksums: {},
      uploaded: new Date(),
      httpMetadata: item.httpMetadata,
    };
  },
};

/**
 * Configura o mock do @opennextjs/cloudflare para usar nosso mock DB e R2 configuráveis.
 * Chamar no beforeEach dos testes de API.
 */
export function setupCloudflareContextMock() {
  cfMock.__setMockDb(mockDb);
  cfMock.__setMockR2(mockR2Bucket);
}

/**
 * Restaura os mocks padrão do @opennextjs/cloudflare.
 * Chamar no afterEach dos testes de API.
 */
export function teardownCloudflareContextMock() {
  cfMock.__resetMocks();
}
