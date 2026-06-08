#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mappingConfig = require('../config/followup-simplifica-mapping');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const useRemote = args.includes('--remote');
const useLocal = args.includes('--local');
const positionalArgs = args.filter((arg) => !arg.startsWith('--'));

const SOURCE_CSV_PATH = path.resolve(
  process.cwd(),
  positionalArgs[0] || path.join('exportados-simplifica', 'Informações atividades.csv')
);

const OUTPUT_ROOT = path.resolve(process.cwd(), 'artifacts', 'followup-simplifica');
const targetLabel = useRemote ? 'remote' : useLocal ? 'local' : 'default';
const modeLabel = applyChanges ? 'apply' : 'dry-run';
const outputPrefix = `simplifica-followup.${targetLabel}.${modeLabel}`;
const OUTPUT_SUMMARY = path.join(OUTPUT_ROOT, `${outputPrefix}.summary.json`);
const OUTPUT_CLIENTS = path.join(OUTPUT_ROOT, `${outputPrefix}.clientes-sem-match.csv`);
const OUTPUT_USERS = path.join(OUTPUT_ROOT, `${outputPrefix}.usuarios.csv`);
const OUTPUT_IGNORED = path.join(OUTPUT_ROOT, `${outputPrefix}.linhas-ignoradas.csv`);
const OUTPUT_SQL = path.join(OUTPUT_ROOT, `${outputPrefix}.import.sql`);

const DB_NAME = 'sorria-leste-db';
const LEGACY_SOURCE = mappingConfig.legacySource || 'simplifica_atividades';
const UNIDADE_ID = Number(mappingConfig.unidadeId || 2);
const OPEN_CUTOFF = mappingConfig.openCutoff || '2026-06-06 00:00:00';
const COMPLETION_NOTE = mappingConfig.completionNote || 'Importado como histórico do Simplifica';

function decodeFile(buffer) {
  const utf8 = buffer.toString('utf8');
  const utf8Broken = (utf8.match(/\uFFFD/g) || []).length;
  if (utf8Broken === 0) return utf8;
  return buffer.toString('latin1');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;|nbsp/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function cleanText(value) {
  return decodeHtml(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value, index, seen) {
  const raw = String(value || '').replace(/^\uFEFF/, '').trim();
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[#A-Za-z0-9]+;/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || `col_${index}`;

  const count = (seen.get(normalized) || 0) + 1;
  seen.set(normalized, count);
  return count === 1 ? normalized : `${normalized}_${count}`;
}

function parseCsvLine(line, delimiter) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  fields.push(current);
  return fields.map((field) => cleanText(field));
}

function detectDelimiter(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvFile(filePath) {
  const rawBuffer = fs.readFileSync(filePath);
  const rawText = decodeFile(rawBuffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = rawText.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const seenHeaders = new Map();
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => normalizeHeader(header, index, seenHeaders));
  const rows = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const values = parseCsvLine(lines[lineIndex], delimiter);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || '';
    });
    row.__line = lineIndex + 1;
    rows.push(row);
  }

  return { headers, rows };
}

