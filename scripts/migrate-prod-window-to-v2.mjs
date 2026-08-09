#!/usr/bin/env node

import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROD_DB = 'sorria-leste-db';
const STAGING_DB = 'sorria-leste-db-staging';
const PROD_R2 = 'sorria-leste-arquivos';
const STAGING_R2 = 'sorria-leste-arquivos-staging';
const STAGING_URLS = [
  'https://sorria-leste-app-staging.lucas-cardoso.workers.dev/',
  'https://sorria-leste-mcp-staging.lucas-cardoso.workers.dev/',
];
const DEFAULT_SINCE = '2026-07-26T03:00:00.000Z';
const DEFAULT_UNTIL = '2026-08-10T03:00:00.000Z';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const since = arg('--since', DEFAULT_SINCE);
const until = arg('--until', DEFAULT_UNTIL);
const applyRemote = process.argv.includes('--apply');
const realData = process.argv.includes('--real-data');
const sinceMs = Date.parse(since);
const untilMs = Date.parse(until);

if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || sinceMs >= untilMs) {
  throw new Error('Janela inválida. Use --since e --until em RFC3339.');
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  || readFileSync(join(ROOT, 'wrangler.toml'), 'utf8').match(/account_id\s*=\s*"([^"]+)"/)?.[1];

if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID não encontrado.');

const childEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };
const tempDir = mkdtempSync(join(tmpdir(), 'sorria-v2-import-'));
const productionSql = join(tempDir, 'production.sql');
const stagingSql = join(tempDir, 'staging-before.sql');
const productionDb = join(tempDir, 'production.db');
const stagingDb = join(tempDir, 'staging.db');
const importSql = join(tempDir, 'import-v2.sql');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || ''}`
      .replace(/https:\/\/[^\s]+/g, '[URL temporária omitida]')
      .slice(-4000);
    throw new Error(`${command} ${args.slice(0, 4).join(' ')} falhou.\n${detail}`);
  }
  return result.stdout;
}

function wrangler(args) {
  return run('npx', ['wrangler', ...args]);
}

function sqlite(db, sql) {
  const output = run('sqlite3', ['-json', db, sql]);
  return output.trim() ? JSON.parse(output) : [];
}

function readTable(db, table) {
  return sqlite(db, `SELECT * FROM ${table}`);
}

function toTime(value) {
  if (!value) return Number.NaN;
  let normalized = String(value).trim().replace(' ', 'T');
  if (!/(?:Z|[+-]\d\d:\d\d)$/i.test(normalized)) normalized += 'Z';
  return Date.parse(normalized);
}

function inWindow(value) {
  const time = toTime(value);
  return Number.isFinite(time) && time >= sinceMs && time < untilMs;
}

function cents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function bps(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function sqlValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insert(table, row, mode = '') {
  const columns = Object.keys(row);
  return `INSERT ${mode ? `${mode} ` : ''}INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((key) => sqlValue(row[key])).join(', ')});`;
}

function upsert(table, row, conflictColumns, updateColumns = Object.keys(row)) {
  const columns = Object.keys(row);
  const conflicts = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
  const updates = updateColumns
    .filter((column) => !conflicts.includes(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((key) => sqlValue(row[key])).join(', ')}) ON CONFLICT (${conflicts.join(', ')}) DO UPDATE SET ${updates};`;
}

function passwordForStaging(storedPassword) {
  if (String(storedPassword).startsWith('pbkdf2:')) return storedPassword;
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(String(storedPassword), salt, 100_000, 32, 'sha256');
  return `pbkdf2:100000:${salt.toString('hex')}:${derived.toString('hex')}`;
}

function joinedText(...parts) {
  const values = parts.map((part) => String(part || '').trim()).filter(Boolean);
  return values.length ? values.join('\n\n') : null;
}

