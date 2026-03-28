/**
 * Script de importação de clientes do CSV para o banco D1 (Cloudflare/SQLite).
 *
 * Uso:
 *   node scripts/import-clientes.js <caminho-do-csv>
 *
 * O que faz:
 *   1. Lê o CSV e extrai colunas: nome, telefone, email, data_inclusao, origem_contato
 *   2. Detecta duplicados internos (mesmo telefone, mesmo email, ou mesmo nome)
 *   3. Exibe origens novas (não presentes no sistema)
 *   4. Gera arquivo SQL limpo para importação via wrangler d1 execute
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Configurações ──────────────────────────────────────────────────────────────

const CSV_PATH = process.argv[2] || '/Users/test/Documents/extracao-sorria-leste/clientes.csv';
const OUTPUT_SQL = path.join(__dirname, '../lib/import-clientes.sql');

/** Origens válidas no sistema */
const ORIGENS_VALIDAS = ['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao'];

/** Mapeamento de possíveis variações de texto → valor do sistema */
const ORIGENS_MAP = {
  // ── Fachada (presença física / panfleto / voucher) ─────────────────────────
  'fachada': 'fachada',
  'panfletagem': 'fachada',
  'voucher': 'fachada',

  // ── Tráfego Meta (Facebook / Instagram / WhatsApp Ads) ────────────────────
  'trafego meta': 'trafego_meta',
  'tráfego meta': 'trafego_meta',
  'trafego_meta': 'trafego_meta',
  'meta': 'trafego_meta',
  'facebook': 'trafego_meta',
  'instagram': 'trafego_meta',
  'facebook/instagram': 'trafego_meta',
  'anuncio': 'trafego_meta',
  'anúncio': 'trafego_meta',
  'anuncio instagram fantasma': 'trafego_meta',
  'anúncio instagram (inativo)': 'trafego_meta',
  'anuncio facebook (inativo)': 'trafego_meta',
  'wpp meta quente (inativo)': 'trafego_meta',
  'wpp meta frio (inativo)': 'trafego_meta',
  'ad quente': 'trafego_meta',
  'ad frio': 'trafego_meta',
  'link da bio': 'trafego_meta',         // link na bio do Instagram
  'rastreia lead (inativo)': 'trafego_meta',
  'botconversa (inativo)': 'trafego_meta', // bot de captura via Meta
  'trafego interno (inativo)': 'trafego_meta',

  // ── Tráfego Google ─────────────────────────────────────────────────────────
  'trafego google': 'trafego_google',
  'tráfego google': 'trafego_google',
  'trafego_google': 'trafego_google',
  'google': 'trafego_google',

  // ── Orgânico (sem mídia paga) ──────────────────────────────────────────────
  'organico': 'organico',
  'orgânico': 'organico',
  'instagram organico': 'organico',
  'base': 'organico',
  'cliente da base': 'organico',
  'integracao': 'organico',
  'integração': 'organico',
  'projeto neemias': 'organico',

  // ── Indicação (pessoas / empresas parceiras / planos) ─────────────────────
  'indicacao': 'indicacao',
  'indicação': 'indicacao',
  // pessoas que indicam
  'dra alanna': 'indicacao',
  'rosele': 'indicacao',
  'estela personal': 'indicacao',
  'joyce casas alves': 'indicacao',
  'pedro sol': 'indicacao',
  // parceiros / empresas
  'academia mega': 'indicacao',
  'colegio impacto': 'indicacao',
  'escola estado de alagoas': 'indicacao',
  'escola raquel de queiroz': 'indicacao',
  'farmacia drogamano': 'indicacao',
  'farmacia do trabalhador': 'indicacao',
  // planos odontológicos
  'plano odontoart': 'indicacao',
  'plano clin': 'indicacao',
  'plano odontoprime': 'indicacao',
  'plano odontoprev': 'indicacao',
};

// ── Utilitários ────────────────────────────────────────────────────────────────

/** Normaliza telefone: mantém só dígitos */
function normalizarTelefone(tel) {
  return (tel || '').replace(/\D/g, '');
}

/** Normaliza email: lowercase + trim */
function normalizarEmail(email) {
  return (email || '').toLowerCase().trim();
}

