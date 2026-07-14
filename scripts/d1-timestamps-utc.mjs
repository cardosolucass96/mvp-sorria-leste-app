#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CLINIC_UTC_OFFSET_MINUTES = -3 * 60;
const DEFAULT_DB = 'sorria-leste-db';

const COLUMN_SPECS = [
  { table: 'usuarios', kind: 'utc', columns: ['created_at'] },
  { table: 'usuario_roles', kind: 'utc', columns: ['created_at'] },
  { table: 'categorias', kind: 'utc', columns: ['created_at'] },
  { table: 'categoria_roles', kind: 'utc', columns: ['created_at'] },
  { table: 'termos', kind: 'utc', columns: ['created_at', 'updated_at'] },
  { table: 'clientes', kind: 'utc', columns: ['created_at'] },
  { table: 'procedimentos', kind: 'utc', columns: ['created_at'] },
  { table: 'atendimentos', kind: 'utc', columns: ['created_at', 'liberado_em', 'finalizado_at'] },
  { table: 'itens_atendimento', kind: 'utc', columns: ['created_at', 'desconto_aplicado_em', 'concluido_at'] },
  { table: 'pagamentos_grupos', kind: 'utc', columns: ['created_at'] },
  { table: 'formas_pagamento', kind: 'utc', columns: ['created_at', 'updated_at'] },
  { table: 'formas_pagamento_historico', kind: 'utc', columns: ['vigente_de', 'vigente_ate', 'created_at'] },
  { table: 'pagamentos', kind: 'utc', columns: ['created_at'] },
  { table: 'pagamentos_alocacoes', kind: 'utc', columns: ['created_at'] },
  { table: 'agendamentos', kind: 'utc', columns: ['created_at', 'updated_at'] },
  { table: 'item_atendimento_destinos', kind: 'utc', columns: ['created_at', 'updated_at'] },
  { table: 'followup_tarefas', kind: 'utc', columns: ['created_at', 'updated_at', 'concluida_em', 'excluida_em'] },
  { table: 'saldo_clientes', kind: 'utc', columns: ['updated_at'] },
  { table: 'movimentacoes_saldo', kind: 'utc', columns: ['created_at'] },
  { table: 'prontuarios', kind: 'utc', columns: ['created_at', 'updated_at'] },
  { table: 'unidades', kind: 'utc', columns: ['created_at'] },
  { table: 'usuario_unidades', kind: 'utc', columns: ['created_at'] },
  { table: 'fechamentos_caixa', kind: 'utc', columns: ['fechado_em', 'updated_at'] },
  { table: 'fechamento_caixa_eventos', kind: 'utc', columns: ['created_at'] },
  { table: 'agendamentos', kind: 'local', columns: ['data_agendada'] },
  { table: 'item_atendimento_destinos', kind: 'local', columns: ['data_agendada'] },
  { table: 'followup_tarefas', kind: 'local', columns: ['vencimento_em'] },
];

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
const LOCAL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?)?$/;
const OFFSET_REGEX = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags.set(arg, true);
      continue;
    }

    flags.set(arg, next);
    index += 1;
  }

  return {
    mode: positional[0] ?? 'audit',
    remote: Boolean(flags.get('--remote')),
    local: Boolean(flags.get('--local')),
    db: String(flags.get('--db') ?? DEFAULT_DB),
    sampleLimit: Number(flags.get('--sample-limit') ?? 3),
    dryRun: Boolean(flags.get('--dry-run')),
    skipBackup: Boolean(flags.get('--skip-backup')),
    backupDir: String(flags.get('--backup-dir') ?? path.join(process.cwd(), 'backups', 'd1')),
  };
}

function normalizeOffset(value) {
  return value.replace(/([+-]\d{2})(\d{2})(?!:)/g, '$1:$2');
}

function normalizeMicros(value) {
  return value.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2}|$))/, '$1');
}

function parseUtcInstant(value) {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (DATE_ONLY_REGEX.test(trimmed)) return null;

  if (NAIVE_DATETIME_REGEX.test(trimmed)) {
    const parsedNaive = new Date(`${trimmed.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1')}Z`);
    if (!Number.isNaN(parsedNaive.getTime())) {
      return parsedNaive;
    }
  }

  const candidates = [
    trimmed,
    trimmed.replace(' ', 'T'),
    normalizeOffset(trimmed),
    normalizeOffset(trimmed.replace(' ', 'T')),
    normalizeMicros(trimmed),
    normalizeMicros(trimmed.replace(' ', 'T')),
    normalizeMicros(normalizeOffset(trimmed)),
    normalizeMicros(normalizeOffset(trimmed.replace(' ', 'T'))),
  ];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function createUtcDateFromClinicParts(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  const localUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  return new Date(localUtcMillis - CLINIC_UTC_OFFSET_MINUTES * 60_000);
}

function parseClinicLocalDateTime(value) {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (DATE_ONLY_REGEX.test(trimmed)) return null;

  const match = trimmed.match(LOCAL_DATETIME_REGEX);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00', millis = '0'] = match;
  return createUtcDateFromClinicParts(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millis.padEnd(3, '0').slice(0, 3)),
  );
}

