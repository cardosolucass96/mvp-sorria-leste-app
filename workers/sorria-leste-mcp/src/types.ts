import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  /** Lista de e-mails autorizados a conectar o MCP, separada por vírgula. */
  MCP_ALLOWED_EMAILS: string;
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
