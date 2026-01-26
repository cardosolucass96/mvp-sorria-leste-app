// Tipos gerados pelo wrangler types
// Execute: npm run cf-typegen para gerar automaticamente

interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Service;
  ENVIRONMENT: string;
}
