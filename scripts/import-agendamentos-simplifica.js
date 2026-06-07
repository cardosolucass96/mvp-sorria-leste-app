#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mappingConfig = require('../config/agendamentos-simplifica-mapping');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const useRemote = args.includes('--remote');
const useLocal = args.includes('--local');
const positionalArgs = args.filter((arg) => !arg.startsWith('--'));

const PRIMARY_CSV_PATH = path.resolve(
  process.cwd(),
  positionalArgs[0] || path.join('exportados-simplifica', 'Search Results.csv')
);
const SOURCE_DIR = path.dirname(PRIMARY_CSV_PATH);
const DUPLICATE_CSV_PATH = path.join(SOURCE_DIR, 'Search Results (1).csv');
const DETAILS_CSV_PATH = path.join(SOURCE_DIR, 'Detalhes agendamentos.csv');

const OUTPUT_ROOT = path.resolve(process.cwd(), 'artifacts', 'agendamentos-simplifica');
const targetLabel = useRemote ? 'remote' : useLocal ? 'local' : 'default';
const modeLabel = applyChanges ? 'apply' : 'dry-run';
const outputPrefix = `simplifica-agendamentos.${targetLabel}.${modeLabel}`;
const OUTPUT_SUMMARY = path.join(OUTPUT_ROOT, `${outputPrefix}.summary.json`);
const OUTPUT_CLIENTS = path.join(OUTPUT_ROOT, `${outputPrefix}.clientes-sem-match.csv`);
const OUTPUT_PROCEDURES = path.join(OUTPUT_ROOT, `${outputPrefix}.procedimentos-sem-match.csv`);
const OUTPUT_USERS = path.join(OUTPUT_ROOT, `${outputPrefix}.usuarios-sem-match.csv`);
const OUTPUT_SQL = path.join(OUTPUT_ROOT, `${outputPrefix}.import.sql`);

const DB_NAME = 'sorria-leste-db';
const LEGACY_SOURCE = mappingConfig.legacySource || 'simplifica_search_results';
const UNIDADE_ID = Number(mappingConfig.unidadeId || 2);
const TODAY_KEY = formatDateKeyLocal(new Date());

function formatDateKeyLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function decodeFile(buffer) {
  const utf8 = buffer.toString('utf8');
  const utf8Broken = (utf8.match(/\uFFFD/g) || []).length;
  if (utf8Broken === 0) return utf8;
  return buffer.toString('latin1');
}

