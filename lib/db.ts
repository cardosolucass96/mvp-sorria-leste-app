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
// Interface R2
export interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions): Promise<R2Object>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  head(key: string): Promise<R2Object | null>;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2GetOptions {
  range?: { offset?: number; length?: number; suffix?: number };
}

export interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  uploaded: Date;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}

export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
  sha384?: ArrayBuffer;
  sha512?: ArrayBuffer;
}

interface CloudflareEnv {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  [key: string]: unknown;
}

// Obter o banco D1 do contexto Cloudflare
export function getDb(): D1Database {
  const ctx = getCloudflareContext<CloudflareEnv>();
  return ctx.env.DB;
}

// Obter o bucket R2 do contexto Cloudflare
export function getR2Bucket(): R2Bucket {
  const ctx = getCloudflareContext<CloudflareEnv>();
  return ctx.env.R2_BUCKET;
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
