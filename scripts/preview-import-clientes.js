#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CSV_PATH = process.argv[2];
const useRemote = process.argv.includes('--remote');
const useLocal = process.argv.includes('--local');
const includeDuplicates = process.argv.includes('--include-duplicates');

if (!CSV_PATH) {
  console.error('Uso: node scripts/preview-import-clientes.js <arquivo.csv> [--remote|--local] [--include-duplicates]');
  process.exit(1);
}

const ABSOLUTE_CSV_PATH = path.resolve(process.cwd(), CSV_PATH);
const slug = path.basename(ABSOLUTE_CSV_PATH, path.extname(ABSOLUTE_CSV_PATH))
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const outputMode = includeDuplicates ? 'import-all' : 'preview';
const OUTPUT_SQL = path.resolve(process.cwd(), `lib/${slug}.${outputMode}.sql`);
const OUTPUT_REPORT = path.resolve(process.cwd(), `lib/${slug}.${outputMode}.report.json`);

const ORIGENS_VALIDAS = ['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao'];
const ORIGENS_MAP = {
  fachada: 'fachada',
  panfletagem: 'fachada',
  voucher: 'fachada',

  'trafego meta': 'trafego_meta',
  'trafego interno': 'trafego_meta',
  'tráfego interno': 'trafego_meta',
  'demanda do trafego': 'trafego_meta',
  'demanda do trafego ': 'trafego_meta',
  'demanda do tráfego': 'trafego_meta',
  'tráfego meta': 'trafego_meta',
  trafego_meta: 'trafego_meta',
  meta: 'trafego_meta',
  facebook: 'trafego_meta',
  instagram: 'trafego_meta',
  'anuncio': 'trafego_meta',
  'anuncio instagram': 'trafego_meta',
  'anuncio instagran fantasma': 'trafego_meta',
  'anuncio facebook': 'trafego_meta',
  'anúncio': 'trafego_meta',
  'anúncio instagram': 'trafego_meta',
  'anúncio instagran fantasma': 'trafego_meta',
  'anúncio facebook': 'trafego_meta',
  'rastreia lead': 'trafego_meta',
  'rastreia lead (inativo)': 'trafego_meta',
  'wpp meta quente (inativo)': 'trafego_meta',
  'wpp meta frio (inativo)': 'trafego_meta',
  'trafego interno (inativo)': 'trafego_meta',

  'trafego google': 'trafego_google',
  'tráfego google': 'trafego_google',
  trafego_google: 'trafego_google',
  google: 'trafego_google',

  organico: 'organico',
  'orgânico': 'organico',
  'instagram organico': 'organico',
  'instagram organico ': 'organico',
  'fornecedores da base': 'organico',
  'fornecedor da base': 'organico',
  'cliente da base': 'organico',
  base: 'organico',
  integracao: 'organico',
  'integração': 'organico',
  'insta vila uniao ordinario': 'organico',
  'insta vila uniao ordinario ': 'organico',
  'insta montese ordinario': 'organico',

  indicacao: 'indicacao',
  'indicação': 'indicacao',
  'indicacao de clientes': 'indicacao',
  'indicação de clientes': 'indicacao',
  'dra alanna': 'indicacao',
  'influencer gabriel babadex': 'indicacao',
  'plano odontoart': 'indicacao',
};

function decodeFile(buffer) {
  const utf8 = buffer.toString('utf8');
  const utf8Broken = (utf8.match(/\uFFFD/g) || []).length;
  if (utf8Broken === 0) return utf8;
  return buffer.toString('latin1');
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[#A-Za-z0-9]+;/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
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

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
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

function normalizeEmail(value) {
  const email = cleanText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function normalizePhone(value) {
  const digits = onlyDigits(value);
  if (digits.length < 10 || /^0+$/.test(digits)) return '';
  return cleanText(value);
}

function normalizePhoneKey(value) {
  const digits = onlyDigits(value);
  if (digits.length < 10 || /^0+$/.test(digits)) return '';
  return digits;
}

function formatCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function mapSexo(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'm' || normalized === 'masculino') return 'masculino';
  if (normalized === 'f' || normalized === 'feminino') return 'feminino';
  if (normalized === 'outro') return 'outro';
  return null;
}

function parseDate(value, withTime) {
  const raw = cleanText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    if (withTime) {
      return raw.length > 10 ? raw : `${raw} 00:00:00`;
    }
    return raw.slice(0, 10);
  }

  const matchDateTime = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!matchDateTime) return null;

  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = matchDateTime;
  if (withTime) return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  return `${yyyy}-${mm}-${dd}`;
}