function normalizeHeader(value, index) {
  const raw = String(value || '').replace(/^\uFEFF/, '').trim();
  if (raw === '#') return 'legacy_id';

  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[#A-Za-z0-9]+;/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return normalized || `col_${index}`;
}

function cleanText(value) {
  return String(value || '')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (lines.length < 2) {
    return { headers: [], rows: [], delimiter: ';' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => normalizeHeader(header, index));
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

  return { headers, rows, delimiter };
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

function extractDateKey(value) {
  const normalized = cleanText(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return normalized.slice(0, 10);
  }
  return null;
}

function extractPessoa(rawValue) {
  const raw = cleanText(rawValue);
  const phoneMatches = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g) || [];
  const phoneRaw = phoneMatches.length > 0 ? phoneMatches[phoneMatches.length - 1] : '';
  const telefoneKey = normalizePhoneKey(phoneRaw);

  let nome = raw;
  if (phoneRaw) {
    nome = raw
      .replace(phoneRaw, ' ')
      .replace(/\s*-\s*/g, ' ')
      .replace(/[-|/()]+$/g, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  nome = nome.replace(/[-|/]\s*$/g, '').trim();

  return {
    raw,
    nome,
    nomeKey: normalizeNameKey(nome),
    telefone: phoneRaw,
    telefoneKey,
  };
}

function mapStatus(status) {
  const normalized = normalizeNameKey(status).toUpperCase();
  if (normalized === 'PENDENTE') return 'agendado';
  if (normalized === 'REALIZADO') return 'realizado';
  if (normalized === 'CANCELADO') return 'cancelado';
  if (normalized === 'REMARCADO') return 'cancelado';
  if (normalized === 'NOSHOW') return 'faltou';
  return null;
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

function buildLookupMap(sourceObject) {
  const map = new Map();
  for (const [rawKey, value] of Object.entries(sourceObject || {})) {
    const normalized = normalizeNameKey(rawKey);
    if (!normalized) continue;
    map.set(normalized, value);
  }
  return map;
}

function pushMapArray(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function resolveClient(record, clientIndex) {
  const overrideId = mappingConfig.clientOverrides && mappingConfig.clientOverrides[String(record.legacyId)];
  if (overrideId) {
    const overridden = clientIndex.byId.get(Number(overrideId));
    if (overridden) {
      return { client: overridden, mode: 'override', issue: null };
    }
  }

  const phoneMatches = record.pessoa.telefoneKey ? (clientIndex.byPhone.get(record.pessoa.telefoneKey) || []) : [];
  if (phoneMatches.length === 1) {
    return { client: phoneMatches[0], mode: 'phone', issue: null };
  }
  if (phoneMatches.length > 1) {
    const exactMatches = record.pessoa.nomeKey
      ? phoneMatches.filter((row) => row.nomeKey === record.pessoa.nomeKey)
      : [];
    if (exactMatches.length === 1) {
      return { client: exactMatches[0], mode: 'phone+name', issue: null };
    }

    const baseNameMatches = record.pessoa.nomeKey
      ? phoneMatches.filter((row) => row.nomeBaseKey === record.pessoa.nomeKey)
      : [];
    if (baseNameMatches.length === 1) {
      return { client: baseNameMatches[0], mode: 'phone+base-name', issue: null };
    }

    const preferredBaseNameMatches = baseNameMatches.filter((row) => !row.isDuplicateName);
    if (preferredBaseNameMatches.length === 1) {
      return { client: preferredBaseNameMatches[0], mode: 'phone+base-name-preferred', issue: null };
    }

    const narrowed = exactMatches.length > 0 ? exactMatches : baseNameMatches;
    if (narrowed.length > 1) {
      const sorted = [...narrowed].sort((left, right) => left.id - right.id);
      const uniqueBaseNames = new Set(sorted.map((row) => row.nomeBaseKey)).size;
      if (uniqueBaseNames === 1) {
        return { client: sorted[0], mode: 'phone+same-base-name', issue: null };
      }
    }
    return {
      client: null,
      mode: null,
      issue: narrowed.length > 1 ? 'ambiguous_phone_and_name' : 'ambiguous_phone',
    };
  }

  const nameMatches = record.pessoa.nomeKey ? (clientIndex.byName.get(record.pessoa.nomeKey) || []) : [];
  if (nameMatches.length === 1) {
    return { client: nameMatches[0], mode: 'name', issue: null };
  }
  if (nameMatches.length > 1) {
    return { client: null, mode: null, issue: 'ambiguous_name' };
  }

  return { client: null, mode: null, issue: 'not_found' };
}

function stripProcedureDecorators(value) {
  return cleanText(value)
    .replace(/\s*-\s*plano\s+[^-]+$/i, '')
    .replace(/\s*-\s*sem categoria$/i, '')
    .replace(/\s+(clin|odontoart|odontoprime|odontoprev)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProcedureResolution(result) {
  if (result.tipo === 'avaliacao') {
    return {
      tipo: 'avaliacao',
      procedimentoId: null,
      procedureLabel: 'Avaliação',
      issue: null,
      mapped: true,
      strategy: result.strategy || 'avaliacao',
    };
  }

  return {
    tipo: 'procedimento',
    procedimentoId: result.procedimentoId,
    procedureLabel: result.procedureLabel || null,
    issue: null,
    mapped: true,
    strategy: result.strategy || 'mapped',
  };
}

function resolveProcedureByRule(procedureKey) {
  if (!procedureKey) {
    return buildProcedureResolution({ tipo: 'avaliacao', strategy: 'fallback:empty' });
  }

  if (procedureKey.includes('consulta') || procedureKey.includes('avaliacao')) {
    return buildProcedureResolution({ tipo: 'avaliacao', strategy: 'fallback:consulta' });
  }

  if (procedureKey.includes('raio x') || procedureKey.includes('radiologia')) {
    return buildProcedureResolution({ tipo: 'avaliacao', strategy: 'fallback:radiologia' });
  }

  if (procedureKey.includes('botox')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 57, procedureLabel: 'Botox 3 Regiões', strategy: 'rule:botox' });
  }

  if (procedureKey.includes('clareamento')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 48, procedureLabel: 'Clareamento', strategy: 'rule:clareamento' });
  }

  if (procedureKey.includes('placa') && procedureKey.includes('brux')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 47, procedureLabel: 'Placa Bruxismo', strategy: 'rule:placa-bruxismo' });
  }

  if (procedureKey.includes('pino')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 55, procedureLabel: 'Pino', strategy: 'rule:pino' });
  }

  if (procedureKey.includes('bloco')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 56, procedureLabel: 'Bloco', strategy: 'rule:bloco' });
  }

  if (procedureKey.includes('faceta')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 43, procedureLabel: 'Faceta', strategy: 'rule:faceta' });
  }

  if (procedureKey.includes('coroa') && procedureKey.includes('implante')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 52, procedureLabel: 'Coroa Porcelana', strategy: 'rule:coroa-implante' });
  }

  if (procedureKey.includes('coroa')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 52, procedureLabel: 'Coroa Porcelana', strategy: 'rule:coroa' });
  }

  if (procedureKey.includes('protocolo') && procedureKey.includes('cirurgia')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 5, procedureLabel: 'Implante', strategy: 'rule:protocolo-cirurgia' });
  }

  if (procedureKey.includes('protocolo') && procedureKey.includes('protese')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 13, procedureLabel: 'Prótese Total', strategy: 'rule:protocolo-protese' });
  }

  if (procedureKey.includes('overdenture')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 13, procedureLabel: 'Prótese Total', strategy: 'rule:overdenture' });
  }

  if (procedureKey.includes('adesiva')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 30, procedureLabel: 'Ponte Móvel', strategy: 'rule:adesiva' });
  }

  if (procedureKey.includes('manutenc') && procedureKey.includes('implante')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 19, procedureLabel: 'Manutenção de Implante', strategy: 'rule:manutencao-implante' });
  }

  if (procedureKey.includes('implante')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 5, procedureLabel: 'Implante', strategy: 'rule:implante' });
  }

  if (procedureKey.includes('montagem aparelho')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 14, procedureLabel: 'Manutenção 1', strategy: 'rule:montagem-aparelho' });
  }

  if (procedureKey.includes('autoligado')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 17, procedureLabel: 'Manutenção Autoligado', strategy: 'rule:autoligado' });
  }

  if (procedureKey.includes('contenc')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 18, procedureLabel: 'Manutenção de Contenção', strategy: 'rule:contencao' });
  }

  if (procedureKey.includes('remocao de aparelho')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 18, procedureLabel: 'Manutenção de Contenção', strategy: 'rule:remocao-aparelho' });
  }

  if (procedureKey.includes('aparelho estet')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 16, procedureLabel: 'Manutenção Aparelho Estético', strategy: 'rule:aparelho-estetico' });
  }

  if (procedureKey.includes('aparelho') || procedureKey.includes('ortodont')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 14, procedureLabel: 'Manutenção 1', strategy: 'rule:ortodontia-generica' });
  }

  if ((procedureKey.includes('1 face') && procedureKey.includes('posterior')) || (procedureKey.includes('resina') && procedureKey.includes('1 face'))) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 36, procedureLabel: 'Restauração Classe 1', strategy: 'rule:restauracao-1-face' });
  }

  if ((procedureKey.includes('2 face') || procedureKey.includes('4 face')) && (procedureKey.includes('posterior') || procedureKey.includes('resina'))) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 4, procedureLabel: 'Restauração Classe 2', strategy: 'rule:restauracao-posterior-multiface' });
  }

  if (procedureKey.includes('classe 3')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 37, procedureLabel: 'Restauração Classe 3', strategy: 'rule:classe-3' });
  }

  if (procedureKey.includes('reconstruc')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 7, procedureLabel: 'Restauração Estética', strategy: 'rule:reconstrucao' });
  }

  if (procedureKey.includes('restaura') || procedureKey.includes('resina') || procedureKey.includes('dentistica')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 7, procedureLabel: 'Restauração Estética', strategy: 'rule:dentistica-generica' });
  }

  if (procedureKey.includes('raspagem') || procedureKey.includes('periodont')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 10, procedureLabel: 'Tratamento Periodontal', strategy: 'rule:periodontia' });
  }

  if (procedureKey.includes('gengivoplast')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 39, procedureLabel: 'Gengivoplastia', strategy: 'rule:gengivoplastia' });
  }

  if (procedureKey.includes('tartaro')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 40, procedureLabel: 'Remoção de Tártaro', strategy: 'rule:tartaro' });
  }

  if (procedureKey.includes('aumento coroa')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 41, procedureLabel: 'Aumento de Coroa', strategy: 'rule:aumento-coroa' });
  }

  if ((procedureKey.includes('dente leite') || procedureKey.includes('decidu')) && (procedureKey.includes('extra') || procedureKey.includes('exodontia'))) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 3, procedureLabel: 'Extração de Decíduo', strategy: 'rule:extracao-deciduos' });
  }

  if (procedureKey.includes('siso')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 42, procedureLabel: 'Extração de Siso', strategy: 'rule:siso' });
  }

  if (procedureKey.includes('retalho') || procedureKey.includes('sutura') || procedureKey.includes('extra') || procedureKey.includes('exodontia') || procedureKey.includes('cirurgia')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 11, procedureLabel: 'Extração Normal', strategy: 'rule:cirurgia-generica' });
  }

  if (procedureKey.includes('retratamento') && procedureKey.includes('molar')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 23, procedureLabel: 'Retratamento Canal Molar', strategy: 'rule:retratamento-molar' });
  }

  if (procedureKey.includes('retratamento') && procedureKey.includes('pre')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 25, procedureLabel: 'Retratamento Canal Pré-Molar', strategy: 'rule:retratamento-pre' });
  }

  if (procedureKey.includes('retratamento') && (procedureKey.includes('incis') || procedureKey.includes('canino'))) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 24, procedureLabel: 'Retratamento Canal Incisivo', strategy: 'rule:retratamento-incisivo' });
  }

  if (procedureKey.includes('finaliza') && procedureKey.includes('canal')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 2, procedureLabel: 'Canal', strategy: 'rule:finalizacao-canal' });
  }

  if (procedureKey.includes('canal') && procedureKey.includes('molar')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 20, procedureLabel: 'Canal Molar', strategy: 'rule:canal-molar' });
  }

  if (procedureKey.includes('canal') && procedureKey.includes('pre')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 21, procedureLabel: 'Canal Pré-Molar', strategy: 'rule:canal-pre' });
  }

  if (procedureKey.includes('canal') && (procedureKey.includes('incis') || procedureKey.includes('inciso'))) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 22, procedureLabel: 'Canal Incisivo', strategy: 'rule:canal-incisivo' });
  }

  if (procedureKey.includes('canal') || procedureKey.includes('endodont')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 2, procedureLabel: 'Canal', strategy: 'rule:endodontia-generica' });
  }

  if (procedureKey.includes('protese') || procedureKey.includes('prótese')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 13, procedureLabel: 'Prótese Total', strategy: 'rule:protese-generica' });
  }

  if (procedureKey.includes('harmon')) {
    return buildProcedureResolution({ tipo: 'procedimento', procedimentoId: 57, procedureLabel: 'Botox 3 Regiões', strategy: 'rule:harmonizacao' });
  }

  return buildProcedureResolution({ tipo: 'avaliacao', strategy: 'fallback:avaliacao' });
}

