import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const financialMigrations = readdirSync('lib/migrations/financeiro').filter(name=>name.endsWith('.sql')).sort().map(name=>({
  name, file: `lib/migrations/financeiro/${name}`,
  hash: createHash('sha256').update(readFileSync(`lib/migrations/financeiro/${name}`)).digest('hex'),
}));
export function refactorSchemaHash() {
  const hash = createHash('sha256').update(readFileSync('lib/schema.sql'));
  for (const migration of financialMigrations) hash.update(migration.name).update(migration.hash);
  return hash.digest('hex');
}
