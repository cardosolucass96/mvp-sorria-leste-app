#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const useRemote = args.includes('--remote');
const useLocal = args.includes('--local');

if (!useRemote && !useLocal) {
  console.error('Use --remote para produção ou --local para ambiente local.');
  process.exit(1);
}
if (useRemote && useLocal) {
  console.error('Use apenas uma das flags: --remote ou --local.');
  process.exit(1);
}

const DB_NAME = 'sorria-leste-db';
const OUTPUT_ROOT = path.resolve(process.cwd(), 'artifacts', 'followup-limpeza');
const modeLabel = useRemote ? 'remote' : 'local';
const actionLabel = applyChanges ? 'apply' : 'dry-run';
const OUTPUT_SUMMARY = path.join(OUTPUT_ROOT, `limpeza-followup.${modeLabel}.${actionLabel}.json`);
const OUTPUT_SQL = path.join(OUTPUT_ROOT, `limpeza-followup.${modeLabel}.${actionLabel}.sql`);

const KEEP_PREFIXES = ['Motivo legado:', 'Consultor legado:'];
const REMOVE_PREFIXES = [
  'Criado por legado:',
  'Alterado por legado:',
  'Código legado:',
  'Tipo legado:',
  'Tipo registro legado:',
  'Ativo legado:',
];

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Nao foi possivel interpretar JSON do wrangler: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function queryD1(command) {
  const commandArgs = ['wrangler', 'd1', 'execute', DB_NAME, '--json', '--command', command];
  if (useRemote) commandArgs.push('--remote');
  if (useLocal) commandArgs.push('--local');

  const raw = execFileSync('npx', commandArgs, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const parsed = safeJsonParse(raw);
  return Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results)
    ? parsed[0].results
    : [];
}

function executeSqlFile(filePath) {
  const commandArgs = ['wrangler', 'd1', 'execute', DB_NAME, '--file', filePath];
  if (useRemote) commandArgs.push('--remote');
  if (useLocal) commandArgs.push('--local');

  execFileSync('npx', commandArgs, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
}

function escapeSql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isLegacyMetaLine(line) {
  const trimmed = String(line).trim();
  return REMOVE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function shouldKeepLine(line) {
  return KEEP_PREFIXES.some((prefix) => String(line).trim().startsWith(prefix));
}

function cleanDescricao(descricao) {
  if (!descricao) return '';

  const lines = String(descricao).replace(/\r\n/g, '\n').split('\n');
  const filtered = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isLegacyMetaLine(line))
    .filter((line) => {
      if (shouldKeepLine(line)) return true;
      return true;
    });

  return filtered.join('\n');
}

function main() {
  const rows = queryD1(
    `SELECT id, descricao FROM followup_tarefas
     WHERE descricao IS NOT NULL
       AND (
         descricao LIKE '%Motivo legado:%'
         OR descricao LIKE '%Consultor legado:%'
         OR descricao LIKE '%Criado por legado:%'
         OR descricao LIKE '%Alterado por legado:%'
         OR descricao LIKE '%Código legado:%'
         OR descricao LIKE '%Tipo legado:%'
         OR descricao LIKE '%Tipo registro legado:%'
         OR descricao LIKE '%Ativo legado:%'
       )`
  );

  const changed = [];

  for (const row of rows) {
    const cleaned = cleanDescricao(row.descricao);
    const original = String(row.descricao).replace(/\r\n/g, '\n').trim();
    if (cleaned !== original) {
      changed.push({
        id: row.id,
        before: row.descricao,
        after: cleaned,
      });
    }
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(
    OUTPUT_SUMMARY,
    JSON.stringify(
      {
        total: rows.length,
        alterados: changed.length,
        itens: changed,
      },
      null,
      2
    )
  );

  if (changed.length === 0) {
    console.log('Nenhuma descricao para ajuste foi encontrada.');
    return;
  }

  const statements = changed.map(
    ({ id, after }) => `UPDATE followup_tarefas SET descricao = ${escapeSql(after)} WHERE id = ${Number(id)};`
  );
  const chunkSize = 200;
  const chunks = [];
  for (let index = 0; index < statements.length; index += chunkSize) {
    chunks.push(statements.slice(index, index + chunkSize));
  }

  fs.writeFileSync(OUTPUT_SQL, `${statements.join('\n')}\n`);

  console.log(`Encontradas ${changed.length} descricoes para ajuste em ${rows.length} registros analisados.`);
  console.log(`Resumo: ${OUTPUT_SUMMARY}`);
  console.log(`SQL gerado: ${OUTPUT_SQL}`);

  if (!applyChanges) {
    console.log('Dry-run concluido. Use --apply para executar as atualizacoes.');
    return;
  }

  for (const chunk of chunks) {
    const tempSql = path.join(OUTPUT_ROOT, `${path.basename(OUTPUT_SQL, '.sql')}.${Date.now()}.chunk.sql`);
    fs.writeFileSync(tempSql, `${chunk.join('\n')}\n`);
    executeSqlFile(tempSql);
    fs.unlinkSync(tempSql);
  }

  console.log('Atualizacoes concluidas.');
}

main();