function resolveProcedure(rawProcedure, procedureMap) {
  const procedure = cleanText(rawProcedure);
  const procedureKey = normalizeNameKey(procedure);
  const strippedProcedure = stripProcedureDecorators(procedure);
  const strippedProcedureKey = normalizeNameKey(strippedProcedure);

  if (!procedureKey || procedureKey === 'avaliacao avaliacao') {
    return buildProcedureResolution({ tipo: 'avaliacao', strategy: 'exact:avaliacao' });
  }

  const mapped = procedureMap.get(procedureKey) || procedureMap.get(strippedProcedureKey);
  if (!mapped) {
    return resolveProcedureByRule(strippedProcedureKey || procedureKey);
  }

  if (mapped.tipo === 'avaliacao') {
    return buildProcedureResolution({ tipo: 'avaliacao', strategy: strippedProcedureKey !== procedureKey ? 'mapped:stripped-avaliacao' : 'mapped:avaliacao' });
  }

  if (!Number.isInteger(mapped.procedimentoId)) {
    return resolveProcedureByRule(strippedProcedureKey || procedureKey);
  }

  return buildProcedureResolution({
    tipo: 'procedimento',
    procedimentoId: mapped.procedimentoId,
    procedureLabel: strippedProcedureKey !== procedureKey ? strippedProcedure : procedure,
    strategy: strippedProcedureKey !== procedureKey ? 'mapped:stripped' : 'mapped:exact',
  });
}

