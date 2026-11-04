import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) {
  console.error('Uso: node scripts/prepare-google-calendar-secrets.mjs /caminho/client_secret.json');
  process.exit(1);
}
const { web } = JSON.parse(await readFile(path.resolve(source), 'utf8'));
const callback = 'https://app.sorrialeste.com.br/api/integracoes/google/callback';
if (!web?.client_id || !web?.client_secret || !web.redirect_uris?.includes(callback)) {
  throw new Error('Credencial Web inválida ou callback de produção não cadastrado.');
}
const directory = path.join(root, 'tmp');
const destination = path.join(directory, 'google-calendar.secrets.json');
await mkdir(directory, { recursive: true, mode: 0o700 });
let previous;
try { previous = JSON.parse(await readFile(destination, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
// Reuse the key: replacing it would make tokens already stored in D1 unreadable.
const encryptionKey = previous?.GOOGLE_TOKEN_ENCRYPTION_KEY ?? randomBytes(32).toString('base64');
if (Buffer.from(encryptionKey, 'base64').length !== 32) throw new Error('Chave de criptografia existente inválida.');
await writeFile(destination, JSON.stringify({ GOOGLE_CLIENT_ID: web.client_id, GOOGLE_CLIENT_SECRET: web.client_secret,
  GOOGLE_TOKEN_ENCRYPTION_KEY: encryptionKey }, null, 2) + '\n', { mode: 0o600 });
await chmod(destination, 0o600);
console.log('Arquivo de segredos preparado em tmp/google-calendar.secrets.json (ignorado pelo Git, acesso restrito).');
console.log('Não alterou a Cloudflare. Antes da ativação: aplicar lib/migrations/add_google_calendar_sync.sql, criar a fila sorria-leste-google-calendar e sua DLQ, publicar os dois Workers com os mesmos segredos e habilitar GOOGLE_CALENDAR_ENABLED nos dois.');