/** Normaliza nome: lowercase + trim + remove espaços duplos */
function normalizarNome(nome) {
  return (nome || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Mapeia o valor de origem_contato do CSV para o valor do sistema */
function mapearOrigem(valor) {
  const normalizado = (valor || '').toLowerCase().trim();
  return ORIGENS_MAP[normalizado] || null;
}

/** Escapa string para SQL */
function escapeSql(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/** Tenta converter data para formato ISO (YYYY-MM-DD HH:MM:SS) */
function parseData(val) {
  if (!val || val.trim() === '') return null;
  const s = val.trim();
  // Já está em ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  // Formato DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} 00:00:00`;
  // Formato DD/MM/YYYY HH:MM
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]} ${m2[4]}:${m2[5]}:00`;
  return s; // devolve como está
}

// ── Parsing CSV simples (suporta aspas) ───────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Arquivo não encontrado: ${CSV_PATH}`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(CSV_PATH), crlfDelay: Infinity });

  let headers = null;
  let colIdx = {};
  const registros = [];
  let linhaTotal = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    linhaTotal++;

    if (!headers) {
      headers = parseCsvLine(line).map(h => h.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/\s+/g, '_'));
      // Mapeia colunas necessárias
      const buscar = ['nome', 'telefone', 'email', 'data_inclusao', 'origem_contato'];
      for (const col of buscar) {
        const idx = headers.indexOf(col);
        if (idx === -1) {
          // tenta variações
          const alt = headers.findIndex(h => h.includes(col.split('_')[0]));
          colIdx[col] = alt;
        } else {
          colIdx[col] = idx;
        }
      }
      console.log('\n📋 Colunas encontradas no CSV:');
      console.log('  ' + headers.join(', '));
      console.log('\n🔗 Mapeamento das colunas necessárias:');
      for (const [col, idx] of Object.entries(colIdx)) {
        console.log(`  ${col} → coluna ${idx === -1 ? '⚠️  NÃO ENCONTRADA' : `[${idx}] "${headers[idx]}"`}`);
      }
      console.log('');
      continue;
    }

    const fields = parseCsvLine(line);
    const get = (col) => (colIdx[col] !== undefined && colIdx[col] >= 0) ? (fields[colIdx[col]] || '').trim() : '';

    registros.push({
      nome:           get('nome'),
      telefone:       get('telefone'),
      email:          get('email'),
      data_inclusao:  get('data_inclusao'),
      origem_contato: get('origem_contato'),
      _linha:         linhaTotal,
    });
  }

  console.log(`Total de registros lidos: ${registros.length}\n`);

  // ── 1. Detectar duplicados internos ─────────────────────────────────────────

  const porTelefone = new Map();
  const porEmail    = new Map();
  const duplicados  = new Map(); // linha → { motivo, linhasDup }

  for (const r of registros) {
    const tel   = normalizarTelefone(r.telefone);
    const email = normalizarEmail(r.email);

    if (tel && tel.length >= 8) {
      if (porTelefone.has(tel)) {
        const orig = porTelefone.get(tel);
        if (!duplicados.has(r._linha)) duplicados.set(r._linha, { motivo: [], linhasDup: [] });
        duplicados.get(r._linha).motivo.push(`telefone "${r.telefone}"`);
        duplicados.get(r._linha).linhasDup.push(orig._linha);
      } else {
        porTelefone.set(tel, r);
      }
    }

    if (email && email.includes('@')) {
      if (porEmail.has(email)) {
        const orig = porEmail.get(email);
        if (!duplicados.has(r._linha)) duplicados.set(r._linha, { motivo: [], linhasDup: [] });
        duplicados.get(r._linha).motivo.push(`email "${r.email}"`);
        duplicados.get(r._linha).linhasDup.push(orig._linha);
      } else {
        porEmail.set(email, r);
      }
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  RELATÓRIO DE DUPLICADOS');
  console.log('═══════════════════════════════════════════════════════');

  if (duplicados.size === 0) {
    console.log('  Nenhum duplicado encontrado!\n');
  } else {
    console.log(`  ${duplicados.size} registros com possíveis duplicatas:\n`);
    for (const [linha, info] of duplicados) {
      const r = registros.find(x => x._linha === linha);
      console.log(`  Linha ${linha}: "${r.nome}" | tel: ${r.telefone} | email: ${r.email}`);
      console.log(`    Duplica de: linha(s) ${info.linhasDup.join(', ')} | motivo: ${info.motivo.join(', ')}`);
    }
    console.log('');
  }

  // ── 2. Verificar origens ────────────────────────────────────────────────────

  const origensNoCSV   = new Set(registros.map(r => r.origem_contato.toLowerCase().trim()).filter(Boolean));
  const origensNovas   = new Set();
  const origens_sem_map = new Set();

  for (const o of origensNoCSV) {
    const mapeado = mapearOrigem(o);
    if (!mapeado) {
      if (!ORIGENS_VALIDAS.includes(o)) {
        origens_sem_map.add(o);
      }
    } else if (!ORIGENS_VALIDAS.includes(mapeado)) {
      origensNovas.add(mapeado);
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('  ORIGENS ENCONTRADAS NO CSV');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Valores únicos de origem_contato:');
  for (const o of origensNoCSV) {
    const mapeado = mapearOrigem(o);
    const status = mapeado
      ? `→ "${mapeado}" ${ORIGENS_VALIDAS.includes(mapeado) ? '✓' : '⚠️  NOVA'}`
      : `→ ⛔ SEM MAPEAMENTO`;
    console.log(`    "${o}" ${status}`);
  }

  if (origens_sem_map.size > 0) {
    console.log(`\n  ⛔ Origens SEM mapeamento (serão ignoradas ou precisam de ação):`);
    for (const o of origens_sem_map) console.log(`    "${o}"`);
  }
  if (origensNovas.size > 0) {
    console.log(`\n  ⚠️  Origens NOVAS (não existem no sistema — requer atualização do schema):`);
    for (const o of origensNovas) console.log(`    "${o}"`);
  }
  console.log('');

  // ── 3. Gerar SQL ────────────────────────────────────────────────────────────

  const linhasDuplicadas = new Set(duplicados.keys());
  const sem_nome        = registros.filter(r => !r.nome.trim());
  const para_importar   = registros.filter(r => !linhasDuplicadas.has(r._linha) && r.nome.trim());
  const ignorados       = registros.filter(r => linhasDuplicadas.has(r._linha));

  console.log('═══════════════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Total de registros:           ${registros.length}`);
  console.log(`  Sem nome (ignorados):         ${sem_nome.length}`);
  console.log(`  Duplicados (serão ignorados): ${ignorados.length}`);
  console.log(`  Para importar:                ${para_importar.length}`);
  console.log('');

  // Gera SQL
  const linhasSQL = [];
  linhasSQL.push('-- =====================================================');
  linhasSQL.push('-- LIMPEZA + IMPORTAÇÃO DE CLIENTES - gerado por import-clientes.js');
  linhasSQL.push(`-- Data de geração: ${new Date().toISOString()}`);
  linhasSQL.push(`-- Total de registros: ${para_importar.length}`);
  linhasSQL.push('-- =====================================================');
  linhasSQL.push('');
  linhasSQL.push('-- ── Limpeza do banco (exceto usuários) ──────────────');
  linhasSQL.push('-- Ordem respeitando foreign keys');
  linhasSQL.push('DELETE FROM prontuarios;');
  linhasSQL.push('DELETE FROM notas_execucao;');
  linhasSQL.push('DELETE FROM anexos_execucao;');
  linhasSQL.push('DELETE FROM comissoes;');
  linhasSQL.push('DELETE FROM pagamentos_itens;');
  linhasSQL.push('DELETE FROM parcelas;');
  linhasSQL.push('DELETE FROM itens_atendimento;');
  linhasSQL.push('DELETE FROM pagamentos;');
  linhasSQL.push('DELETE FROM atendimentos;');
  linhasSQL.push('DELETE FROM clientes;');
  linhasSQL.push('DELETE FROM procedimentos;');
  linhasSQL.push('-- Reseta os auto-increment');
  linhasSQL.push("DELETE FROM sqlite_sequence WHERE name != 'usuarios';");
  linhasSQL.push('');
  linhasSQL.push('-- ── Inserção dos clientes ────────────────────────────');

  let ignoradoOrigem = 0;
  for (const r of para_importar) {
    const origem = mapearOrigem(r.origem_contato) || 'fachada'; // fallback para fachada
    if (!mapearOrigem(r.origem_contato)) ignoradoOrigem++;

    const data = parseData(r.data_inclusao) || new Date().toISOString().replace('T', ' ').substring(0, 19);

    linhasSQL.push(
      `INSERT INTO clientes (nome, telefone, email, origem, created_at) VALUES (` +
      `${escapeSql(r.nome)}, ${escapeSql(r.telefone || null)}, ${escapeSql(r.email || null)}, ` +
      `${escapeSql(origem)}, ${escapeSql(data)});`
    );
  }

  fs.writeFileSync(OUTPUT_SQL, linhasSQL.join('\n'), 'utf8');

  if (ignoradoOrigem > 0) {
    console.log(`  ⚠️  ${ignoradoOrigem} registros sem origem mapeada → usaram fallback "fachada"`);
    console.log('');
  }

  console.log(`✅ SQL gerado em: ${OUTPUT_SQL}`);
  console.log('');
  console.log('Para importar em produção, execute:');
  console.log('  npx wrangler d1 execute sorria-leste-db --file=lib/import-clientes.sql');
  console.log('');
  console.log('Para testar localmente antes:');
  console.log('  npx wrangler d1 execute sorria-leste-db --local --file=lib/import-clientes.sql');
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
