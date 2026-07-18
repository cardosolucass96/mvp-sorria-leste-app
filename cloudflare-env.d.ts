// Tipos gerados pelo wrangler types
// Execute: npm run cf-typegen para gerar automaticamente

interface CloudflareEnv {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Service;
  ENVIRONMENT: string;
  AUTENTIQUE_API_TOKEN?: string;
  AUTENTIQUE_WEBHOOK_SECRET?: string;
  APP_BASE_URL?: string;
}