function resolveExecutor(rawExecutor, executorMap) {
  const normalized = normalizeNameKey(rawExecutor);
  if (!normalized) {
    return { executorId: null, issue: null, mapped: true };
  }
  if (!executorMap.has(normalized)) {
    return { executorId: null, issue: 'unmapped_executor', mapped: false };
  }

  const executorId = executorMap.get(normalized);
  if (!Number.isInteger(executorId)) {
    return { executorId: null, issue: 'unmapped_executor', mapped: false };
  }

  return { executorId, issue: null, mapped: true };
}

function pushObservation(target, label, value) {
  const normalized = cleanText(value);
  if (!normalized) return;
  target.push(`${label}: ${normalized}`);
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

function buildImportSql(rows) {
  if (rows.length === 0) {
    return [
      `-- Gerado em ${new Date().toISOString()}`,
      `-- Fonte: ${path.basename(PRIMARY_CSV_PATH)}`,
      '-- Nenhuma linha pronta para importacao.',
    ].join('\n');
  }

  const columns = [
    'cliente_id',
    'procedimento_id',
    'executor_id',
    'tipo',
    'status',
    'data_agendada',
    'observacoes',
    'motivo_cancelamento',
    'unidade_id',
    'created_at',
    'updated_at',
    'legado_fonte',
    'legado_id',
  ];

  const statements = chunkArray(rows, 100).map((chunk) => {
    const values = chunk.map((row) => `(
  ${escapeSql(row.cliente_id)},
  ${escapeSql(row.procedimento_id)},
  ${escapeSql(row.executor_id)},
  ${escapeSql(row.tipo)},
  ${escapeSql(row.status)},
  ${escapeSql(row.data_agendada)},
  ${escapeSql(row.observacoes)},
  ${escapeSql(row.motivo_cancelamento)},
  ${escapeSql(row.unidade_id)},
  ${escapeSql(row.created_at)},
  ${escapeSql(row.updated_at)},
  ${escapeSql(row.legado_fonte)},
  ${escapeSql(row.legado_id)}
)`).join(',\n');

    return `INSERT OR IGNORE INTO agendamentos (${columns.join(', ')})\nVALUES\n${values};`;
  });

  return [
    `-- Gerado em ${new Date().toISOString()}`,
    `-- Fonte: ${path.basename(PRIMARY_CSV_PATH)}`,
    'BEGIN TRANSACTION;',
    ...statements,
    'COMMIT;',
  ].join('\n\n');
}

function summarizeMapCounts(rows, keyField) {
  const counts = {};
  for (const row of rows) {
    const key = row[keyField] || 'vazio';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function main() {
  if (!fs.existsSync(PRIMARY_CSV_PATH)) {
    console.error(`Arquivo principal nao encontrado: ${PRIMARY_CSV_PATH}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const duplicateFileIgnored = fs.existsSync(DUPLICATE_CSV_PATH)
    && path.resolve(DUPLICATE_CSV_PATH) !== path.resolve(PRIMARY_CSV_PATH)
    && fs.readFileSync(PRIMARY_CSV_PATH).equals(fs.readFileSync(DUPLICATE_CSV_PATH));

  const detailsRowCount = fs.existsSync(DETAILS_CSV_PATH) ? parseCsvFile(DETAILS_CSV_PATH).rows.length : 0;
  const primaryCsv = parseCsvFile(PRIMARY_CSV_PATH);

  const clients = queryD1('SELECT id, nome, telefone FROM clientes');
  const agendamentosSchema = queryD1("PRAGMA table_info('agendamentos')");
  const hasLegacyColumns = agendamentosSchema.some((column) => column.name === 'legado_fonte')
    && agendamentosSchema.some((column) => column.name === 'legado_id');
  const existingLegacyRows = hasLegacyColumns
    ? queryD1(`SELECT legado_fonte, legado_id FROM agendamentos WHERE legado_fonte = ${escapeSql(LEGACY_SOURCE)} AND legado_id IS NOT NULL`)
    : [];

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

  const executorMap = buildLookupMap(mappingConfig.executorMap || {});
  const procedureMap = buildLookupMap(mappingConfig.procedureMap || {});
  const existingLegacyKeys = new Set(
    existingLegacyRows
      .map((row) => `${cleanText(row.legado_fonte)}::${cleanText(row.legado_id)}`)
      .filter(Boolean)
  );

  const preparedRows = [];
  const clientIssues = [];
  const procedureIssues = [];
  const executorIssues = [];
  const invalidRows = [];
  const duplicateLegacyIssues = [];
  const seenSourceLegacyIds = new Map();
  const statusCountsLegacy = {};
  const statusCountsFinal = {};
  const clientMatchModes = {};

  let alreadyImported = 0;
  let skippedPastPending = 0;

  for (const row of primaryCsv.rows) {
    const legacyId = pickFirstNonEmpty(row, ['legacy_id', 'id', 'codigo', 'numero']);
    const statusLegado = pickFirstNonEmpty(row, ['status', 'situacao']);
    const statusFinal = mapStatus(statusLegado);
    const procedimentoLegado = pickFirstNonEmpty(row, ['procedimento', 'procedimentos']);
    const consultorLegado = pickFirstNonEmpty(row, ['consultor']);
    const profissionalLegado = pickFirstNonEmpty(row, ['profissional']);
    const pessoa = extractPessoa(pickFirstNonEmpty(row, ['pessoa', 'cliente']));
    const dataAgendada = parseDate(pickFirstNonEmpty(row, ['data_hora', 'datahora']));
    const createdAt = parseDate(pickFirstNonEmpty(row, ['criado_em', 'created_at'])) || dataAgendada;
    const updatedAt = parseDate(pickFirstNonEmpty(row, ['encerramento', 'updated_at'])) || createdAt;

    const observations = [];
    pushObservation(observations, 'Arquivo legado', path.basename(PRIMARY_CSV_PATH));
    pushObservation(observations, 'ID legado', legacyId);
    pushObservation(observations, 'Pessoa legado', pessoa.raw);
    pushObservation(observations, 'Procedimento legado', procedimentoLegado);
    pushObservation(observations, 'Consultor legado', consultorLegado);
    pushObservation(observations, 'Profissional legado', profissionalLegado);
    pushObservation(observations, 'Motivo consulta legado', pickFirstNonEmpty(row, ['motivo_consulta']));
    pushObservation(observations, 'Descricao legado', pickFirstNonEmpty(row, ['descricao']));
    pushObservation(observations, 'Descricao encerramento legado', pickFirstNonEmpty(row, ['descricao_encerramento']));
    pushObservation(observations, 'Motivo cancelamento legado', pickFirstNonEmpty(row, ['motivo_cancelamento']));
    pushObservation(observations, 'Remarcado pelo cliente', pickFirstNonEmpty(row, ['remarcado_pelo_cliente']));

    const blockedReasons = [];

    if (!legacyId) {
      blockedReasons.push('missing_legacy_id');
    } else if (seenSourceLegacyIds.has(legacyId)) {
      blockedReasons.push('duplicate_legacy_id_in_source');
      duplicateLegacyIssues.push({
        line: row.__line,
        legacy_id: legacyId,
        first_seen_line: seenSourceLegacyIds.get(legacyId),
      });
    } else {
      seenSourceLegacyIds.set(legacyId, row.__line);
    }

    statusCountsLegacy[statusLegado || 'vazio'] = (statusCountsLegacy[statusLegado || 'vazio'] || 0) + 1;
    if (!statusFinal) {
      blockedReasons.push('invalid_status');
    } else {
      statusCountsFinal[statusFinal] = (statusCountsFinal[statusFinal] || 0) + 1;
    }

    if (!dataAgendada || !createdAt || !updatedAt) {
      blockedReasons.push('invalid_dates');
    }

    const dataAgendadaKey = extractDateKey(dataAgendada);
    if (
      normalizeNameKey(statusLegado) === 'pendente'
      && dataAgendadaKey
      && dataAgendadaKey < TODAY_KEY
    ) {
      skippedPastPending++;
      continue;
    }

    const clientResolution = resolveClient({ legacyId, pessoa }, clientIndex);
    if (!clientResolution.client) {
      blockedReasons.push(clientResolution.issue || 'client_not_found');
      clientIssues.push({
        line: row.__line,
        legacy_id: legacyId,
        pessoa_legado: pessoa.raw,
        nome_extraido: pessoa.nome,
        telefone_extraido: pessoa.telefone,
        status_legado: statusLegado,
        procedimento_legado: procedimentoLegado,
        motivo: clientResolution.issue || 'not_found',
      });
    } else {
      clientMatchModes[clientResolution.mode] = (clientMatchModes[clientResolution.mode] || 0) + 1;
    }

    const procedureResolution = resolveProcedure(procedimentoLegado, procedureMap);
    if (procedureResolution.strategy && !procedureResolution.strategy.startsWith('mapped:exact') && !procedureResolution.strategy.startsWith('exact:')) {
      pushObservation(observations, 'Procedimento padronizado', procedureResolution.procedureLabel || 'Avaliação');
      pushObservation(observations, 'Padronização legado', procedureResolution.strategy);
    }
    if (!procedureResolution.mapped) {
      blockedReasons.push(procedureResolution.issue || 'unmapped_procedure');
      procedureIssues.push({
        line: row.__line,
        legacy_id: legacyId,
        procedimento_legado: procedimentoLegado,
        status_legado: statusLegado,
      });
    }

    const executorResolution = resolveExecutor(profissionalLegado, executorMap);
    if (!executorResolution.mapped) {
      executorIssues.push({
        line: row.__line,
        legacy_id: legacyId,
        profissional_legado: profissionalLegado,
      });
    }

    if (normalizeNameKey(statusLegado) === 'remarcado') {
      observations.push('Status legado: Remarcado');
    }

    if (blockedReasons.length > 0) {
      invalidRows.push({
        line: row.__line,
        legacy_id: legacyId,
        reasons: blockedReasons,
      });
      continue;
    }

    const composedLegacyKey = `${LEGACY_SOURCE}::${legacyId}`;
    if (existingLegacyKeys.has(composedLegacyKey)) {
      alreadyImported++;
      continue;
    }

    preparedRows.push({
      cliente_id: clientResolution.client.id,
      procedimento_id: procedureResolution.procedimentoId,
      executor_id: executorResolution.executorId,
      tipo: procedureResolution.tipo,
      status: statusFinal,
      data_agendada: dataAgendada,
      observacoes: observations.join('\n') || null,
      motivo_cancelamento: cleanText(pickFirstNonEmpty(row, ['motivo_cancelamento']))
        || (normalizeNameKey(statusLegado) === 'remarcado' ? 'Remarcado no sistema legado' : null),
      unidade_id: UNIDADE_ID,
      created_at: createdAt,
      updated_at: updatedAt,
      legado_fonte: LEGACY_SOURCE,
      legado_id: legacyId,
    });
  }

  const procedureIssueSummary = Object.entries(summarizeMapCounts(procedureIssues, 'procedimento_legado'))
    .sort((left, right) => right[1] - left[1])
    .map(([procedimento_legado, quantidade]) => ({ procedimento_legado, quantidade }));
  const executorIssueSummary = Object.entries(summarizeMapCounts(executorIssues, 'profissional_legado'))
    .sort((left, right) => right[1] - left[1])
    .map(([profissional_legado, quantidade]) => ({ profissional_legado, quantidade }));

  writeCsv(OUTPUT_CLIENTS, [
    'line',
    'legacy_id',
    'pessoa_legado',
    'nome_extraido',
    'telefone_extraido',
    'status_legado',
    'procedimento_legado',
    'motivo',
  ], clientIssues);

  writeCsv(OUTPUT_PROCEDURES, ['procedimento_legado', 'quantidade'], procedureIssueSummary);
  writeCsv(OUTPUT_USERS, ['profissional_legado', 'quantidade'], executorIssueSummary);

  const sql = buildImportSql(preparedRows);
  fs.writeFileSync(OUTPUT_SQL, sql);

  const summary = {
    generated_at: new Date().toISOString(),
    mode: modeLabel,
    target: targetLabel,
    source: {
      primary_csv: path.relative(process.cwd(), PRIMARY_CSV_PATH),
      duplicate_csv: fs.existsSync(DUPLICATE_CSV_PATH) ? path.relative(process.cwd(), DUPLICATE_CSV_PATH) : null,
      duplicate_ignored: duplicateFileIgnored,
      detalhes_csv: fs.existsSync(DETAILS_CSV_PATH) ? path.relative(process.cwd(), DETAILS_CSV_PATH) : null,
      primary_rows: primaryCsv.rows.length,
      detalhes_rows: detailsRowCount,
    },
    schema: {
      has_legado_columns: hasLegacyColumns,
      migration_required: !hasLegacyColumns,
    },
    counts: {
      prepared_for_insert: preparedRows.length,
      already_imported: alreadyImported,
      skipped_past_pending: skippedPastPending,
      blocked_rows: invalidRows.length,
      client_issues: clientIssues.length,
      procedure_issues: procedureIssues.length,
      executor_issues: executorIssues.length,
      duplicate_legacy_ids_in_source: duplicateLegacyIssues.length,
    },
    status_counts_legacy: statusCountsLegacy,
    status_counts_final: statusCountsFinal,
    client_match_modes: clientMatchModes,
    blockers_by_reason: summarizeMapCounts(
      invalidRows.flatMap((row) => row.reasons.map((reason) => ({ reason }))),
      'reason'
    ),
    reports: {
      summary_json: path.relative(process.cwd(), OUTPUT_SUMMARY),
      clientes_sem_match_csv: path.relative(process.cwd(), OUTPUT_CLIENTS),
      procedimentos_sem_match_csv: path.relative(process.cwd(), OUTPUT_PROCEDURES),
      usuarios_sem_match_csv: path.relative(process.cwd(), OUTPUT_USERS),
      sql_file: path.relative(process.cwd(), OUTPUT_SQL),
    },
  };

  fs.writeFileSync(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);

  if (applyChanges) {
    if (!hasLegacyColumns) {
      console.error('A tabela agendamentos ainda nao tem legado_fonte/legado_id. Rode a migration antes do --apply.');
      process.exit(1);
    }
    if (invalidRows.length > 0) {
      console.error(`Dry-run bloqueou ${invalidRows.length} linhas. Revise os relatórios antes do --apply.`);
      process.exit(1);
    }
    if (preparedRows.length === 0) {
      console.log('Nenhuma linha nova pronta para importar.');
      return;
    }

    executeSqlFile(OUTPUT_SQL);
    console.log(`Importacao concluida com ${preparedRows.length} agendamentos novos.`);
    return;
  }

  console.log(`Dry-run concluido. ${preparedRows.length} linhas prontas e ${invalidRows.length} bloqueadas.`);
}

main();
