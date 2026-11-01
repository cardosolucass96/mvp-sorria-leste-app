import { execFileSync } from 'node:child_process';
import { financialMigrations } from './refactor-schema.mjs';

// Destino fixo; este utilitário não aceita nome de banco/ambiente de produção.
function wrangler(args) {
  return execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js','d1','execute',
    'sorria-leste-db-refactor','--env','refactor','--remote','--json',...args], { encoding:'utf8',maxBuffer:16*1024*1024 });
}
const sql = command => JSON.parse(wrangler(['--command',command]));
const mode = process.argv[2] || 'verify';
if (!['apply','verify','enable','disable'].includes(mode)) throw new Error('Use apply, verify, enable UNIDADE ou disable UNIDADE. Apenas refactor.');
if (mode === 'apply') sql('CREATE TABLE IF NOT EXISTS financeiro_migracoes(nome TEXT PRIMARY KEY, sha256 TEXT NOT NULL, aplicada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const applied = sql('SELECT nome,sha256 FROM financeiro_migracoes')[0].results;
for (const migration of financialMigrations) {
  const previous = applied.find(row=>row.nome === migration.name);
  if (previous && previous.sha256 !== migration.hash) throw new Error(`Migração já aplicada foi alterada: ${migration.name}`);
  if (!previous) {
    if (mode !== 'apply') throw new Error(`Migração pendente: ${migration.name}. Execute migrate:refactor antes de publicar.`);
    wrangler(['--file',migration.file]);
    sql(`INSERT INTO financeiro_migracoes(nome,sha256) VALUES ('${migration.name}','${migration.hash}')`);
  }
}
if (['enable','disable'].includes(mode)) {
  const unit = Number(process.argv[3]);
  if (!Number.isSafeInteger(unit) || unit <= 0) throw new Error('Informe uma unidade válida.');
  if (!sql(`SELECT id FROM unidades WHERE id=${unit}`)[0].results.length) throw new Error('Unidade inexistente.');
  sql(`INSERT INTO financeiro_configuracao(unidade_id,creditos_rastreaveis) VALUES (${unit},${mode==='enable'?1:0})
    ON CONFLICT(unidade_id) DO UPDATE SET creditos_rastreaveis=excluded.creditos_rastreaveis`);
}
console.log(JSON.stringify({ environment:'refactor', migrations:financialMigrations.map(({name,hash})=>({name,hash})), mode }));