function buildEndereco(row) {
  const parts = [];
  const logradouro = cleanText(row.logradouro);
  const numero = cleanText(row.numero);
  const complemento = cleanText(row.complemento);
  const bairro = cleanText(row.bairro);
  const cep = cleanText(row.cep);
  const uf = cleanText(row.uf);

  if (logradouro) {
    parts.push(numero ? `${logradouro}, ${numero}` : logradouro);
  } else if (numero) {
    parts.push(`Numero ${numero}`);
  }
  if (complemento) parts.push(complemento);
  if (bairro) parts.push(bairro);
  if (cep) parts.push(`CEP ${cep}`);
  if (uf) parts.push(uf);

  return parts.length > 0 ? parts.join(' - ') : null;
}

function mapOrigem(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return null;
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ORIGENS_MAP[normalized] || ORIGENS_MAP[raw] || null;
}

function escapeSql(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function appendObservation(base, extra) {
  const normalizedBase = cleanText(base);
  const normalizedExtra = cleanText(extra);
  if (!normalizedBase) return normalizedExtra || null;
  if (!normalizedExtra) return normalizedBase;
  return `${normalizedBase}\n${normalizedExtra}`;
}

function buildDuplicateName(name, counters) {
  const baseName = cleanText(name);
  const count = (counters.get(baseName) || 0) + 1;
  counters.set(baseName, count);
  return count === 1 ? `${baseName} (duplicado)` : `${baseName} (duplicado ${count})`;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Nao foi possivel interpretar JSON do wrangler: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function queryBaseClientes() {
  const args = [
    'wrangler',
    'd1',
    'execute',
    'sorria-leste-db',
    '--json',
    '--command',
    'SELECT id, nome, cpf, telefone, email FROM clientes',
  ];

  if (useRemote) args.push('--remote');
  if (useLocal) args.push('--local');

  const raw = execFileSync('npx', args, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const parsed = safeJsonParse(raw);
  return Array.isArray(parsed) && parsed[0] && Array.isArray(parsed[0].results) ? parsed[0].results : [];
}

function sampleRows(rows, limit) {
  return rows.slice(0, limit).map((row) => ({
    linha: row.linha,
    nome: row.nome,
    cpf: row.cpf || null,
    telefone: row.telefone || null,
    email: row.email || null,
    tipo_legado: row.tipo_legado || null,
    origem_original: row.origem_original || null,
    origem_mapeada: row.origem || null,
    motivo: row.motivo || null,
    base_match: row.base_match || null,
  }));
}

function main() {
  if (!fs.existsSync(ABSOLUTE_CSV_PATH)) {
    console.error(`Arquivo nao encontrado: ${ABSOLUTE_CSV_PATH}`);
    process.exit(1);
  }

  const rawBuffer = fs.readFileSync(ABSOLUTE_CSV_PATH);
  const rawText = decodeFile(rawBuffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = rawText.split('\n').filter(Boolean);
  if (lines.length < 2) {
    console.error('CSV vazio ou sem dados.');
    process.exit(1);
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const records = [];

  for (let index = 1; index < lines.length; index++) {
    const values = parseCsvLine(lines[index], delimiter);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || '';
    });

    const nome = cleanText(row.nome);
    const telefone = normalizePhone(pickFirstNonEmpty(row, ['celular_1', 'celular_2', 'telefone_fixo', 'telefone']));
    const email = normalizeEmail(pickFirstNonEmpty(row, ['e_mail', 'email']));
    const cpf = formatCpf(pickFirstNonEmpty(row, ['cnpj_cpf', 'cpf']));
    const tipoLegado = cleanText(row.tipo) || null;
    const origemOriginal = pickFirstNonEmpty(row, ['origem_contato', 'origem']);
    const origemMapeada = mapOrigem(origemOriginal) || 'fachada';
    const createdAt = parseDate(pickFirstNonEmpty(row, ['criado_em', 'data_inclusao', 'created_at']), true);
    const dataNascimento = parseDate(pickFirstNonEmpty(row, ['nascimento', 'data_nascimento']), false);
    const endereco = buildEndereco(row);
    const sexo = mapSexo(row.sexo);

    const extras = [];
    const obsLegada = cleanText(row.obs);
    const codigo = cleanText(row.codigo);
    const consultor = cleanText(row.consultor);
    const criadoPor = cleanText(row.criado_por);

    if (obsLegada) extras.push(`Obs legado: ${obsLegada}`);
    if (tipoLegado && tipoLegado.toLowerCase() !== 'cliente') extras.push(`Tipo legado: ${tipoLegado}`);
    if (codigo) extras.push(`Codigo legado: ${codigo}`);
    if (consultor) extras.push(`Consultor legado: ${consultor}`);
    if (criadoPor) extras.push(`Criado por legado: ${criadoPor}`);
    if (origemOriginal && mapOrigem(origemOriginal) === null) extras.push(`Origem original sem mapa: ${origemOriginal}`);

    records.push({
      linha: index + 1,
      nome,
      cpf,
      telefone,
      email,
      data_nascimento: dataNascimento,
      endereco,
      origem: ORIGENS_VALIDAS.includes(origemMapeada) ? origemMapeada : 'fachada',
      origem_original: origemOriginal || null,
      sexo,
      observacoes: extras.length > 0 ? extras.join('\n') : null,
      created_at: createdAt || null,
      tipo_legado: tipoLegado,
      telefone_key: normalizePhoneKey(telefone),
      email_key: email,
      cpf_key: onlyDigits(cpf),
    });
  }

  const typeCount = {};
  for (const record of records) {
    const key = record.tipo_legado || 'Sem tipo';
    typeCount[key] = (typeCount[key] || 0) + 1;
  }

  const existingBase = queryBaseClientes();
  const baseByCpf = new Map();
  const baseByPhone = new Map();
  const baseByEmail = new Map();

  for (const row of existingBase) {
    const cpfKey = onlyDigits(row.cpf || '');
    const phoneKey = normalizePhoneKey(row.telefone || '');
    const emailKey = normalizeEmail(row.email || '');

    if (cpfKey) baseByCpf.set(cpfKey, row);
    if (phoneKey) baseByPhone.set(phoneKey, row);
    if (emailKey) baseByEmail.set(emailKey, row);
  }

  const seenCpf = new Map();
  const seenPhone = new Map();
  const seenEmail = new Map();
  const usedCpf = new Set(baseByCpf.keys());
  const duplicateNameCounts = new Map();

  const semNome = [];
  const duplicadosInternos = [];
  const conflitosCpfBase = [];
  const possiveisDuplicadosBase = [];
  const prontosParaImportar = [];
  const origensContagem = {};
  const origensSemMapa = {};
  let marcadosComoDuplicado = 0;
  let cpfNeutralizado = 0;

  for (const record of records) {
    if (record.origem_original && mapOrigem(record.origem_original) === null) {
      origensSemMapa[record.origem_original] = (origensSemMapa[record.origem_original] || 0) + 1;
    }
    origensContagem[record.origem] = (origensContagem[record.origem] || 0) + 1;

    if (!record.nome) {
      record.motivo = 'sem_nome';
      semNome.push(record);
      continue;
    }

    const duplicateReasons = [];
    let conflitoComBase = false;
    let duplicadoNaBasePorContato = false;

    if (record.cpf_key) {
      const original = seenCpf.get(record.cpf_key);
      if (original) duplicateReasons.push(`cpf igual a linha ${original.linha}`);
      else seenCpf.set(record.cpf_key, record);
    }
    if (record.telefone_key) {
      const original = seenPhone.get(record.telefone_key);
      if (original) duplicateReasons.push(`telefone igual a linha ${original.linha}`);
      else seenPhone.set(record.telefone_key, record);
    }
    if (record.email_key) {
      const original = seenEmail.get(record.email_key);
      if (original) duplicateReasons.push(`email igual a linha ${original.linha}`);
      else seenEmail.set(record.email_key, record);
    }

    if (duplicateReasons.length > 0) {
      record.motivo = duplicateReasons.join('; ');
      duplicadosInternos.push(record);
      if (!includeDuplicates) continue;
    }

    if (record.cpf_key && baseByCpf.has(record.cpf_key)) {
      const baseMatch = baseByCpf.get(record.cpf_key);
      record.motivo = 'cpf ja existe na base';
      record.base_match = {
        id: baseMatch.id,
        nome: baseMatch.nome,
        cpf: baseMatch.cpf,
        telefone: baseMatch.telefone,
        email: baseMatch.email,
      };
      conflitosCpfBase.push(record);
      conflitoComBase = true;
      if (!includeDuplicates) continue;
    }

    const phoneMatch = record.telefone_key ? baseByPhone.get(record.telefone_key) : null;
    const emailMatch = record.email_key ? baseByEmail.get(record.email_key) : null;
    if (phoneMatch || emailMatch) {
      record.motivo = phoneMatch && emailMatch
        ? 'telefone e email ja aparecem na base'
        : phoneMatch
          ? 'telefone ja aparece na base'
          : 'email ja aparece na base';
      const baseMatch = phoneMatch || emailMatch;
      record.base_match = {
        id: baseMatch.id,
        nome: baseMatch.nome,
        cpf: baseMatch.cpf,
        telefone: baseMatch.telefone,
        email: baseMatch.email,
      };
      possiveisDuplicadosBase.push(record);
      duplicadoNaBasePorContato = true;
      if (!includeDuplicates) continue;
    }

    if (includeDuplicates) {
      const motivosImportacao = [];
      if (duplicateReasons.length > 0) motivosImportacao.push(...duplicateReasons);
      if (conflitoComBase) motivosImportacao.push('cpf ja existe na base');
      if (duplicadoNaBasePorContato) motivosImportacao.push(record.motivo);

      if (motivosImportacao.length > 0) {
        record.nome = buildDuplicateName(record.nome, duplicateNameCounts);
        record.observacoes = appendObservation(
          record.observacoes,
          `Registro importado como duplicado: ${motivosImportacao.join('; ')}`
        );
        marcadosComoDuplicado++;
      }

      if (record.cpf_key) {
        if (usedCpf.has(record.cpf_key)) {
          record.observacoes = appendObservation(
            record.observacoes,
            `CPF original removido na importacao por duplicidade: ${record.cpf}`
          );
          record.cpf = null;
          record.cpf_key = '';
          cpfNeutralizado++;
        } else {
          usedCpf.add(record.cpf_key);
        }
      }
    }

    prontosParaImportar.push(record);
  }

  const now = new Date().toISOString();
  const sqlLines = [
    '-- =====================================================',
    `-- ${includeDuplicates ? 'IMPORTACAO COMPLETA DE CLIENTES' : 'PREVIEW DE IMPORTACAO DE CLIENTES'}`,
    `-- Arquivo origem: ${path.basename(ABSOLUTE_CSV_PATH)}`,
    `-- Gerado em: ${now}`,
    `-- Base analisada: ${useRemote ? 'remote' : useLocal ? 'local' : 'sem sinalizador explicito'}`,
    `-- Total lido: ${records.length}`,
    `-- Prontos para importar: ${prontosParaImportar.length}`,
    `-- Duplicados internos: ${duplicadosInternos.length}`,
    `-- CPF ja existente na base: ${conflitosCpfBase.length}`,
    `-- Possiveis duplicados por telefone/email: ${possiveisDuplicadosBase.length}`,
    `-- Marcados com sufixo de duplicado: ${marcadosComoDuplicado}`,
    `-- CPF neutralizado para nao violar unicidade: ${cpfNeutralizado}`,
    '-- =====================================================',
    '',
  ];

  for (const record of prontosParaImportar) {
    const createdAt = record.created_at || now.replace('T', ' ').slice(0, 19);
    sqlLines.push(
      `INSERT INTO clientes (nome, cpf, telefone, email, data_nascimento, endereco, origem, sexo, observacoes, created_at) VALUES (` +
      `${escapeSql(record.nome)}, ` +
      `${escapeSql(record.cpf || null)}, ` +
      `${escapeSql(record.telefone || null)}, ` +
      `${escapeSql(record.email || null)}, ` +
      `${escapeSql(record.data_nascimento || null)}, ` +
      `${escapeSql(record.endereco || null)}, ` +
      `${escapeSql(record.origem)}, ` +
      `${escapeSql(record.sexo || null)}, ` +
      `${escapeSql(record.observacoes || null)}, ` +
      `${escapeSql(createdAt)});`
    );
  }

  fs.writeFileSync(OUTPUT_SQL, `${sqlLines.join('\n')}\n`, 'utf8');

  const report = {
    source_csv: ABSOLUTE_CSV_PATH,
    generated_at: now,
    import_mode: includeDuplicates ? 'include_duplicates' : 'preview',
    compared_base: useRemote ? 'remote' : useLocal ? 'local' : 'unknown',
    current_base_total: existingBase.length,
    total_lidos: records.length,
    tipo_legado: typeCount,
    origem_mapeada: origensContagem,
    origem_sem_mapa: origensSemMapa,
    sem_nome: semNome.length,
    duplicados_internos: duplicadosInternos.length,
    conflito_cpf_base: conflitosCpfBase.length,
    possiveis_duplicados_base: possiveisDuplicadosBase.length,
    marcados_como_duplicado: marcadosComoDuplicado,
    cpf_neutralizado: cpfNeutralizado,
    prontos_para_importar: prontosParaImportar.length,
    amostras: {
      sem_nome: sampleRows(semNome, 10),
      duplicados_internos: sampleRows(duplicadosInternos, 20),
      conflito_cpf_base: sampleRows(conflitosCpfBase, 20),
      possiveis_duplicados_base: sampleRows(possiveisDuplicadosBase, 20),
      prontos_para_importar: sampleRows(prontosParaImportar, 20),
    },
  };

  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`CSV analisado: ${ABSOLUTE_CSV_PATH}`);
  console.log(`Base comparada: ${report.compared_base}`);
  console.log(`Clientes atuais na base: ${report.current_base_total}`);
  console.log(`Total lido no CSV: ${report.total_lidos}`);
  console.log(`Tipos no CSV: ${Object.entries(typeCount).map(([key, value]) => `${key}=${value}`).join(', ')}`);
  console.log(`Sem nome: ${report.sem_nome}`);
  console.log(`Duplicados internos: ${report.duplicados_internos}`);
  console.log(`CPF ja existente na base: ${report.conflito_cpf_base}`);
  console.log(`Possiveis duplicados por telefone/email: ${report.possiveis_duplicados_base}`);
  console.log(`Marcados como duplicado: ${report.marcados_como_duplicado}`);
  console.log(`CPF neutralizado: ${report.cpf_neutralizado}`);
  console.log(`Prontos para importar: ${report.prontos_para_importar}`);
  console.log(`SQL gerado: ${OUTPUT_SQL}`);
  console.log(`Relatorio: ${OUTPUT_REPORT}`);
}

main();