function classifyValue(raw) {
  const value = String(raw).trim();
  if (DATE_ONLY_REGEX.test(value)) return 'date_only';
  if (OFFSET_REGEX.test(value)) return value.endsWith('Z') ? 'iso_utc' : 'iso_offset';
  if (NAIVE_DATETIME_REGEX.test(value)) return 'naive_datetime';
  return 'other';
}

function normalizeValue(kind, raw) {
  if (raw == null) return null;

  const value = String(raw).trim();
  if (!value) return value;

  if (kind === 'local' && DATE_ONLY_REGEX.test(value)) {
    return value;
  }

  if (kind === 'utc') {
    const parsed = parseUtcInstant(value);
    return parsed ? parsed.toISOString() : null;
  }

  const parsed = OFFSET_REGEX.test(value) ? parseUtcInstant(value) : parseClinicLocalDateTime(value);
  return parsed ? parsed.toISOString() : null;
}

function runCommand(args, options = {}) {
  return execFileSync('npx', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runWranglerFile(sqlFile, { db, remote }) {
  const args = ['wrangler', 'd1', 'execute', db, remote ? '--remote' : '--local', '--file', sqlFile];
  return runCommand(args);
}

function executeJson(sql, { db, remote }) {
  const args = ['wrangler', 'd1', 'execute', db, remote ? '--remote' : '--local', '--json', '--command', sql];
  const raw = runCommand(args);
  const parsed = JSON.parse(raw);
  return parsed[0] ?? { results: [], success: true, meta: {} };
}

function backupDatabase({ db, remote, backupDir }) {
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scope = remote ? 'remote' : 'local';
  const output = path.join(backupDir, `${db}-${scope}-${stamp}.sql`);

  runCommand([
    'wrangler',
    'd1',
    'export',
    db,
    remote ? '--remote' : '--local',
    '--output',
    output,
  ]);

  return output;
}

function escapeSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function naiveDateTimeCondition(column) {
  return `(
    trim(${column}) GLOB '????-??-?? ??:??*'
    OR (
      trim(${column}) GLOB '????-??-??T??:??*'
      AND trim(${column}) NOT LIKE '%Z'
      AND trim(${column}) NOT GLOB '*+??:??'
      AND trim(${column}) NOT GLOB '*-??:??'
    )
  )`;
}

function isoOrOffsetCondition(column) {
  return `(
    trim(${column}) LIKE '%Z'
    OR trim(${column}) GLOB '*+??:??'
    OR trim(${column}) GLOB '*-??:??'
  )`;
}

function buildBulkUpdateSql(table, column, kind) {
  const trimmed = `trim(${column})`;
  const naiveCondition = naiveDateTimeCondition(column);
  const isoCondition = isoOrOffsetCondition(column);

  if (kind === 'utc') {
    return `
UPDATE ${table}
SET ${column} = CASE
  WHEN ${naiveCondition}
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', replace(${trimmed}, 'T', ' '))
  WHEN ${isoCondition}
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${trimmed})
  ELSE ${column}
END
WHERE ${column} IS NOT NULL
  AND ${trimmed} <> ''
  AND (
    ${naiveCondition}
    OR ${isoCondition}
  );`.trim();
  }

  return `
UPDATE ${table}
SET ${column} = CASE
  WHEN ${trimmed} GLOB '????-??-??'
    THEN ${trimmed}
  WHEN ${isoCondition}
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${trimmed})
  WHEN ${naiveCondition}
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(replace(${trimmed}, 'T', ' '), '+3 hours'))
  ELSE ${column}
END
WHERE ${column} IS NOT NULL
  AND ${trimmed} <> ''
  AND (
    ${isoCondition}
    OR ${naiveCondition}
  );`.trim();
}

function buildBulkSql({ db, remote }) {
  const existingTables = getExistingTables({ db, remote });
  const statements = [];

  for (const spec of COLUMN_SPECS) {
    if (!existingTables.has(spec.table)) continue;

    for (const column of spec.columns) {
      statements.push(`-- ${spec.table}.${column} (${spec.kind})`);
      statements.push(buildBulkUpdateSql(spec.table, column, spec.kind));
    }
  }

  return `${statements.join('\n\n')}\n`;
}

function getExistingTables({ db, remote }) {
  const response = executeJson(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    { db, remote },
  );
  return new Set((response.results ?? []).map((row) => row.name));
}

function auditColumn({ db, remote, table, column, sampleLimit }) {
  const countsSql = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN trim(${column}) GLOB '????-??-??' THEN 1 ELSE 0 END) AS date_only,
      SUM(CASE WHEN trim(${column}) LIKE '%Z' THEN 1 ELSE 0 END) AS iso_utc,
      SUM(CASE WHEN trim(${column}) GLOB '*+??:??' OR trim(${column}) GLOB '*-??:??' THEN 1 ELSE 0 END) AS iso_offset,
      SUM(CASE WHEN trim(${column}) GLOB '????-??-?? ??:??*' OR trim(${column}) GLOB '????-??-??T??:??*' THEN 1 ELSE 0 END) AS naive_like
    FROM ${table}
    WHERE ${column} IS NOT NULL
  `;

  const counts = executeJson(countsSql, { db, remote }).results?.[0] ?? {};
  const sampleRows = executeJson(
    `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL ORDER BY id ASC LIMIT ${sampleLimit}`,
    { db, remote },
  ).results ?? [];

  return {
    total: Number(counts.total ?? 0),
    date_only: Number(counts.date_only ?? 0),
    iso_utc: Number(counts.iso_utc ?? 0),
    iso_offset: Number(counts.iso_offset ?? 0),
    naive_like: Number(counts.naive_like ?? 0),
    samples: sampleRows.map((row) => row.value),
  };
}

function applyColumn({ db, remote, table, column, kind, dryRun }) {
  const rows = executeJson(
    `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL ORDER BY id ASC`,
    { db, remote },
  ).results ?? [];

  let changed = 0;
  const samples = [];

  for (const row of rows) {
    const original = row.value;
    const normalized = normalizeValue(kind, original);

    if (!normalized || normalized === original) {
      continue;
    }

    changed += 1;
    if (samples.length < 3) {
      samples.push({ id: row.id, before: original, after: normalized });
    }

    if (dryRun) continue;

    executeJson(
      `UPDATE ${table} SET ${column} = ${escapeSqlString(normalized)} WHERE id = ${Number(row.id)}`,
      { db, remote },
    );
  }

  return { changed, samples };
}

function runAudit(options) {
  const existingTables = getExistingTables(options);
  const report = [];

  for (const spec of COLUMN_SPECS) {
    if (!existingTables.has(spec.table)) continue;

    for (const column of spec.columns) {
      report.push({
        table: spec.table,
        column,
        kind: spec.kind,
        ...auditColumn({ ...options, table: spec.table, column }),
      });
    }
  }

  return report;
}

function runApply(options) {
  const existingTables = getExistingTables(options);
  const changes = [];

  for (const spec of COLUMN_SPECS) {
    if (!existingTables.has(spec.table)) continue;

    for (const column of spec.columns) {
      const result = applyColumn({
        ...options,
        table: spec.table,
        column,
        kind: spec.kind,
      });

      changes.push({
        table: spec.table,
        column,
        kind: spec.kind,
        ...result,
      });
    }
  }

  return changes;
}

function printJson(label, value) {
  console.log(`\n### ${label}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const remote = args.remote ? true : args.local ? false : false;
  const options = {
    db: args.db,
    remote,
    sampleLimit: args.sampleLimit,
    dryRun: args.dryRun,
  };

  if (!['audit', 'apply', 'backup', 'bulk-sql', 'bulk-apply'].includes(args.mode)) {
    throw new Error(`Modo inválido: ${args.mode}. Use audit, apply, backup, bulk-sql ou bulk-apply.`);
  }

  if (args.mode === 'backup') {
    const output = backupDatabase({ db: args.db, remote, backupDir: args.backupDir });
    console.log(output);
    return;
  }

  if (args.mode === 'bulk-sql') {
    process.stdout.write(buildBulkSql({ db: args.db, remote }));
    return;
  }

  if ((args.mode === 'apply' || args.mode === 'bulk-apply') && remote && !args.skipBackup && !args.dryRun) {
    const backupFile = backupDatabase({ db: args.db, remote, backupDir: args.backupDir });
    console.log(`Backup remoto criado em ${backupFile}`);
  }

  const before = runAudit(options);
  printJson('AUDIT BEFORE', before);

  if (args.mode === 'audit') {
    return;
  }

  if (args.mode === 'bulk-apply') {
    const sqlFile = path.join(process.cwd(), '.tmp-d1-timestamps-bulk.sql');
    writeFileSync(sqlFile, buildBulkSql({ db: args.db, remote }), 'utf8');
    runWranglerFile(sqlFile, { db: args.db, remote });

    const after = runAudit(options);
    printJson('AUDIT AFTER', after);
    return;
  }

  const changes = runApply(options);
  printJson(args.dryRun ? 'PLANNED CHANGES' : 'APPLIED CHANGES', changes);

  if (!args.dryRun) {
    const after = runAudit(options);
    printJson('AUDIT AFTER', after);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