function pickFirstNonEmpty(row, keys) {
  for (const key of keys) {
    const value = cleanText(row[key]);
    if (value) return value;
  }
  return '';
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeNameKey(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeEmailKey(value) {
  return cleanText(value).toLowerCase();
}

function normalizeCreatedByKey(value) {
  return cleanText(value).toUpperCase();
}

function stripDuplicateSuffix(value) {
  return cleanText(value)
    .replace(/\s*\(duplicado(?:\s+\d+)?\)\s*$/i, '')
    .trim();
}

function normalizePhoneKey(value) {
  const digits = onlyDigits(value);
  if (digits.length < 10 || /^0+$/.test(digits)) return '';
  return digits;
}

function parseDate(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.length > 10 ? raw : `${raw} 00:00:00`;
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function parseDateToParts(value) {
  const normalized = parseDate(value);
  if (!normalized) return null;
  const [datePart, timePart = '00:00:00'] = normalized.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return { year, month, day, hour, minute, second };
}

function buildLocalDate(parts) {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0,
    0
  );
}

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function cleanDescription(value) {
  const decoded = decodeHtml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  return decoded
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractDueDate(description, effectiveAt) {
  const cleaned = cleanDescription(description);
  const effectiveParts = parseDateToParts(effectiveAt);
  if (!effectiveParts) return effectiveAt;

  const dateMatches = [...cleaned.matchAll(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g)];
  if (dateMatches.length === 0) return effectiveAt;

  const lastDate = dateMatches[dateMatches.length - 1];
  let day = Number(lastDate[1]);
  let month = Number(lastDate[2]);
  let year = lastDate[3]
    ? Number(lastDate[3].length === 2 ? `20${lastDate[3]}` : lastDate[3])
    : effectiveParts.year;

  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? Number(timeMatch[1]) : 9;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;

  let candidate = buildLocalDate({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
  });

  if (!lastDate[3]) {
    const effectiveDate = buildLocalDate(effectiveParts);
    if (candidate.getTime() < effectiveDate.getTime()) {
      candidate = buildLocalDate({
        year: year + 1,
        month,
        day,
        hour,
        minute,
        second: 0,
      });
    }
  }

  return formatLocalDateTime(candidate);
}

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
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const parsed = safeJsonParse(raw);
  return Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : [];
}

function executeSqlFile(filePath) {
  const commandArgs = ['wrangler', 'd1', 'execute', DB_NAME, '--file', filePath];
  if (useRemote) commandArgs.push('--remote');
  if (useLocal) commandArgs.push('--local');

  execFileSync('npx', commandArgs, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function escapeSql(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[";\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header] ?? '')).join(';'));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function pushMapArray(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function summarizeRowsByField(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = row[field] || 'vazio';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function resolveClient(task, clientIndex) {
  const overrideId = mappingConfig.clientOverrides && mappingConfig.clientOverrides[String(task.legacyId)];
  if (overrideId) {
    const overridden = clientIndex.byId.get(Number(overrideId));
    if (overridden) return { client: overridden, mode: 'override', issue: null };
  }

  const phoneKeys = [
    normalizePhoneKey(task.celular1),
    normalizePhoneKey(task.celular2),
    normalizePhoneKey(task.telefoneFixo),
  ].filter(Boolean);

  for (const phoneKey of phoneKeys) {
    const phoneMatches = clientIndex.byPhone.get(phoneKey) || [];
    if (phoneMatches.length === 1) {
      return { client: phoneMatches[0], mode: 'phone', issue: null };
    }

    if (phoneMatches.length > 1) {
      const exactMatches = phoneMatches.filter((row) => row.nomeKey === task.nomeKey);
      if (exactMatches.length === 1) {
        return { client: exactMatches[0], mode: 'phone+name', issue: null };
      }

      const baseMatches = phoneMatches.filter((row) => row.nomeBaseKey === task.nomeKey);
      if (baseMatches.length === 1) {
        return { client: baseMatches[0], mode: 'phone+base-name', issue: null };
      }

      const preferredBaseMatches = baseMatches.filter((row) => !row.isDuplicateName);
      if (preferredBaseMatches.length === 1) {
        return { client: preferredBaseMatches[0], mode: 'phone+base-name-preferred', issue: null };
      }

      const narrowed = exactMatches.length > 0 ? exactMatches : baseMatches;
      if (narrowed.length > 1) {
        const sameBaseNames = new Set(narrowed.map((row) => row.nomeBaseKey)).size;
        if (sameBaseNames === 1) {
          return { client: narrowed.sort((left, right) => left.id - right.id)[0], mode: 'phone+same-base-name', issue: null };
        }
      }
    }
  }

  const nameMatches = clientIndex.byName.get(task.nomeKey) || [];
  if (nameMatches.length === 1) {
    return { client: nameMatches[0], mode: 'name', issue: null };
  }

  if (nameMatches.length > 1) {
    return { client: null, mode: null, issue: 'ambiguous_name' };
  }

  return { client: null, mode: null, issue: 'not_found' };
}

function buildManagedUserRegistry(existingUsers) {
  const byEmail = new Map();
  const byName = new Map();

  for (const user of existingUsers) {
    const emailKey = normalizeEmailKey(user.email || '');
    const nameKey = normalizeNameKey(user.nome || '');
    if (emailKey) byEmail.set(emailKey, user);
    if (nameKey) byName.set(nameKey, user);
  }

  const registry = new Map();
  const consultorMap = new Map();
  const createdByMap = new Map();

  for (const [key, spec] of Object.entries(mappingConfig.managedUsers || {})) {
    const desiredEmail = spec.resolveByEmail || spec.email || '';
    const desiredName = spec.resolveByName || spec.name || '';
    const existing = byEmail.get(normalizeEmailKey(desiredEmail)) || byName.get(normalizeNameKey(desiredName)) || null;
    const lookupEmail = existing ? cleanText(existing.email) : cleanText(spec.email || desiredEmail);
    const willCreate = !existing && spec.createIfMissing !== false && !!cleanText(spec.email);

    const record = {
      key,
      spec,
      existing,
      lookupEmail,
      action: existing ? 'existing' : willCreate ? 'will_create' : 'missing',
    };

    registry.set(key, record);

    for (const legacyName of spec.legacyConsultors || []) {
      consultorMap.set(normalizeNameKey(legacyName), record);
    }

    for (const legacyCreatedBy of spec.legacyCreatedBy || []) {
      createdByMap.set(normalizeCreatedByKey(legacyCreatedBy), record);
    }
  }

  return { registry, consultorMap, createdByMap };
}

function buildUserBootstrapStatements(registry) {
  const statements = [];

  for (const record of registry.values()) {
    if (record.action !== 'will_create') continue;

    const spec = record.spec;
    const email = cleanText(spec.email);
    const name = cleanText(spec.name);
    const role = cleanText(spec.role || 'atendente');
    const ativo = Number(spec.ativo === undefined ? 0 : spec.ativo);

    statements.push(
      `INSERT INTO usuarios (nome, email, role, ativo)
SELECT ${escapeSql(name)}, ${escapeSql(email)}, ${escapeSql(role)}, ${escapeSql(ativo)}
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE lower(email) = lower(${escapeSql(email)})
);`
    );

    for (const userRole of spec.usuarioRoles || []) {
      statements.push(
        `INSERT INTO usuario_roles (usuario_id, role)
SELECT u.id, ${escapeSql(userRole)}
  FROM usuarios u
 WHERE lower(u.email) = lower(${escapeSql(email)})
   AND NOT EXISTS (
     SELECT 1
       FROM usuario_roles ur
      WHERE ur.usuario_id = u.id
        AND ur.role = ${escapeSql(userRole)}
   );`
      );
    }

    for (const unidadeId of spec.unitIds || []) {
      statements.push(
        `INSERT INTO usuario_unidades (usuario_id, unidade_id)
SELECT u.id, ${escapeSql(unidadeId)}
  FROM usuarios u
 WHERE lower(u.email) = lower(${escapeSql(email)})
   AND NOT EXISTS (
     SELECT 1
       FROM usuario_unidades uu
      WHERE uu.usuario_id = u.id
        AND uu.unidade_id = ${escapeSql(unidadeId)}
   );`
      );
    }
  }

  return statements;
}

function buildImportSql(rows, userBootstrapStatements) {
  const statements = [...userBootstrapStatements];
  const columns = [
    'cliente_id',
    'unidade_id',
    'responsavel_usuario_id',
    'criado_por_id',
    'concluida_por_id',
    'excluida_por_id',
    'tipo',
    'titulo',
    'descricao',
    'status',
    'vencimento_em',
    'nota_conclusao',
    'concluida_em',
    'excluida_em',
    'created_at',
    'updated_at',
    'legado_fonte',
    'legado_id',
  ];

  for (const chunk of chunkArray(rows, 100)) {
    const values = chunk.map((row) => `(
  ${escapeSql(row.cliente_id)},
  ${escapeSql(row.unidade_id)},
  (SELECT id FROM usuarios WHERE lower(email) = lower(${escapeSql(row.responsavel_email)}) LIMIT 1),
  (SELECT id FROM usuarios WHERE lower(email) = lower(${escapeSql(row.criado_por_email)}) LIMIT 1),
  NULL,
  NULL,
  ${escapeSql(row.tipo)},
  ${escapeSql(row.titulo)},
  ${escapeSql(row.descricao)},
  ${escapeSql(row.status)},
  ${escapeSql(row.vencimento_em)},
  ${escapeSql(row.nota_conclusao)},
  ${escapeSql(row.concluida_em)},
  NULL,
  ${escapeSql(row.created_at)},
  ${escapeSql(row.updated_at)},
  ${escapeSql(row.legado_fonte)},
  ${escapeSql(row.legado_id)}
)`).join(',\n');

    statements.push(
      `INSERT OR IGNORE INTO followup_tarefas (${columns.join(', ')})
VALUES
${values};`
    );
  }

  return [
    `-- Gerado em ${new Date().toISOString()}`,
    `-- Fonte: ${path.basename(SOURCE_CSV_PATH)}`,
    ...statements,
  ].join('\n\n');
}

function main() {
  if (!fs.existsSync(SOURCE_CSV_PATH)) {
    console.error(`Arquivo nao encontrado: ${SOURCE_CSV_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const source = parseCsvFile(SOURCE_CSV_PATH);
  const followupSchema = queryD1("PRAGMA table_info('followup_tarefas')");
  const hasLegacyColumns = followupSchema.some((column) => column.name === 'legado_fonte')
    && followupSchema.some((column) => column.name === 'legado_id');

  const existingLegacyRows = hasLegacyColumns
    ? queryD1(`SELECT legado_fonte, legado_id FROM followup_tarefas WHERE legado_fonte = ${escapeSql(LEGACY_SOURCE)} AND legado_id IS NOT NULL`)
    : [];

  const clients = queryD1('SELECT id, nome, telefone FROM clientes');
  const users = queryD1(`
    SELECT
      u.id,
      u.nome,
      u.email,
      u.role,
      u.ativo,
      GROUP_CONCAT(DISTINCT ur.role) AS usuario_roles,
      GROUP_CONCAT(DISTINCT uu.unidade_id) AS unidade_ids
    FROM usuarios u
    LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
    LEFT JOIN usuario_unidades uu ON uu.usuario_id = u.id
    GROUP BY u.id, u.nome, u.email, u.role, u.ativo
    ORDER BY u.id
  `);

  const clientIndex = {
    byId: new Map(),
    byPhone: new Map(),
    byName: new Map(),
  };

  for (const client of clients) {
    const normalizedClient = {
      id: Number(client.id),
      nome: cleanText(client.nome),
      nomeKey: normalizeNameKey(client.nome),
      nomeBaseKey: normalizeNameKey(stripDuplicateSuffix(client.nome)),
      isDuplicateName: /\(duplicado(?:\s+\d+)?\)$/i.test(cleanText(client.nome)),
      telefoneKey: normalizePhoneKey(client.telefone),
    };
    clientIndex.byId.set(normalizedClient.id, normalizedClient);
    pushMapArray(clientIndex.byPhone, normalizedClient.telefoneKey, normalizedClient);
    pushMapArray(clientIndex.byName, normalizedClient.nomeKey, normalizedClient);
  }

  const existingLegacyKeys = new Set(
    existingLegacyRows
      .map((row) => `${cleanText(row.legado_fonte)}::${cleanText(row.legado_id)}`)
      .filter(Boolean)
  );

  const allowedReasons = new Set(Object.keys(mappingConfig.tipoMap || {}));
  const ignoredReasons = new Set(mappingConfig.ignoredMotivos || []);
  const { registry, consultorMap, createdByMap } = buildManagedUserRegistry(users);
  const automationUser = registry.get('simplifica_automacao');
  const userBootstrapStatements = buildUserBootstrapStatements(registry);

  const ignoredRows = [];
  const invalidRows = [];
  const dedupeMap = new Map();
  const dedupeConflicts = new Map();

  for (const row of source.rows) {
    const legacyId = pickFirstNonEmpty(row, ['codigo']);
    const motivo = pickFirstNonEmpty(row, ['motivo']);
    const nome = pickFirstNonEmpty(row, ['nome']);

    if (!motivo || !nome) {
      ignoredRows.push({
        line: row.__line,
        legacy_id: legacyId,
        nome,
        motivo,
        ignore_reason: 'invalid_motivo',
      });
      continue;
    }

    if (!allowedReasons.has(motivo)) {
      ignoredRows.push({
        line: row.__line,
        legacy_id: legacyId,
        nome,
        motivo,
        ignore_reason: ignoredReasons.has(motivo) ? 'ignored_motivo' : 'invalid_motivo',
      });
      continue;
    }

    const createdAt = parseDate(pickFirstNonEmpty(row, ['criado_em']));
    const updatedAt = parseDate(pickFirstNonEmpty(row, ['alterado_em'])) || createdAt;
    if (!createdAt || !updatedAt || !legacyId) {
      invalidRows.push({
        line: row.__line,
        legacy_id: legacyId,
        nome,
        motivo,
        issue: !legacyId ? 'missing_legacy_id' : 'invalid_dates',
      });
      continue;
    }

    const task = {
      line: row.__line,
      legacyId,
      nome,
      nomeKey: normalizeNameKey(nome),
      motivo,
      motivoKey: normalizeNameKey(motivo),
      consultor: pickFirstNonEmpty(row, ['consultor']),
      criadoPor: pickFirstNonEmpty(row, ['criado_por']),
      alteradoPor: pickFirstNonEmpty(row, ['alterado_por']),
      tipoLegado: pickFirstNonEmpty(row, ['tipo', 'tipo_2']),
      tipoRegistro: pickFirstNonEmpty(row, ['tipo_registro']),
      ativoLegado: pickFirstNonEmpty(row, ['ativo']),
      descricaoRaw: pickFirstNonEmpty(row, ['descricao']),
      descricao: cleanDescription(pickFirstNonEmpty(row, ['descricao'])),
      celular1: pickFirstNonEmpty(row, ['celular_1']),
      celular2: pickFirstNonEmpty(row, ['celular_2']),
      telefoneFixo: pickFirstNonEmpty(row, ['telefone_fixo']),
      createdAt,
      updatedAt,
      effectiveAt: updatedAt || createdAt,
    };

    const dedupeKey = `${task.nomeKey}::${task.motivoKey}`;
    const current = dedupeMap.get(dedupeKey);
    if (!current || task.effectiveAt > current.effectiveAt || (task.effectiveAt === current.effectiveAt && task.createdAt > current.createdAt)) {
      if (current) {
        dedupeConflicts.set(dedupeKey, (dedupeConflicts.get(dedupeKey) || 1) + 1);
      }
      dedupeMap.set(dedupeKey, task);
    } else {
      dedupeConflicts.set(dedupeKey, (dedupeConflicts.get(dedupeKey) || 1) + 1);
    }
  }

  const preparedRows = [];
  const clientIssues = [];
  const userIssues = [];
  const clientMatchModes = {};
  let alreadyImported = 0;
  let openTasks = 0;
  let concludedTasks = 0;

  for (const task of dedupeMap.values()) {
    const composedLegacyKey = `${LEGACY_SOURCE}::${task.legacyId}`;
    if (existingLegacyKeys.has(composedLegacyKey)) {
      alreadyImported++;
      continue;
    }

    const clientResolution = resolveClient(task, clientIndex);
    if (!clientResolution.client) {
      clientIssues.push({
        line: task.line,
        legacy_id: task.legacyId,
        nome: task.nome,
        celular_1: task.celular1,
        celular_2: task.celular2,
        telefone_fixo: task.telefoneFixo,
        motivo: task.motivo,
        issue: clientResolution.issue || 'not_found',
      });
      continue;
    }
    clientMatchModes[clientResolution.mode] = (clientMatchModes[clientResolution.mode] || 0) + 1;

    const responsavelRecord = consultorMap.get(normalizeNameKey(task.consultor));
    if (!responsavelRecord || responsavelRecord.action === 'missing' || !responsavelRecord.lookupEmail) {
      userIssues.push({
        line: task.line,
        legacy_id: task.legacyId,
        field: 'consultor',
        legacy_value: task.consultor,
        issue: 'missing_consultor_mapping',
      });
      continue;
    }

    const createdByRecord = createdByMap.get(normalizeCreatedByKey(task.criadoPor)) || automationUser;
    if (!createdByRecord || createdByRecord.action === 'missing' || !createdByRecord.lookupEmail) {
      userIssues.push({
        line: task.line,
        legacy_id: task.legacyId,
        field: 'criado_por',
        legacy_value: task.criadoPor,
        issue: 'missing_created_by_mapping',
      });
      continue;
    }

    const tipo = mappingConfig.tipoMap[task.motivo];
    const dueDate = extractDueDate(task.descricaoRaw, task.effectiveAt) || task.effectiveAt;
    const status = task.effectiveAt >= OPEN_CUTOFF ? 'aberta' : 'concluida';
    if (status === 'aberta') openTasks++;
    else concludedTasks++;

    const descriptionParts = [];
    if (task.descricao) descriptionParts.push(task.descricao);
    descriptionParts.push(`Motivo legado: ${task.motivo}`);
    if (task.consultor) descriptionParts.push(`Consultor legado: ${task.consultor}`);

    preparedRows.push({
      cliente_id: clientResolution.client.id,
      unidade_id: UNIDADE_ID,
      responsavel_email: responsavelRecord.lookupEmail,
      criado_por_email: createdByRecord.lookupEmail,
      tipo,
      titulo: task.motivo,
      descricao: descriptionParts.join('\n'),
      status,
      vencimento_em: dueDate,
      nota_conclusao: status === 'concluida' ? COMPLETION_NOTE : null,
      concluida_em: status === 'concluida' ? task.effectiveAt : null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      legado_fonte: LEGACY_SOURCE,
      legado_id: task.legacyId,
    });
  }

  const userReportRows = [...registry.values()].map((record) => ({
    key: record.key,
    target_name: record.existing ? record.existing.nome : cleanText(record.spec.name || record.spec.resolveByName),
    target_email: record.lookupEmail,
    action: record.action,
    existing_user_id: record.existing ? record.existing.id : '',
    role: cleanText(record.spec.role || record.existing?.role || ''),
    ativo: record.spec.ativo === undefined ? (record.existing ? record.existing.ativo : '') : record.spec.ativo,
    unidade_ids: (record.spec.unitIds || []).join(','),
    legacy_consultors: (record.spec.legacyConsultors || []).join(' | '),
    legacy_created_by: (record.spec.legacyCreatedBy || []).join(' | '),
  }));

  writeCsv(OUTPUT_CLIENTS, [
    'line',
    'legacy_id',
    'nome',
    'celular_1',
    'celular_2',
    'telefone_fixo',
    'motivo',
    'issue',
  ], clientIssues);

  writeCsv(OUTPUT_USERS, [
    'key',
    'target_name',
    'target_email',
    'action',
    'existing_user_id',
    'role',
    'ativo',
    'unidade_ids',
    'legacy_consultors',
    'legacy_created_by',
  ], userReportRows);

  writeCsv(OUTPUT_IGNORED, [
    'line',
    'legacy_id',
    'nome',
    'motivo',
    'ignore_reason',
  ], ignoredRows);

  const sql = buildImportSql(preparedRows, userBootstrapStatements);
  fs.writeFileSync(OUTPUT_SQL, sql);

  const summary = {
    generated_at: new Date().toISOString(),
    mode: modeLabel,
    target: targetLabel,
    source: {
      csv: path.relative(process.cwd(), SOURCE_CSV_PATH),
      source_rows: source.rows.length,
    },
    schema: {
      has_legado_columns: hasLegacyColumns,
      migration_required: !hasLegacyColumns,
    },
    counts: {
      ignored_rows: ignoredRows.length,
      invalid_rows: invalidRows.length,
      deduped_tasks: dedupeMap.size,
      prepared_for_insert: preparedRows.length,
      already_imported: alreadyImported,
      client_issues: clientIssues.length,
      user_issues: userIssues.length,
      open_tasks: openTasks,
      concluded_tasks: concludedTasks,
      managed_users_existing: userReportRows.filter((row) => row.action === 'existing').length,
      managed_users_to_create: userReportRows.filter((row) => row.action === 'will_create').length,
    },
    ignored_by_reason: summarizeRowsByField(ignoredRows, 'ignore_reason'),
    client_match_modes: clientMatchModes,
    reports: {
      summary_json: path.relative(process.cwd(), OUTPUT_SUMMARY),
      clientes_sem_match_csv: path.relative(process.cwd(), OUTPUT_CLIENTS),
      usuarios_csv: path.relative(process.cwd(), OUTPUT_USERS),
      linhas_ignoradas_csv: path.relative(process.cwd(), OUTPUT_IGNORED),
      sql_file: path.relative(process.cwd(), OUTPUT_SQL),
    },
  };

  fs.writeFileSync(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);

  if (applyChanges) {
    if (!hasLegacyColumns) {
      console.error('A tabela followup_tarefas ainda nao tem legado_fonte/legado_id. Rode a migration antes do --apply.');
      process.exit(1);
    }
    if (preparedRows.length === 0) {
      console.log('Nenhuma tarefa pronta para importar.');
      return;
    }

    executeSqlFile(OUTPUT_SQL);
    console.log(`Importacao concluida com ${preparedRows.length} tarefas prontas no lote.`);
    return;
  }

  console.log(`Dry-run concluido. ${preparedRows.length} tarefas prontas, ${clientIssues.length} clientes sem match e ${ignoredRows.length} linhas ignoradas.`);
}

main();
