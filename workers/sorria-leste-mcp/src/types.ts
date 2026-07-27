import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface WorkerExecutionContext<Props = unknown> {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props?: Props;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
  run<T = Record<string, unknown>>(): Promise<{
    results?: T[];
    success?: boolean;
    meta?: { last_row_id?: number; changes?: number } & Record<string, unknown>;
  }>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results?: T[] }>>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface KVNamespace {
  get(key: string, options?: unknown): Promise<string | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: unknown,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  /** Lista de e-mails autorizados a conectar o MCP, separada por vírgula. */
  MCP_ALLOWED_EMAILS: string;
  /** Lista de e-mails autorizados a usar escrita MCP mínima, separada por vírgula. */
  MCP_WRITE_ALLOWED_EMAILS: string;
  /** API key server-to-server para integrações SDR, como n8n. */
  SDR_API_KEY: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

export interface OAuthProps {
  userId: number;
  email: string;
  clientId: string;
  scope: string[];
}

export interface AppUser {
  id: number;
  nome: string;
  email: string;
  role: string;
  ativo: number;
}

export interface Identity extends AppUser {
  unidadeIds: number[];
  scope: string[];
  clientId: string;
}
