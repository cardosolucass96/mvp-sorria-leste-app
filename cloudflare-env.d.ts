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
  AUTENTIQUE_FOLDER_ID_VILA_UNIAO?: string;
  AUTENTIQUE_FOLDER_ID_BARRA_DO_CEARA?: string;
  AUTENTIQUE_FOLDER_ID_PIRAMBU?: string;
  APP_BASE_URL?: string;
}