function safeR2Key(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

async function assertStagingAccessProtected() {
  for (const url of STAGING_URLS) {
    const response = await fetch(url, { redirect: 'manual' });
    const location = response.headers.get('location') || '';
    const accessRedirect = [301, 302, 303, 307, 308].includes(response.status)
      && /cloudflareaccess\.com/i.test(location);
    if (!accessRedirect) {
      throw new Error(`Importação real bloqueada: ${url} ainda não redireciona para o Cloudflare Access.`);
    }
  }
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function firstByTime(rows, field = 'created_at') {
  return [...rows].sort((a, b) => (toTime(a[field]) || 0) - (toTime(b[field]) || 0))[0];
}

function validJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function add(set, value) {
  if (value === null || value === undefined || set.has(Number(value))) return false;
  set.add(Number(value));
  return true;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function mapClinicalStatus(status) {
  if (status === 'triagem') return 'aguardando';
  if (status === 'finalizado' || status === 'encerrado' || status === 'aguardando_pagamento') return 'finalizado';
  return 'em_andamento';
}

function mapAgendaStatus(status) {
  return ['agendado', 'realizado', 'faltou', 'cancelado'].includes(status) ? status : 'agendado';
}

function itemClinicalStatus(items) {
  if (items.length && items.every((item) => item.status === 'concluido')) return 'concluido';
  if (items.some((item) => item.status === 'executando')) return 'em_execucao';
  return 'nao_iniciado';
}

function atendimentoItemStatus(items) {
  if (items.length && items.every((item) => item.status === 'concluido')) return 'realizado';
  if (items.some((item) => item.status === 'executando')) return 'em_execucao';
  return 'planejado';
}

function parseBookmark(output) {
  try {
    const parsed = JSON.parse(output);
    const result = Array.isArray(parsed) ? parsed[0] : parsed;
    return result?.bookmark || result?.result?.bookmark || null;
  } catch {
    return null;
  }
}

try {
  if (realData && applyRemote) await assertStagingAccessProtected();

  console.log(`Preparando cópia ${realData ? 'real protegida' : 'anonimizada'} de ${since} até ${until}...`);

  // A única operação permitida contra produção é exportação (leitura).
  wrangler(['d1', 'export', PROD_DB, '--remote', '--output', productionSql]);
  wrangler(['d1', 'export', STAGING_DB, '--remote', '--output', stagingSql]);
  run('sqlite3', [productionDb, `.read ${productionSql}`]);
  run('sqlite3', [stagingDb, `.read ${stagingSql}`]);

  const prodTables = [
    'usuarios', 'usuario_roles', 'usuario_unidades', 'unidades', 'categorias',
    'procedimentos', 'procedimento_etapas_modelo', 'clientes', 'atendimentos',
    'itens_atendimento', 'agendamentos', 'pagamentos_grupos', 'pagamentos',
    'pagamentos_alocacoes', 'formas_pagamento', 'comissoes',
    'prontuario_evolucoes', 'prontuario_evolucao_itens', 'followup_tarefas',
    'anexos_cliente', 'anexos_execucao',
  ];
  const prod = Object.fromEntries(prodTables.map((table) => [table, readTable(productionDb, table)]));
  const stage = {
    unidades: readTable(stagingDb, 'unidades'),
    formas_pagamento: readTable(stagingDb, 'formas_pagamento'),
  };

  const byId = (rows) => new Map(rows.map((row) => [Number(row.id), row]));
  const atendimentosById = byId(prod.atendimentos);
  const itensById = byId(prod.itens_atendimento);
  const agendasById = byId(prod.agendamentos);
  const pagamentosById = byId(prod.pagamentos);
  const procedimentosById = byId(prod.procedimentos);
  const categoriasById = byId(prod.categorias);
  const usuariosById = byId(prod.usuarios);
  const activeProductionUsers = prod.usuarios.filter((user) => Number(user.ativo) === 1);

  const itensPorAtendimento = groupBy(prod.itens_atendimento, (row) => Number(row.atendimento_id));
  const pagamentosPorAtendimento = groupBy(prod.pagamentos, (row) => Number(row.atendimento_id));
  const alocacoesPorPagamento = groupBy(prod.pagamentos_alocacoes, (row) => Number(row.pagamento_id));
  const alocacoesPorItem = groupBy(prod.pagamentos_alocacoes.filter((row) => row.item_atendimento_id), (row) => Number(row.item_atendimento_id));
  const evolucoesPorAtendimento = groupBy(prod.prontuario_evolucoes, (row) => Number(row.atendimento_id));

  const selectedAtendimentos = new Set();
  const selectedItens = new Set();
  const selectedAgendas = new Set();
  const selectedPagamentos = new Set();
  const selectedEvolucoes = new Set();
  const selectedFollowups = new Set();
  const selectedClientes = new Set(
    prod.clientes.filter((row) => inWindow(row.created_at)).map((row) => Number(row.id)),
  );

  for (const row of prod.atendimentos) {
    if ([row.created_at, row.finalizado_at, row.liberado_em].some(inWindow)) add(selectedAtendimentos, row.id);
  }
  for (const row of prod.itens_atendimento) {
    if ([row.created_at, row.concluido_at].some(inWindow)) add(selectedItens, row.id);
  }
  for (const row of prod.agendamentos) {
    if ([row.created_at, row.updated_at, row.data_agendada].some(inWindow)) add(selectedAgendas, row.id);
  }
  for (const row of prod.pagamentos) {
    if (inWindow(row.created_at)) add(selectedPagamentos, row.id);
  }
  for (const row of prod.prontuario_evolucoes) {
    if ([row.created_at, row.updated_at].some(inWindow)) add(selectedEvolucoes, row.id);
  }
  for (const row of prod.followup_tarefas) {
    if ([row.created_at, row.updated_at, row.concluida_em, row.excluida_em].some(inWindow)) add(selectedFollowups, row.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...selectedAtendimentos]) {
      const atendimento = atendimentosById.get(id);
      if (!atendimento) continue;
      changed = add(selectedClientes, atendimento.cliente_id) || changed;
      for (const item of itensPorAtendimento.get(id) || []) changed = add(selectedItens, item.id) || changed;
      for (const pagamento of pagamentosPorAtendimento.get(id) || []) changed = add(selectedPagamentos, pagamento.id) || changed;
      for (const evolucao of evolucoesPorAtendimento.get(id) || []) changed = add(selectedEvolucoes, evolucao.id) || changed;
      if (atendimento.agendamento_id) changed = add(selectedAgendas, atendimento.agendamento_id) || changed;
    }
    for (const id of [...selectedItens]) {
      const item = itensById.get(id);
      if (!item) continue;
      changed = add(selectedAtendimentos, item.atendimento_id) || changed;
      changed = add(selectedAgendas, item.origem_agendamento_id) || changed;
      for (const allocation of alocacoesPorItem.get(id) || []) changed = add(selectedPagamentos, allocation.pagamento_id) || changed;
    }
    for (const id of [...selectedAgendas]) {
      const agenda = agendasById.get(id);
      if (!agenda) continue;
      changed = add(selectedClientes, agenda.cliente_id) || changed;
      changed = add(selectedAtendimentos, agenda.atendimento_origem_id) || changed;
      changed = add(selectedAtendimentos, agenda.atendimento_sessao_id) || changed;
      changed = add(selectedItens, agenda.item_atendimento_origem_id) || changed;
    }
    for (const id of [...selectedPagamentos]) {
      const pagamento = pagamentosById.get(id);
      if (!pagamento) continue;
      changed = add(selectedAtendimentos, pagamento.atendimento_id) || changed;
      for (const allocation of alocacoesPorPagamento.get(id) || []) {
        changed = add(selectedItens, allocation.item_atendimento_id) || changed;
        changed = add(selectedAgendas, allocation.agendamento_id) || changed;
      }
      if (pagamento.pagamento_grupo_id) {
        for (const sibling of prod.pagamentos) {
          if (Number(sibling.pagamento_grupo_id) === Number(pagamento.pagamento_grupo_id)) {
            changed = add(selectedPagamentos, sibling.id) || changed;
          }
        }
      }
    }
    for (const id of [...selectedEvolucoes]) {
      const evolucao = prod.prontuario_evolucoes.find((row) => Number(row.id) === id);
      if (evolucao) changed = add(selectedAtendimentos, evolucao.atendimento_id) || changed;
    }
  }

  for (const id of selectedFollowups) {
    const followup = prod.followup_tarefas.find((row) => Number(row.id) === id);
    if (followup) add(selectedClientes, followup.cliente_id);
  }

  const atendimentos = prod.atendimentos.filter((row) => selectedAtendimentos.has(Number(row.id)));
  const itens = prod.itens_atendimento.filter((row) => selectedItens.has(Number(row.id)));
  const agendas = prod.agendamentos.filter((row) => selectedAgendas.has(Number(row.id)));
  const pagamentos = prod.pagamentos.filter((row) => selectedPagamentos.has(Number(row.id)));
  const evolucoes = prod.prontuario_evolucoes.filter((row) => selectedEvolucoes.has(Number(row.id)));
  const followups = prod.followup_tarefas.filter((row) => selectedFollowups.has(Number(row.id)));
  const clientes = prod.clientes.filter((row) => selectedClientes.has(Number(row.id)));
  const anexosCliente = prod.anexos_cliente.filter((row) => (
    selectedClientes.has(Number(row.cliente_id)) && inWindow(row.created_at)
  ));
  const anexosExecucao = prod.anexos_execucao.filter((row) => selectedItens.has(Number(row.item_atendimento_id)));

  const batchSlug = `${since.slice(0, 10).replaceAll('-', '')}-${until.slice(0, 10).replaceAll('-', '')}`;
  const prefix = `prod14d-${batchSlug}`;
  const importId = `${prefix}-${realData ? 'real' : 'anon'}`;
  const idFor = (type, source) => `${prefix}-${type}-${hash(source)}`;
  const clientId = (id) => -(1_000_000 + Number(id));
  const userId = (id) => -(2_000_000 + Number(id));
  const categoryId = (id) => -(3_000_000 + Number(id));
  const procedureCatalogId = (id) => -(4_000_000 + Number(id));
  const stageModelId = (id) => -(5_000_000 + Number(id));
  const fallbackUser = userId(prod.usuarios[0]?.id);
  const mappedUser = (id) => usuariosById.has(Number(id)) ? userId(id) : fallbackUser;

  const stageUnitById = byId(stage.unidades);
  function mappedUnit(id) {
    if (stageUnitById.has(Number(id))) return Number(id);
    return Number(stage.unidades[0]?.id || 1);
  }

  const formMap = new Map();
  const missingForms = [];
  for (const source of prod.formas_pagamento) {
    const unit = mappedUnit(source.unidade_id);
    const target = stage.formas_pagamento.find((candidate) => (
      Number(candidate.unidade_id) === unit
      && candidate.grupo === source.grupo
      && candidate.subgrupo === source.subgrupo
      && candidate.metodo_base === source.metodo_base
    ));
    if (target) formMap.set(Number(source.id), Number(target.id));
    else {
      const id = -(6_000_000 + Number(source.id));
      formMap.set(Number(source.id), id);
      missingForms.push({ ...source, id, unidade_id: unit });
    }
  }
  function mappedForm(payment, unitId) {
    if (payment.forma_pagamento_id && formMap.has(Number(payment.forma_pagamento_id))) {
      return formMap.get(Number(payment.forma_pagamento_id));
    }
    const fallback = stage.formas_pagamento.find((form) => Number(form.unidade_id) === Number(unitId) && form.metodo_base === payment.metodo)
      || stage.formas_pagamento.find((form) => Number(form.unidade_id) === Number(unitId));
    if (!fallback) throw new Error(`Nenhuma forma de pagamento disponível na unidade ${unitId}.`);
    return Number(fallback.id);
  }

  const itemMap = byId(prod.itens_atendimento);
  function rootItem(item, visited = new Set()) {
    if (!item || visited.has(Number(item.id))) return item;
    visited.add(Number(item.id));
    if (item.origem_agendamento_id) {
      const agenda = agendasById.get(Number(item.origem_agendamento_id));
      const source = agenda?.item_atendimento_origem_id ? itemMap.get(Number(agenda.item_atendimento_origem_id)) : null;
      if (source) return rootItem(source, visited);
    }
    return item;
  }
  function procedureKeyForItem(item) {
    const root = rootItem(item) || item;
    return root.group_id ? `group:${root.group_id}` : `item:${root.id}`;
  }
  function procedureKeyForAgenda(agenda) {
    if (agenda.item_atendimento_origem_id && itemMap.has(Number(agenda.item_atendimento_origem_id))) {
      return procedureKeyForItem(itemMap.get(Number(agenda.item_atendimento_origem_id)));
    }
    return agenda.procedimento_id ? `agenda:${agenda.id}` : null;
  }

  const procedureSources = new Map();
  for (const item of itens) {
    const key = procedureKeyForItem(item);
    if (!procedureSources.has(key)) procedureSources.set(key, { key, items: [], agendas: [] });
    procedureSources.get(key).items.push(item);
  }
  for (const agenda of agendas) {
    const key = procedureKeyForAgenda(agenda);
    if (!key) continue;
    if (!procedureSources.has(key)) procedureSources.set(key, { key, items: [], agendas: [] });
    procedureSources.get(key).agendas.push(agenda);
  }

  const clinicalAtendimentos = atendimentos.filter((atendimento) => (
    (itensPorAtendimento.get(Number(atendimento.id)) || []).some((item) => selectedItens.has(Number(item.id)))
    || atendimento.avaliador_id !== null
  ));
  const clinicalAtendimentoIds = new Set(clinicalAtendimentos.map((row) => Number(row.id)));
  const evaluationAtendimentoIds = new Set(clinicalAtendimentos.filter((atendimento) => {
    const category = categoriasById.get(Number(atendimento.categoria_id));
    return atendimento.tipo === 'normal' && atendimento.avaliador_id !== null && Number(category?.pula_avaliacao || 0) !== 1;
  }).map((row) => Number(row.id)));

  const procedureRecords = [];
  const procIdByKey = new Map();
  const procSourceById = new Map();
  const mappedItemProc = new Map();
  const mappedAgendaProc = new Map();

  for (const source of procedureSources.values()) {
    const rootedItems = source.items.filter((item) => !item.origem_agendamento_id);
    const commercialItems = rootedItems.length ? rootedItems : source.items.length ? [firstByTime(source.items)] : [];
    const firstItem = firstByTime(commercialItems.length ? commercialItems : source.items);
    const firstAgenda = firstByTime(source.agendas);
    const catalogId = Number(firstItem?.procedimento_id || firstAgenda?.procedimento_id);
    const catalog = procedimentosById.get(catalogId);
    if (!catalog) continue;

    const atendimento = firstItem ? atendimentosById.get(Number(firstItem.atendimento_id)) : firstAgenda?.atendimento_origem_id ? atendimentosById.get(Number(firstAgenda.atendimento_origem_id)) : null;
    const hasEvaluation = atendimento && evaluationAtendimentoIds.has(Number(atendimento.id));
    const tableCents = commercialItems.length
      ? commercialItems.reduce((sum, item) => sum + cents(item.valor_original ?? item.valor), 0)
      : cents(firstAgenda?.valor ?? catalog.valor);
    const finalFromItems = commercialItems.length
      ? commercialItems.reduce((sum, item) => sum + cents(item.valor_final ?? item.valor), 0)
      : cents(firstAgenda?.valor ?? catalog.valor);
    const finalCents = Math.min(tableCents, finalFromItems);
    const discountCents = Math.max(0, tableCents - finalCents);
    const paidSnapshot = commercialItems.length
      ? commercialItems.reduce((sum, item) => sum + cents(item.valor_pago), 0)
      : cents(firstAgenda?.valor_pago);
    const hasDatedActiveAgenda = source.agendas.some((agenda) => agenda.data_agendada && !['cancelado', 'faltou'].includes(agenda.status));
    const accepted = paidSnapshot > 0
      || source.items.some((item) => item.status !== 'pendente' || Number(item.adicionado_em_execucao) === 1)
      || source.agendas.some((agenda) => Number(agenda.pago) === 1)
      || hasDatedActiveAgenda;
    const addition = source.items.some((item) => Number(item.adicionado_em_execucao) === 1);
    const procId = idFor('proc', source.key);
    const actor = mappedUser(firstItem?.criado_por_id || atendimento?.avaliador_id || firstAgenda?.criado_por_id);
    const createdAt = firstItem?.created_at || firstAgenda?.created_at || since;
    const statusClinico = source.items.length
      ? itemClinicalStatus(source.items)
      : source.agendas.some((agenda) => agenda.status === 'realizado') ? 'concluido' : 'nao_iniciado';
    const unit = mappedUnit(atendimento?.unidade_id || firstAgenda?.unidade_id);
    const customer = clientId(atendimento?.cliente_id || firstAgenda?.cliente_id);
    const origin = addition ? 'acrescimo_execucao' : hasEvaluation ? 'avaliacao' : 'importado';
    const evaluationId = hasEvaluation ? idFor('avaliacao', atendimento.id) : null;
    const budgetId = hasEvaluation ? idFor('orcamento', atendimento.id) : null;
    const quantity = catalog.por_dente
      ? Math.max(1, unique(commercialItems.map((item) => item.dente_unico).filter(Boolean)).length || commercialItems.length)
      : Math.max(1, Number(firstItem?.quantidade || 1));

    const record = {
      id: procId,
      key: source.key,
      source,
      customer,
      unit,
      catalog,
      catalogId,
      atendimento,
      actor,
      paidSnapshot,
      row: {
        id: procId,
        cliente_id: customer,
        unidade_id: unit,
        orcamento_id: budgetId,
        avaliacao_id: evaluationId,
        procedimento_catalogo_id: procedureCatalogId(catalogId),
        atendimento_origem_id: addition && atendimento ? idFor('atendimento', atendimento.id) : null,
        origem: origin,
        criado_por_id: actor,
        avaliador_id: atendimento?.avaliador_id ? mappedUser(atendimento.avaliador_id) : null,
        executor_preferencial_id: firstItem?.executor_id ? mappedUser(firstItem.executor_id) : firstAgenda?.executor_id ? mappedUser(firstAgenda.executor_id) : null,
        nome_snapshot: catalog.nome,
        descricao_snapshot: catalog.descricao,
        quantidade: quantity,
        valor_tabela_centavos: tableCents,
        desconto_centavos: discountCents,
        valor_final_centavos: finalCents,
        desconto_motivo: discountCents ? 'Desconto importado do sistema legado' : null,
        comissao_avaliacao_bps: bps(catalog.comissao_venda),
        comissao_acrescimo_bps: bps(catalog.comissao_acrescimo),
        comissao_execucao_bps: bps(catalog.comissao_execucao),
        status_comercial: accepted ? 'aceito' : 'proposto',
        status_clinico: statusClinico,
        aceite_tipo: accepted ? (addition ? 'verbal_execucao' : 'administrativo') : null,
        aceite_observacao: addition ? 'Aceite verbal inferido do acréscimo registrado no legado.' : null,
        aceito_por_id: accepted ? actor : null,
        aceito_em: accepted ? createdAt : null,
        concluido_em: statusClinico === 'concluido' ? source.items.map((item) => item.concluido_at).filter(Boolean).sort().at(-1) || createdAt : null,
        created_at: createdAt,
        updated_at: source.items.map((item) => item.concluido_at || item.created_at).filter(Boolean).sort().at(-1) || createdAt,
      },
    };
    procedureRecords.push(record);
    procIdByKey.set(source.key, procId);
    procSourceById.set(procId, record);
    for (const item of source.items) mappedItemProc.set(Number(item.id), procId);
    for (const agenda of source.agendas) mappedAgendaProc.set(Number(agenda.id), procId);
  }

  const procsByEvaluationAtendimento = groupBy(
    procedureRecords.filter((record) => record.row.avaliacao_id),
    (record) => Number(record.atendimento.id),
  );

  const datedAgendas = agendas.filter((agenda) => agenda.data_agendada && String(agenda.data_agendada).trim());
  const agendaIdByLegacy = new Map(datedAgendas.map((agenda) => [Number(agenda.id), idFor('agenda', agenda.id)]));
  const clinicalIdByLegacy = new Map(clinicalAtendimentos.map((atendimento) => [Number(atendimento.id), idFor('atendimento', atendimento.id)]));

  const lines = [
    realData
      ? '-- Gerado automaticamente; contém dados reais e só pode ser aplicado após validar Cloudflare Access.'
      : '-- Gerado automaticamente; contém somente dados anonimizados.',
    'PRAGMA foreign_keys = ON;',
    `DELETE FROM v2_importacoes_legado WHERE id IN (${sqlValue(`${prefix}-anon`)}, ${sqlValue(`${prefix}-real`)});`,
    `DELETE FROM anexos_cliente WHERE caminho LIKE ${sqlValue(`imports/${prefix}/%`)};`,
  ];
  const prefixedTables = [
    'eventos_dominio', 'comissoes_v2', 'procedimento_cliente_followups',
    'cliente_saldo_movimentos', 'recebimento_alocacoes', 'recebimento_formas',
    'recebimentos', 'evolucao_procedimentos', 'evolucoes_clinicas',
    'atendimento_procedimentos', 'agenda_compromisso_itens',
    'procedimento_cliente_etapas', 'procedimento_cliente_dentes',
    'procedimentos_cliente', 'orcamentos', 'avaliacoes', 'atendimentos_clinicos',
    'agenda_compromissos',
  ];
  for (const table of prefixedTables) lines.push(`DELETE FROM ${table} WHERE id LIKE ${sqlValue(`${prefix}-%`)};`);

  for (const user of prod.usuarios) {
    lines.push(upsert('usuarios', {
      id: userId(user.id),
      nome: realData ? user.nome : `Profissional homologação #${user.id}`,
      email: `profissional-${user.id}@staging.invalid`,
      senha: '!conta-importada-desabilitada!',
      role: ['atendente', 'avaliador', 'executor', 'admin'].includes(user.role) ? user.role : 'executor',
      ativo: 0,
      valor_diaria: realData ? user.valor_diaria : 0,
      created_at: user.created_at,
    }, 'id'));
  }
  for (const role of prod.usuario_roles) {
    lines.push(insert('usuario_roles', {
      usuario_id: userId(role.usuario_id), role: role.role, created_at: role.created_at,
    }, 'OR IGNORE'));
  }
  for (const relation of prod.usuario_unidades) {
    lines.push(insert('usuario_unidades', {
      usuario_id: userId(relation.usuario_id), unidade_id: mappedUnit(relation.unidade_id), created_at: relation.created_at,
    }, 'OR IGNORE'));
  }

  if (realData) {
    for (const user of activeProductionUsers) {
      const email = String(user.email || '').toLowerCase().trim();
      if (!email || !user.senha) throw new Error(`Usuário ativo ${user.id} sem credencial válida.`);
      const primaryRole = ['atendente', 'avaliador', 'executor', 'admin'].includes(user.role) ? user.role : 'executor';
      lines.push(upsert('usuarios', {
        nome: user.nome,
        email,
        senha: passwordForStaging(user.senha),
        role: primaryRole,
        ativo: 1,
        valor_diaria: user.valor_diaria,
        created_at: user.created_at,
      }, 'email'));
      lines.push(`DELETE FROM usuario_roles WHERE usuario_id = (SELECT id FROM usuarios WHERE email = ${sqlValue(email)});`);
      const effectiveRoles = unique([
        ...prod.usuario_roles.filter((row) => Number(row.usuario_id) === Number(user.id)).map((row) => row.role),
        primaryRole,
      ]);
      for (const role of effectiveRoles) {
        lines.push(`INSERT OR IGNORE INTO usuario_roles (usuario_id, role, created_at) SELECT id, ${sqlValue(role)}, ${sqlValue(user.created_at)} FROM usuarios WHERE email = ${sqlValue(email)};`);
      }
      lines.push(`DELETE FROM usuario_unidades WHERE usuario_id = (SELECT id FROM usuarios WHERE email = ${sqlValue(email)});`);
      const unitIds = unique(prod.usuario_unidades
        .filter((row) => Number(row.usuario_id) === Number(user.id))
        .map((row) => mappedUnit(row.unidade_id)));
      for (const unitId of unitIds.length ? unitIds : [mappedUnit(null)]) {
        lines.push(`INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id, created_at) SELECT id, ${sqlValue(unitId)}, ${sqlValue(user.created_at)} FROM usuarios WHERE email = ${sqlValue(email)};`);
      }
    }
  }

  for (const client of clientes) {
    lines.push(upsert('clientes', {
      id: clientId(client.id),
      nome: realData ? client.nome : `Paciente homologação #${client.id}`,
      cpf: realData ? client.cpf : null,
      telefone: realData ? client.telefone : null,
      email: realData ? client.email : null,
      data_nascimento: realData ? client.data_nascimento : null,
      endereco: realData ? client.endereco : null,
      origem: client.origem,
      sexo: realData ? client.sexo : null,
      plano_odontologico: realData ? client.plano_odontologico : null,
      observacoes: realData ? client.observacoes : `Registro anonimizado importado da produção (${batchSlug}).`,
      created_at: client.created_at,
    }, 'id'));
  }

  const r2Copies = [];
  if (realData) {
    for (const attachment of anexosCliente) {
      const targetKey = `imports/${prefix}/cliente/${attachment.id}/${safeR2Key(attachment.caminho)}`;
      lines.push(upsert('anexos_cliente', {
        id: -(7_000_000 + Number(attachment.id)),
        cliente_id: clientId(attachment.cliente_id),
        usuario_id: mappedUser(attachment.usuario_id),
        nome_arquivo: attachment.nome_arquivo,
        tipo_arquivo: attachment.tipo_arquivo,
        caminho: targetKey,
        tamanho: attachment.tamanho,
        descricao: attachment.descricao,
        created_at: attachment.created_at,
      }, 'id'));
      r2Copies.push({
        sourceKey: attachment.caminho,
        targetKey,
        contentType: attachment.tipo_arquivo,
      });
    }
    for (const attachment of anexosExecucao) {
      const item = itensById.get(Number(attachment.item_atendimento_id));
      const atendimento = item ? atendimentosById.get(Number(item.atendimento_id)) : null;
      if (!atendimento || !selectedClientes.has(Number(atendimento.cliente_id))) continue;
      const targetKey = `imports/${prefix}/execucao/${attachment.id}/${safeR2Key(attachment.caminho)}`;
      lines.push(upsert('anexos_cliente', {
        id: -(8_000_000 + Number(attachment.id)),
        cliente_id: clientId(atendimento.cliente_id),
        usuario_id: mappedUser(attachment.usuario_id),
        nome_arquivo: attachment.nome_arquivo,
        tipo_arquivo: attachment.tipo_arquivo,
        caminho: targetKey,
        tamanho: attachment.tamanho,
        descricao: joinedText('Anexo clínico migrado da execução.', attachment.descricao),
        created_at: attachment.created_at,
      }, 'id'));
      r2Copies.push({
        sourceKey: attachment.caminho,
        targetKey,
        contentType: attachment.tipo_arquivo,
      });
    }
  }

  const referencedCatalogIds = unique(procedureRecords.map((record) => record.catalogId));
  const referencedCategoryIds = unique(referencedCatalogIds.map((id) => procedimentosById.get(id)?.categoria_id));
  for (const id of referencedCategoryIds) {
    const category = categoriasById.get(Number(id));
    if (!category) continue;
    lines.push(insert('categorias', {
      id: categoryId(category.id), nome: category.nome,
      slug: `importado-${category.id}-${category.slug}`,
      cor: category.cor, icone: category.icone, ativo: category.ativo,
      ordem: category.ordem, pula_avaliacao: category.pula_avaliacao,
      created_at: category.created_at,
    }, 'OR IGNORE'));
  }
  for (const id of referencedCatalogIds) {
    const catalog = procedimentosById.get(Number(id));
    if (!catalog) continue;
    lines.push(insert('procedimentos', {
      id: procedureCatalogId(catalog.id), nome: catalog.nome, descricao: catalog.descricao,
      valor: catalog.valor, comissao_venda: catalog.comissao_venda,
      comissao_acrescimo: catalog.comissao_acrescimo,
      comissao_execucao: catalog.comissao_execucao, por_dente: catalog.por_dente,
      tem_etapas: catalog.tem_etapas, tem_face: catalog.tem_face,
      categoria_id: catalog.categoria_id ? categoryId(catalog.categoria_id) : null,
      ativo: catalog.ativo, created_at: catalog.created_at,
    }, 'OR IGNORE'));
  }
  for (const model of prod.procedimento_etapas_modelo.filter((row) => referencedCatalogIds.includes(Number(row.procedimento_id)))) {
    lines.push(insert('procedimento_etapas_modelo', {
      id: stageModelId(model.id), procedimento_id: procedureCatalogId(model.procedimento_id),
      nome: model.nome, valor: model.valor, comissao_venda: model.comissao_venda,
      comissao_acrescimo: model.comissao_acrescimo,
      comissao_execucao: model.comissao_execucao, ordem: model.ordem,
    }, 'OR IGNORE'));
  }
  for (const form of missingForms) {
    lines.push(insert('formas_pagamento', {
      id: form.id, unidade_id: form.unidade_id, grupo: form.grupo,
      subgrupo: form.subgrupo, metodo_base: form.metodo_base, ativo: 0,
      created_at: form.created_at, updated_at: form.updated_at,
    }, 'OR IGNORE'));
  }
  for (const client of clientes) {
    const units = unique([
      ...atendimentos.filter((row) => Number(row.cliente_id) === Number(client.id)).map((row) => mappedUnit(row.unidade_id)),
      ...agendas.filter((row) => Number(row.cliente_id) === Number(client.id)).map((row) => mappedUnit(row.unidade_id)),
      ...followups.filter((row) => Number(row.cliente_id) === Number(client.id)).map((row) => mappedUnit(row.unidade_id)),
    ]);
    for (const unit of units.length ? units : [mappedUnit(null)]) {
      lines.push(insert('cliente_unidades_v2', {
        cliente_id: clientId(client.id), unidade_id: unit, vinculado_por_id: fallbackUser,
        created_at: client.created_at,
      }, 'OR IGNORE'));
    }
  }

  for (const agenda of datedAgendas) {
    const unit = mappedUnit(agenda.unidade_id);
    lines.push(insert('agenda_compromissos', {
      id: agendaIdByLegacy.get(Number(agenda.id)),
      cliente_id: clientId(agenda.cliente_id), unidade_id: unit,
      finalidade_avaliacao: agenda.tipo === 'avaliacao' ? 1 : 0,
      avaliador_id: agenda.tipo === 'avaliacao' && agenda.executor_id ? mappedUser(agenda.executor_id) : null,
      data_agendada: agenda.data_agendada, duracao_minutos: 60,
      status: mapAgendaStatus(agenda.status), observacoes: realData ? agenda.observacoes : null,
      criado_por_id: mappedUser(agenda.criado_por_id || agenda.executor_id),
      cancelado_por_id: null,
      cancelado_em: agenda.status === 'cancelado' ? agenda.updated_at : null,
      motivo_cancelamento: agenda.status === 'cancelado'
        ? (realData ? agenda.motivo_cancelamento || 'Cancelamento importado do sistema legado' : 'Cancelamento importado do sistema legado')
        : null,
      idempotency_key: `${prefix}-agenda-${agenda.id}`,
      created_at: agenda.created_at, updated_at: agenda.updated_at,
    }));
  }

  for (const atendimento of clinicalAtendimentos) {
    const mappedAgenda = agendaIdByLegacy.get(Number(atendimento.agendamento_id)) || null;
    const status = mapClinicalStatus(atendimento.status);
    const itemActor = firstByTime((itensPorAtendimento.get(Number(atendimento.id)) || []).filter((item) => selectedItens.has(Number(item.id))));
    lines.push(insert('atendimentos_clinicos', {
      id: clinicalIdByLegacy.get(Number(atendimento.id)),
      cliente_id: clientId(atendimento.cliente_id), unidade_id: mappedUnit(atendimento.unidade_id),
      agenda_compromisso_id: mappedAgenda,
      categoria_id: atendimento.categoria_id ? categoryId(atendimento.categoria_id) : null,
      status,
      criado_por_id: mappedUser(atendimento.avaliador_id || itemActor?.criado_por_id || atendimento.liberado_por_id),
      checkin_em: atendimento.created_at,
      iniciado_em: status === 'aguardando' ? null : atendimento.liberado_em || atendimento.created_at,
      finalizado_em: status === 'finalizado' ? atendimento.finalizado_at || atendimento.created_at : null,
      cancelado_em: null, cancelado_por_id: null, motivo_cancelamento: null,
      observacoes: realData
        ? joinedText(atendimento.observacoes, atendimento.observacoes_encerramento, atendimento.motivo_saida)
        : null,
      idempotency_key: `${prefix}-atendimento-${atendimento.id}`,
      created_at: atendimento.created_at,
      updated_at: atendimento.finalizado_at || atendimento.liberado_em || atendimento.created_at,
    }));
  }

  for (const atendimento of clinicalAtendimentos.filter((row) => evaluationAtendimentoIds.has(Number(row.id)))) {
    const linked = procsByEvaluationAtendimento.get(Number(atendimento.id)) || [];
    const concluded = !['triagem', 'avaliacao'].includes(atendimento.status);
    const evaluationId = idFor('avaliacao', atendimento.id);
    const budgetId = idFor('orcamento', atendimento.id);
    lines.push(insert('avaliacoes', {
      id: evaluationId, atendimento_clinico_id: clinicalIdByLegacy.get(Number(atendimento.id)),
      cliente_id: clientId(atendimento.cliente_id), unidade_id: mappedUnit(atendimento.unidade_id),
      avaliador_id: mappedUser(atendimento.avaliador_id),
      status: concluded ? 'concluida' : 'em_andamento',
      motivo_sem_orcamento: concluded && linked.length === 0 ? 'Importação legado: avaliação concluída sem procedimento registrado.' : null,
      observacoes: realData ? atendimento.observacoes : null,
      concluida_em: concluded ? atendimento.finalizado_at || atendimento.liberado_em || atendimento.created_at : null,
      cancelada_em: null, created_at: atendimento.created_at,
      updated_at: atendimento.finalizado_at || atendimento.liberado_em || atendimento.created_at,
    }));
    if (linked.length) {
      const acceptedCount = linked.filter((record) => record.row.status_comercial === 'aceito').length;
      const status = acceptedCount === 0 ? 'apresentado' : acceptedCount === linked.length ? 'aceito' : 'parcialmente_aceito';
      lines.push(insert('orcamentos', {
        id: budgetId, avaliacao_id: evaluationId,
        cliente_id: clientId(atendimento.cliente_id), unidade_id: mappedUnit(atendimento.unidade_id),
        avaliador_id: mappedUser(atendimento.avaliador_id), status,
        observacoes: realData ? atendimento.observacoes_encerramento : null, validade_em: null,
        apresentado_em: atendimento.liberado_em || atendimento.created_at,
        cancelado_em: null, cancelado_por_id: null, motivo_cancelamento: null,
        created_at: atendimento.created_at,
        updated_at: atendimento.finalizado_at || atendimento.liberado_em || atendimento.created_at,
      }));
    }
  }

  for (const record of procedureRecords) {
    // Procedimentos de avaliações sem itens não criam orçamento vazio automaticamente.
    if (record.row.orcamento_id && !(procsByEvaluationAtendimento.get(Number(record.atendimento.id)) || []).length) {
      record.row.orcamento_id = null;
      record.row.avaliacao_id = null;
      record.row.origem = 'importado';
    }
    lines.push(insert('procedimentos_cliente', record.row));

    const teeth = new Map();
    for (const item of record.source.items.filter((candidate) => !candidate.origem_agendamento_id)) {
      if (item.dente_unico) teeth.set(String(item.dente_unico), []);
      for (const entry of validJsonArray(item.dentes)) {
        if (typeof entry === 'string' || typeof entry === 'number') teeth.set(String(entry), []);
        else if (entry && typeof entry === 'object' && (entry.dente || entry.numero)) {
          teeth.set(String(entry.dente || entry.numero), Array.isArray(entry.faces) ? entry.faces : []);
        }
      }
    }
    for (const [tooth, faces] of teeth) {
      lines.push(insert('procedimento_cliente_dentes', {
        id: idFor('dente', `${record.id}:${tooth}`), procedimento_cliente_id: record.id,
        dente: tooth, faces_json: JSON.stringify(faces), created_at: record.row.created_at,
      }));
    }

    const models = prod.procedimento_etapas_modelo
      .filter((model) => Number(model.procedimento_id) === record.catalogId)
      .sort((a, b) => Number(a.ordem) - Number(b.ordem));
    let distributed = 0;
    for (const [index, model] of models.entries()) {
      const value = model.valor !== null
        ? cents(model.valor)
        : index === models.length - 1
          ? Math.max(0, record.row.valor_final_centavos - distributed)
          : Math.floor(record.row.valor_final_centavos / models.length);
      distributed += value;
      lines.push(insert('procedimento_cliente_etapas', {
        id: idFor('etapa', `${record.id}:${model.id}`), procedimento_cliente_id: record.id,
        etapa_modelo_id: stageModelId(model.id), nome_snapshot: model.nome,
        ordem: model.ordem, valor_centavos: value,
        comissao_avaliacao_bps: bps(model.comissao_venda),
        comissao_acrescimo_bps: bps(model.comissao_acrescimo),
        comissao_execucao_bps: bps(model.comissao_execucao),
        executor_id: record.row.executor_preferencial_id,
        status_clinico: record.row.status_clinico === 'concluido' ? 'concluida' : 'nao_iniciada',
        iniciado_em: null,
        concluido_em: record.row.status_clinico === 'concluido' ? record.row.concluido_em : null,
        created_at: record.row.created_at, updated_at: record.row.updated_at,
      }));
    }
  }

  for (const agenda of datedAgendas.filter((row) => row.tipo === 'procedimento')) {
    const procId = mappedAgendaProc.get(Number(agenda.id));
    if (!procId) continue;
    const source = procSourceById.get(procId);
    const model = agenda.etapa_modelo_id
      ? prod.procedimento_etapas_modelo.find((row) => Number(row.id) === Number(agenda.etapa_modelo_id))
      : null;
    lines.push(insert('agenda_compromisso_itens', {
      id: idFor('agenda-item', agenda.id),
      agenda_compromisso_id: agendaIdByLegacy.get(Number(agenda.id)),
      procedimento_cliente_id: procId,
      procedimento_cliente_etapa_id: model ? idFor('etapa', `${source.id}:${model.id}`) : null,
      profissional_id: agenda.executor_id ? mappedUser(agenda.executor_id) : null,
      observacoes: realData ? agenda.observacoes : null, created_at: agenda.created_at,
    }));
  }

  const selectedItensPorAtendimento = groupBy(itens, (row) => Number(row.atendimento_id));
  const atendimentoProcId = new Map();
  for (const [atendimentoId, rows] of selectedItensPorAtendimento) {
    if (!clinicalAtendimentoIds.has(Number(atendimentoId))) continue;
    const byProc = groupBy(rows.filter((row) => mappedItemProc.has(Number(row.id))), (row) => mappedItemProc.get(Number(row.id)));
    for (const [procId, procItems] of byProc) {
      const id = idFor('atendimento-proc', `${atendimentoId}:${procId}`);
      atendimentoProcId.set(`${atendimentoId}:${procId}`, id);
      const actorItem = firstByTime(procItems);
      const status = atendimentoItemStatus(procItems);
      lines.push(insert('atendimento_procedimentos', {
        id, atendimento_clinico_id: clinicalIdByLegacy.get(Number(atendimentoId)),
        procedimento_cliente_id: procId, procedimento_cliente_etapa_id: null,
        executor_id: actorItem?.executor_id ? mappedUser(actorItem.executor_id) : null,
        status,
        iniciado_em: status === 'em_execucao' || status === 'realizado' ? actorItem.created_at : null,
        concluido_em: status === 'realizado' ? procItems.map((item) => item.concluido_at).filter(Boolean).sort().at(-1) || actorItem.created_at : null,
        observacoes: null, created_at: actorItem.created_at,
        updated_at: procItems.map((item) => item.concluido_at || item.created_at).filter(Boolean).sort().at(-1) || actorItem.created_at,
      }));
    }
  }

  const evolutionLinks = groupBy(prod.prontuario_evolucao_itens, (row) => Number(row.evolucao_id));
  for (const evolution of evolucoes) {
    if (!clinicalIdByLegacy.has(Number(evolution.atendimento_id))) continue;
    const atendimento = atendimentosById.get(Number(evolution.atendimento_id));
    const evolutionId = idFor('evolucao', evolution.id);
    lines.push(insert('evolucoes_clinicas', {
      id: evolutionId, atendimento_clinico_id: clinicalIdByLegacy.get(Number(evolution.atendimento_id)),
      cliente_id: clientId(atendimento.cliente_id), unidade_id: mappedUnit(atendimento.unidade_id),
      profissional_id: mappedUser(evolution.usuario_id),
      texto: realData
        ? joinedText(evolution.descricao, evolution.observacoes) || 'Evolução clínica importada do legado.'
        : 'Evolução clínica importada do legado; conteúdo livre omitido no staging.',
      idempotency_key: `${prefix}-evolucao-${evolution.id}`, created_at: evolution.created_at,
    }));
    const linkedProcIds = unique((evolutionLinks.get(Number(evolution.id)) || [])
      .map((link) => mappedItemProc.get(Number(link.item_atendimento_id))));
    for (const procId of linkedProcIds) {
      lines.push(insert('evolucao_procedimentos', {
        id: idFor('evolucao-proc', `${evolution.id}:${procId}`), evolucao_id: evolutionId,
        procedimento_cliente_id: procId, procedimento_cliente_etapa_id: null,
        created_at: evolution.created_at,
      }));
    }
  }

  const receiptAllocationByLegacy = new Map();
  const netAllocatedByProc = new Map();
  const paymentGroups = groupBy(pagamentos, (payment) => payment.pagamento_grupo_id ? `group:${payment.pagamento_grupo_id}` : `payment:${payment.id}`);
  for (const [groupKey, forms] of paymentGroups) {
    const atendimento = atendimentosById.get(Number(forms[0].atendimento_id));
    if (!atendimento) continue;
    const unit = mappedUnit(atendimento.unidade_id);
    const receiptId = idFor('recebimento', groupKey);
    const total = forms.reduce((sum, payment) => sum + cents(payment.valor), 0);
    if (total <= 0) continue;
    const cancelledCount = forms.filter((payment) => Number(payment.cancelado) === 1).length;
    const status = cancelledCount === forms.length ? 'estornado' : cancelledCount ? 'parcialmente_estornado' : 'confirmado';
    const createdAt = firstByTime(forms).created_at;
    lines.push(insert('recebimentos', {
      id: receiptId, cliente_id: clientId(atendimento.cliente_id), unidade_id: unit,
      atendimento_clinico_id: clinicalIdByLegacy.get(Number(atendimento.id)) || null,
      recebido_por_id: mappedUser(forms[0].recebido_por_id), canal: 'importado', status,
      valor_total_centavos: total,
      observacoes: realData
        ? joinedText('Recebimento importado do sistema legado.', ...forms.map((row) => row.observacoes))
        : 'Recebimento importado do sistema legado.',
      idempotency_key: `${prefix}-recebimento-${groupKey}`,
      estornado_em: status === 'estornado' ? forms.map((row) => row.created_at).sort().at(-1) : null,
      estornado_por_id: status === 'estornado' ? mappedUser(forms[0].recebido_por_id) : null,
      motivo_estorno: status === 'estornado' ? 'Cancelamento importado do sistema legado' : null,
      created_at: createdAt, updated_at: forms.map((row) => row.created_at).sort().at(-1),
    }));
    lines.push(insert('cliente_saldo_movimentos', {
      id: idFor('saldo-credito', receiptId), cliente_id: clientId(atendimento.cliente_id), unidade_id: unit,
      recebimento_id: receiptId, procedimento_cliente_id: null, movimento_origem_id: null,
      tipo: 'credito', valor_centavos: total, criado_por_id: mappedUser(forms[0].recebido_por_id),
      motivo: 'Crédito importado do sistema legado', idempotency_key: `${prefix}-credito-${groupKey}`,
      created_at: createdAt,
    }));
    for (const payment of forms) {
      lines.push(insert('recebimento_formas', {
        id: idFor('recebimento-forma', payment.id), recebimento_id: receiptId,
        forma_pagamento_id: mappedForm(payment, unit), valor_centavos: cents(payment.valor),
        taxa_bps: bps(payment.taxa_percentual_snapshot),
        taxa_fixa_centavos: cents(payment.taxa_fixa_snapshot), parcelas: 1,
        referencia_externa: `legado-pagamento-${payment.id}`, created_at: payment.created_at,
      }));
      for (const allocation of alocacoesPorPagamento.get(Number(payment.id)) || []) {
        const procId = allocation.item_atendimento_id
          ? mappedItemProc.get(Number(allocation.item_atendimento_id))
          : allocation.agendamento_id ? mappedAgendaProc.get(Number(allocation.agendamento_id)) : null;
        const allocated = cents(allocation.valor_alocado);
        if (!procId || allocated <= 0) continue;
        const allocationId = idFor('recebimento-alocacao', allocation.id);
        const reversed = Number(payment.cancelado) === 1 ? allocated : 0;
        receiptAllocationByLegacy.set(Number(allocation.id), allocationId);
        netAllocatedByProc.set(procId, (netAllocatedByProc.get(procId) || 0) + allocated - reversed);
        lines.push(insert('recebimento_alocacoes', {
          id: allocationId, recebimento_id: receiptId, procedimento_cliente_id: procId,
          procedimento_cliente_etapa_id: null, valor_centavos: allocated,
          valor_estornado_centavos: reversed,
          estornado_em: reversed ? payment.created_at : null,
          estornado_por_id: reversed ? mappedUser(payment.recebido_por_id) : null,
          motivo_estorno: reversed ? 'Cancelamento importado do sistema legado' : null,
          created_at: allocation.created_at,
        }));
        const movementId = idFor('saldo-alocacao', allocation.id);
        lines.push(insert('cliente_saldo_movimentos', {
          id: movementId, cliente_id: clientId(atendimento.cliente_id), unidade_id: unit,
          recebimento_id: receiptId, procedimento_cliente_id: procId, movimento_origem_id: null,
          tipo: 'alocacao', valor_centavos: -allocated,
          criado_por_id: mappedUser(allocation.criado_por_id || payment.recebido_por_id),
          motivo: 'Alocação importada do sistema legado', idempotency_key: null,
          created_at: allocation.created_at,
        }));
        if (reversed) {
          lines.push(insert('cliente_saldo_movimentos', {
            id: idFor('saldo-estorno-alocacao', allocation.id), cliente_id: clientId(atendimento.cliente_id), unidade_id: unit,
            recebimento_id: receiptId, procedimento_cliente_id: procId, movimento_origem_id: movementId,
            tipo: 'estorno_alocacao', valor_centavos: allocated,
            criado_por_id: mappedUser(payment.recebido_por_id),
            motivo: 'Estorno importado do sistema legado', idempotency_key: null,
            created_at: payment.created_at,
          }));
        }
      }
    }
    const cancelledValue = forms.filter((row) => Number(row.cancelado) === 1).reduce((sum, row) => sum + cents(row.valor), 0);
    if (cancelledValue) {
      lines.push(insert('cliente_saldo_movimentos', {
        id: idFor('saldo-estorno-credito', receiptId), cliente_id: clientId(atendimento.cliente_id), unidade_id: unit,
        recebimento_id: receiptId, procedimento_cliente_id: null,
        movimento_origem_id: idFor('saldo-credito', receiptId), tipo: 'estorno_credito',
        valor_centavos: -cancelledValue, criado_por_id: mappedUser(forms[0].recebido_por_id),
        motivo: 'Estorno de crédito importado do sistema legado', idempotency_key: null,
        created_at: forms.map((row) => row.created_at).sort().at(-1),
      }));
    }
  }

  const adjustmentDate = new Date(sinceMs - 1000).toISOString();
  for (const record of procedureRecords) {
    const imported = netAllocatedByProc.get(record.id) || 0;
    const gap = Math.min(record.row.valor_final_centavos, Math.max(0, record.paidSnapshot - imported));
    if (!gap) continue;
    const receiptId = idFor('recebimento-ajuste', record.id);
    const fallbackPayment = { metodo: 'dinheiro', forma_pagamento_id: null };
    lines.push(insert('recebimentos', {
      id: receiptId, cliente_id: record.customer, unidade_id: record.unit,
      atendimento_clinico_id: null, recebido_por_id: record.actor, canal: 'importado', status: 'confirmado',
      valor_total_centavos: gap, observacoes: 'Reconciliação do valor pago no legado sem alocação detalhada.',
      idempotency_key: `${prefix}-ajuste-${record.id}`, estornado_em: null,
      estornado_por_id: null, motivo_estorno: null,
      created_at: adjustmentDate, updated_at: adjustmentDate,
    }));
    lines.push(insert('recebimento_formas', {
      id: idFor('recebimento-forma-ajuste', record.id), recebimento_id: receiptId,
      forma_pagamento_id: mappedForm(fallbackPayment, record.unit), valor_centavos: gap,
      taxa_bps: 0, taxa_fixa_centavos: 0, parcelas: 1,
      referencia_externa: 'reconciliacao-legado', created_at: adjustmentDate,
    }));
    lines.push(insert('recebimento_alocacoes', {
      id: idFor('recebimento-alocacao-ajuste', record.id), recebimento_id: receiptId,
      procedimento_cliente_id: record.id, procedimento_cliente_etapa_id: null,
      valor_centavos: gap, valor_estornado_centavos: 0, estornado_em: null,
      estornado_por_id: null, motivo_estorno: null, created_at: adjustmentDate,
    }));
    lines.push(insert('cliente_saldo_movimentos', {
      id: idFor('saldo-credito-ajuste', record.id), cliente_id: record.customer, unidade_id: record.unit,
      recebimento_id: receiptId, procedimento_cliente_id: null, movimento_origem_id: null,
      tipo: 'credito', valor_centavos: gap, criado_por_id: record.actor,
      motivo: 'Reconciliação de crédito do legado', idempotency_key: `${prefix}-credito-ajuste-${record.id}`,
      created_at: adjustmentDate,
    }));
    lines.push(insert('cliente_saldo_movimentos', {
      id: idFor('saldo-alocacao-ajuste', record.id), cliente_id: record.customer, unidade_id: record.unit,
      recebimento_id: receiptId, procedimento_cliente_id: record.id, movimento_origem_id: null,
      tipo: 'alocacao', valor_centavos: -gap, criado_por_id: record.actor,
      motivo: 'Reconciliação de alocação do legado', idempotency_key: null,
      created_at: adjustmentDate,
    }));
    netAllocatedByProc.set(record.id, imported + gap);
  }

  for (const commission of prod.comissoes.filter((row) => mappedItemProc.has(Number(row.item_atendimento_id)))) {
    const procId = mappedItemProc.get(Number(commission.item_atendimento_id));
    const atendimentoId = Number(commission.atendimento_id);
    const type = commission.tipo === 'execucao'
      ? 'execucao'
      : commission.origem === 'acrescimo' ? 'acrescimo' : 'avaliacao';
    lines.push(insert('comissoes_v2', {
      id: idFor('comissao', commission.id), procedimento_cliente_id: procId,
      recebimento_alocacao_id: commission.pagamento_alocacao_id ? receiptAllocationByLegacy.get(Number(commission.pagamento_alocacao_id)) || null : null,
      atendimento_procedimento_id: type === 'execucao' ? atendimentoProcId.get(`${atendimentoId}:${procId}`) || null : null,
      comissao_origem_id: null,
      unidade_id: procSourceById.get(procId)?.unit || mappedUnit(atendimentosById.get(atendimentoId)?.unidade_id),
      usuario_id: mappedUser(commission.usuario_id), tipo: type, evento: 'credito',
      base_centavos: cents(commission.valor_base), taxa_bps: bps(commission.percentual),
      valor_centavos: Math.max(1, cents(commission.valor_comissao)),
      criado_por_id: mappedUser(commission.usuario_id),
      motivo: 'Comissão importada do sistema legado', created_at: commission.created_at,
    }));
  }

  const procsByClientUnit = groupBy(procedureRecords, (record) => `${record.customer}:${record.unit}`);
  let skippedFollowups = 0;
  for (const followup of followups) {
    const key = `${clientId(followup.cliente_id)}:${mappedUnit(followup.unidade_id)}`;
    const candidates = (procsByClientUnit.get(key) || []).sort((a, b) => toTime(b.row.created_at) - toTime(a.row.created_at));
    const target = candidates[0];
    if (!target) {
      skippedFollowups += 1;
      continue;
    }
    const type = followup.tipo === 'cobranca' ? 'cobranca' : followup.tipo === 'retorno' ? 'agendamento' : 'decisao';
    lines.push(insert('procedimento_cliente_followups', {
      id: idFor('followup', followup.id), procedimento_cliente_id: target.id,
      cliente_id: target.customer, unidade_id: target.unit, tipo: type,
      status: followup.excluida_em ? 'cancelado' : followup.status === 'concluida' ? 'concluido' : 'aberto',
      responsavel_id: followup.responsavel_usuario_id ? mappedUser(followup.responsavel_usuario_id) : null,
      criado_por_id: mappedUser(followup.criado_por_id), vencimento_em: followup.vencimento_em,
      descricao: realData
        ? joinedText(followup.titulo, followup.descricao, followup.nota_conclusao) || `Follow-up ${type} importado do sistema legado.`
        : `Follow-up ${type} importado do sistema legado; texto livre omitido.`,
      concluido_em: followup.concluida_em,
      concluido_por_id: followup.concluida_por_id ? mappedUser(followup.concluida_por_id) : null,
      created_at: followup.created_at, updated_at: followup.updated_at,
    }));
  }

  const totals = {
    clientes: clientes.length,
    atendimentos_clinicos: clinicalAtendimentos.length,
    avaliacoes: evaluationAtendimentoIds.size,
    procedimentos_cliente: procedureRecords.length,
    compromissos_com_data: datedAgendas.length,
    agendamentos_sem_data_convertidos_em_pendencia: agendas.filter((row) => !row.data_agendada).length,
    recebimentos: paymentGroups.size,
    evolucoes: evolucoes.length,
    usuarios_ativos_para_login: realData ? activeProductionUsers.length : 0,
    anexos_r2: realData ? r2Copies.length : 0,
    followups_convertidos: followups.length - skippedFollowups,
    followups_sem_procedimento: skippedFollowups,
  };
  lines.push(insert('v2_importacoes_legado', {
    id: importId, origem: 'production', inicio_em: since, fim_em: until,
    anonimizada: realData ? 0 : 1, status: 'preparada', totais_json: JSON.stringify(totals),
    bookmark_restauracao: null, aplicada_em: new Date().toISOString(), reconciliada_em: null,
  }));
  writeFileSync(importSql, `${lines.join('\n')}\n`, { mode: 0o600 });

  run('sqlite3', [stagingDb, `.read ${join(ROOT, 'migrations/0002_importacao_legado.sql')}`]);
  run('sqlite3', [stagingDb, `.read ${importSql}`]);
  const activeEmailsSql = activeProductionUsers.map((user) => sqlValue(String(user.email).toLowerCase().trim())).join(', ') || "''";
  const localCheck = sqlite(stagingDb, `
    SELECT
      (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors,
      (SELECT COUNT(*) FROM procedimentos_cliente WHERE id LIKE '${prefix}-%') AS procedimentos,
      (SELECT COUNT(*) FROM agenda_compromissos WHERE id LIKE '${prefix}-%' AND (data_agendada IS NULL OR trim(data_agendada) = '')) AS agendas_sem_data,
      (SELECT COUNT(*) FROM clientes WHERE id <= -1000000 AND id > -2000000 AND (cpf IS NOT NULL OR telefone IS NOT NULL OR email IS NOT NULL OR endereco IS NOT NULL)) AS clientes_com_pii,
      (SELECT COUNT(*) FROM clientes WHERE id <= -1000000 AND id > -2000000 AND nome NOT LIKE 'Paciente homologação #%') AS clientes_reais,
      (SELECT COUNT(*) FROM usuarios WHERE ativo = 1 AND lower(email) IN (${activeEmailsSql})) AS usuarios_login_reais,
      (SELECT COUNT(*) FROM anexos_cliente WHERE caminho LIKE 'imports/${prefix}/%') AS anexos,
      (SELECT COALESCE(SUM(valor_final_centavos), 0) FROM procedimentos_cliente WHERE id LIKE '${prefix}-%') AS valor_procedimentos_centavos,
      (SELECT COALESCE(SUM(valor_centavos - valor_estornado_centavos), 0) FROM recebimento_alocacoes WHERE id LIKE '${prefix}-%') AS valor_alocado_liquido_centavos
  `)[0];
  const invalidRealCopy = realData && (
    Number(localCheck.clientes_reais) !== clientes.length
    || Number(localCheck.usuarios_login_reais) !== activeProductionUsers.length
    || Number(localCheck.anexos) !== r2Copies.length
  );
  const invalidAnonymousCopy = !realData && Number(localCheck.clientes_com_pii) !== 0;
  if (Number(localCheck.foreign_key_errors) !== 0 || Number(localCheck.agendas_sem_data) !== 0 || invalidRealCopy || invalidAnonymousCopy) {
    throw new Error(`Validação local falhou: ${JSON.stringify(localCheck)}`);
  }

  console.log(JSON.stringify({ janela: { since, until }, ...totals, reconciliacao_local: localCheck }, null, 2));

  if (!applyRemote) {
    console.log('Dry-run concluído. Use --apply para gravar exclusivamente no staging.');
  } else {
    const bookmarkOutput = wrangler(['d1', 'time-travel', 'info', STAGING_DB, '--json']);
    const bookmark = parseBookmark(bookmarkOutput);
    if (!bookmark) throw new Error('Não foi possível obter o bookmark de restauração do staging.');

    if (realData) {
      for (const [index, copy] of r2Copies.entries()) {
        const localObject = join(tempDir, `r2-object-${index}`);
        try {
          wrangler(['r2', 'object', 'get', `${PROD_R2}/${copy.sourceKey}`, '--remote', '--file', localObject]);
          wrangler([
            'r2', 'object', 'put', `${STAGING_R2}/${copy.targetKey}`, '--remote', '--file', localObject,
            '--content-type', copy.contentType || 'application/octet-stream',
          ]);
        } catch {
          throw new Error(`Falha ao copiar o anexo ${index + 1} de ${r2Copies.length}; nenhuma referência foi gravada no D1.`);
        } finally {
          rmSync(localObject, { force: true });
        }
        if ((index + 1) % 10 === 0 || index + 1 === r2Copies.length) {
          console.log(`R2 staging: ${index + 1}/${r2Copies.length} anexos copiados.`);
        }
      }
    }

    wrangler(['d1', 'migrations', 'apply', STAGING_DB, '--remote', '--env', 'staging']);
    wrangler(['d1', 'execute', STAGING_DB, '--remote', '--env', 'staging', '--file', importSql, '--yes']);
    const bookmarkSql = `UPDATE v2_importacoes_legado SET bookmark_restauracao = ${sqlValue(bookmark)}, status = 'reconciliada', reconciliada_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${sqlValue(importId)};`;
    wrangler(['d1', 'execute', STAGING_DB, '--remote', '--env', 'staging', '--command', bookmarkSql, '--yes']);

    const remoteOutput = wrangler(['d1', 'execute', STAGING_DB, '--remote', '--env', 'staging', '--json', '--command', `SELECT (SELECT COUNT(*) FROM procedimentos_cliente WHERE id LIKE '${prefix}-%') AS procedimentos, (SELECT COUNT(*) FROM agenda_compromissos WHERE id LIKE '${prefix}-%' AND (data_agendada IS NULL OR trim(data_agendada) = '')) AS agendas_sem_data, (SELECT COUNT(*) FROM clientes WHERE id <= -1000000 AND id > -2000000 AND (cpf IS NOT NULL OR telefone IS NOT NULL OR email IS NOT NULL OR endereco IS NOT NULL)) AS clientes_com_pii, (SELECT COUNT(*) FROM clientes WHERE id <= -1000000 AND id > -2000000 AND nome NOT LIKE 'Paciente homologação #%') AS clientes_reais, (SELECT COUNT(*) FROM usuarios WHERE ativo = 1 AND lower(email) IN (${activeEmailsSql})) AS usuarios_login_reais, (SELECT COUNT(*) FROM anexos_cliente WHERE caminho LIKE 'imports/${prefix}/%') AS anexos, (SELECT COALESCE(SUM(valor_final_centavos), 0) FROM procedimentos_cliente WHERE id LIKE '${prefix}-%') AS valor_procedimentos_centavos, (SELECT COALESCE(SUM(valor_centavos - valor_estornado_centavos), 0) FROM recebimento_alocacoes WHERE id LIKE '${prefix}-%') AS valor_alocado_liquido_centavos;`]);
    const remote = JSON.parse(remoteOutput)?.[0]?.results?.[0];
    const remoteModeInvalid = realData
      ? Number(remote?.clientes_reais) !== clientes.length
        || Number(remote?.usuarios_login_reais) !== activeProductionUsers.length
        || Number(remote?.anexos) !== r2Copies.length
      : Number(remote?.clientes_com_pii) !== 0;
    if (!remote || Number(remote.agendas_sem_data) !== 0 || remoteModeInvalid || Number(remote.procedimentos) !== Number(localCheck.procedimentos)) {
      throw new Error(`Reconciliação remota falhou. Bookmark para restauração: ${bookmark}`);
    }
    console.log(JSON.stringify({ aplicado_no_staging: true, bookmark_restauracao: bookmark, reconciliacao_remota: remote }, null, 2));
  }
} finally {
  // Os exports temporários contêm dados de produção e nunca devem permanecer em disco.
  rmSync(tempDir, { recursive: true, force: true });
}
