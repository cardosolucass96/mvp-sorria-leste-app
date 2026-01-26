// =====================================================
// MÓDULO DE BANCO DE DADOS - SUPORTE D1 (CLOUDFLARE)
// =====================================================

import { getCloudflareContext } from '@opennextjs/cloudflare';

// Tipos D1
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

// Interface do ambiente Cloudflare
interface CloudflareEnv {
  DB: D1Database;
  [key: string]: unknown;
}

// Obter o banco D1 do contexto Cloudflare
export function getDb(): D1Database {
  const ctx = getCloudflareContext<CloudflareEnv>();
  return ctx.env.DB;
}

// Tipo de resultado para compatibilidade
export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

// ========================================
// FUNÇÕES DE QUERY ASSÍNCRONAS PARA D1
// ========================================

// Helper para executar queries que retornam múltiplos resultados
export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getDb();
  const stmt = db.prepare(sql);
  const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await boundStmt.all<T>();
  return result.results;
}

// Helper para executar query que retorna um único resultado
export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const db = getDb();
  const stmt = db.prepare(sql);
  const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;
  return await boundStmt.first<T>();
}

// Helper para executar insert/update/delete
export async function execute(sql: string, params: unknown[] = []): Promise<RunResult> {
  const db = getDb();
  const stmt = db.prepare(sql);
  const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;
  const result = await boundStmt.run();
  return {
    changes: result.meta.changes,
    lastInsertRowid: result.meta.last_row_id,
  };
}

// Helper para executar múltiplos statements em batch
export async function batch(statements: { sql: string; params?: unknown[] }[]): Promise<D1Result[]> {
  const db = getDb();
  const preparedStatements = statements.map(({ sql, params }) => {
    const stmt = db.prepare(sql);
    return params && params.length > 0 ? stmt.bind(...params) : stmt;
  });
  return await db.batch(preparedStatements);
}

// Helper para executar SQL raw (múltiplos statements - usado no schema)
export async function executeMany(sql: string): Promise<void> {
  const db = getDb();
  await db.exec(sql);
}

// Funções de compatibilidade (não necessárias no D1)
export function checkpoint(): void {
  // D1 não precisa de checkpoint
}

export function closeDb(): void {
  // D1 gerencia conexões automaticamente
}
