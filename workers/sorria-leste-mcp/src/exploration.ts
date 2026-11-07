import { Parser, type AST } from 'node-sql-parser/build/sqlite';
import { availableDatasets, datasetColumns, protectedCatalogSql } from './exploration-catalog';
import type { Env, Identity } from './types';

export class ExplorationError extends Error {}

type Node = Record<string, unknown>;
const FUNCTIONS = new Set('COUNT SUM AVG MIN MAX TOTAL ABS ROUND COALESCE IFNULL NULLIF LOWER UPPER TRIM LTRIM RTRIM LENGTH SUBSTR SUBSTRING DATE DATETIME TIME STRFTIME JULIANDAY UNIXEPOCH'.split(' '));
const TYPES = new Set('select column_ref star aggr_func function expr_list binary_expr unary_expr case when else number single_quote_string bool null default origin'.split(' '));
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_ROWS = 200;
const MAX_BYTES = 64_000;

function object(value: unknown): Node | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Node : null;
}

function walk(value: unknown, visit: (node: Node) => void, depth = 0): void {
  if (depth > 40) throw new ExplorationError('Consulta muito aninhada. Divida a análise em etapas.');
  if (Array.isArray(value)) { value.forEach(child => walk(child, visit, depth + 1)); return; }
  const node = object(value);
  if (!node) return;
  visit(node);
  Object.values(node).forEach(child => walk(child, visit, depth + 1));
}

export function explorationUnits(identity: Identity, unidadeId?: number): number[] {
  if (unidadeId !== undefined && !identity.unidadeIds.includes(unidadeId)) throw new ExplorationError('Unidade não autorizada.');
  const ids = unidadeId === undefined ? identity.unidadeIds : [unidadeId];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new ExplorationError('Unidades inválidas para a consulta.');
  return [...new Set(ids)];
}

export function exploreDatabase(identity: Identity) {
  return {
    somente_leitura: true,
    unidades_autorizadas: explorationUnits(identity),
    dialeto: 'SQLite / Cloudflare D1',
    fuso_clinica: 'America/Fortaleza (UTC-03:00). Confira os timestamps: há registros UTC em ISO e no formato SQLite.',
    limites: { linhas_por_pagina: MAX_ROWS, bytes_por_resposta: MAX_BYTES, tamanho_sql: 8000, tabelas_por_consulta: 12, offset_maximo: 10000 },
    regras: ['Use nomes do catálogo, sem prefixos main/temp.', 'SELECT, JOIN com ON/USING, agregações, subconsultas e CTEs não recursivas são permitidos.', 'Parâmetros posicionais ?; identificadores simples ou entre crases, textos entre aspas simples. Use aliases simples e ORDER BY para paginação estável.', 'O limite de resultado não limita as linhas lidas por uma agregação: use filtros de data e unidade.', 'Novas tabelas/campos precisam ser autorizados no catálogo antes de aparecerem.', 'Prontuários, dentes, observações, anexos, senhas e tokens não são expostos. Contatos de clientes são mascarados na fonte.'],
    tabelas: availableDatasets(identity).map(([name, dataset]) => ({ nome: name, descricao: dataset.description, colunas: datasetColumns(dataset, identity), relacionamentos: dataset.relations ?? {} })),
    exemplo: "SELECT a.id, a.status, COUNT(i.id) AS procedimentos FROM atendimentos a LEFT JOIN itens_atendimento i ON i.atendimento_id = a.id WHERE a.status = ? GROUP BY a.id, a.status ORDER BY a.id",
  };
}

export async function describeDataset(env: Env, identity: Identity, name: string) {
  const entry = availableDatasets(identity).find(([key]) => key === name);
  if (!entry) throw new ExplorationError('Tabela não disponível neste escopo. Use explorar_banco.');
  const [, dataset] = entry;
  const schema = await env.DB.prepare(`PRAGMA table_info("${name}")`).all<{ name: string; type: string; notnull: number; pk: number }>();
  const allowed = new Set(datasetColumns(dataset, identity));
  return {
    tabela: name, descricao: dataset.description,
    colunas: (schema.results ?? []).filter(column => allowed.has(column.name)).map(column => ({ nome: column.name, tipo: column.type, chave_primaria: Boolean(column.pk), aceita_nulo: !column.notnull && !column.pk, mascarado: Boolean(dataset.expressions?.[column.name]), referencia: dataset.relations?.[column.name] ?? null })),
    unidade: 'Filtrada automaticamente nas consultas, inclusive em subconsultas e CTEs.',
  };
}

export function compileExplorationSql(identity: Identity, input: string, unidadeId?: number): { sql: string; normalized: string; units: number[]; tables: string[]; parameters: number } {
  if (!input.trim() || input.length > 8000) throw new ExplorationError('Informe uma consulta de até 8000 caracteres.');
  const parser = new Parser();
  let parsed: unknown;
  try { parsed = parser.astify(input); } catch { throw new ExplorationError('SQL inválido ou não suportado. Use uma única consulta SELECT em SQLite.'); }
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) throw new ExplorationError('Envie apenas uma consulta SELECT por chamada.');
    [parsed] = parsed;
  }
  const root = object(parsed);
  if (!root || root.type !== 'select') throw new ExplorationError('Somente consultas SELECT são permitidas.');
  const units = explorationUnits(identity, unidadeId);
  const datasets = new Set(availableDatasets(identity).map(([name]) => name));
  const ctes = new Map<string, Node>();
  let nodes = 0;
  walk(root, node => {
    if (++nodes > 500) throw new ExplorationError('Consulta muito complexa. Divida a análise em etapas.');
    if (!Array.isArray(node.with)) return;
    for (const raw of node.with) {
      const cte = object(raw);
      const name = String(object(cte?.name)?.value ?? '').toLowerCase();
      const stmt = object(object(cte?.stmt)?.ast);
      if (!IDENTIFIER.test(name) || datasets.has(name) || ctes.has(name) || cte?.recursive || !stmt || stmt.type !== 'select') {
        throw new ExplorationError('CTE inválida: use nomes únicos fora do catálogo e não use recursão.');
      }
      ctes.set(name, stmt);
    }
  });
  const tables = new Set<string>();
  let references = 0;
  let selects = 0;
  let parameters = 0;
  walk(root, node => {
    if (typeof node.type === 'string' && !TYPES.has(node.type)) throw new ExplorationError('Esta construção SQL não está liberada para leitura.');
    if (node.db || node.schema || node.for_update || node.into || node.over || node.options) throw new ExplorationError('Qualificação de banco e opções especiais não são permitidas.');
    if (node.type === 'select') {
      if (++selects > 8) throw new ExplorationError('Use no máximo oito SELECTs por consulta.');
      const from = Array.isArray(node.from) ? node.from : [];
      from.forEach((raw, index) => {
        const table = object(raw);
        if (!table) throw new ExplorationError('Origem de dados inválida.');
        if (index > 0 && (!table.join || !['INNER JOIN', 'LEFT JOIN', 'LEFT OUTER JOIN'].includes(String(table.join)) || (!table.on && !table.using))) throw new ExplorationError('Use JOIN com ON ou USING; produtos cartesianos não são permitidos.');
        if (index > 0 && table.on) {
          const previous = new Set(from.slice(0, index).map(source => String(object(source)?.as ?? object(source)?.table ?? '').toLowerCase()));
          const current = String(table.as ?? table.table ?? '').toLowerCase();
          const linksSources = (value: unknown): boolean => {
            const predicate = object(value);
            if (!predicate || predicate.type !== 'binary_expr') return false;
            if (predicate.operator === 'AND') return linksSources(predicate.left) || linksSources(predicate.right);
            const left = object(predicate.left); const right = object(predicate.right);
            if (predicate.operator !== '=' || left?.type !== 'column_ref' || right?.type !== 'column_ref') return false;
            const a = String(left.table ?? '').toLowerCase(); const b = String(right.table ?? '').toLowerCase();
            return (a === current && previous.has(b)) || (b === current && previous.has(a));
          };
          if (!linksSources(table.on)) throw new ExplorationError('JOIN precisa de uma igualdade entre colunas das duas origens. Use WHERE para os demais filtros.');
        }
        if (table.table) {
          const name = String(table.table).toLowerCase();
          if (!datasets.has(name) && !ctes.has(name)) throw new ExplorationError('Tabela não disponível neste escopo. Use explorar_banco.');
          if (++references > 12) throw new ExplorationError('Use no máximo doze referências a tabelas.');
          if (datasets.has(name)) tables.add(name);
        } else if (!object(table.expr)?.ast) throw new ExplorationError('Funções de tabela não são permitidas.');
      });
    }
    if (node.type === 'column_ref' && (typeof node.column !== 'string' || (node.column !== '*' && !IDENTIFIER.test(node.column)) || (node.table !== null && node.table !== undefined && !IDENTIFIER.test(String(node.table))))) throw new ExplorationError('Use nomes simples de colunas e aliases.');
    if (typeof node.as === 'string' && !IDENTIFIER.test(node.as)) throw new ExplorationError('Use aliases simples: letras, números e sublinhado.');
    if (node.type === 'function' || node.type === 'aggr_func') {
      const parts = object(node.name)?.name;
      const name = typeof node.name === 'string' ? node.name : Array.isArray(parts) && parts.length === 1 ? String(object(parts[0])?.value ?? '') : '';
      if (!FUNCTIONS.has(name.toUpperCase())) throw new ExplorationError('Função SQL não liberada para exploração.');
    }
    if (node.type === 'origin') {
      if (node.value !== '?') throw new ExplorationError('Use somente parâmetros posicionais ?.');
      parameters++;
    }
  });
  const checking = new Set<string>();
  const checked = new Set<string>();
  const checkCycle = (name: string) => {
    if (checking.has(name)) throw new ExplorationError('CTEs recursivas não são permitidas.');
    if (checked.has(name)) return;
    checking.add(name);
    walk(ctes.get(name), node => {
      if (node.type !== 'select' || !Array.isArray(node.from)) return;
      for (const table of node.from) {
        const dependency = String(object(table)?.table ?? '').toLowerCase();
        if (ctes.has(dependency)) checkCycle(dependency);
      }
    });
    checking.delete(name); checked.add(name);
  };
  ctes.forEach((_, name) => checkCycle(name));

  // SQLite accepts backticks. D1 treats unknown double-quoted columns as string literals;
  // strict identifier quotes make missing/private columns fail instead of returning misleading values.
  const quoting = { database: 'MySQL' };
  const normalized = parser.sqlify(root as unknown as AST, quoting);
  // Every public table name is shadowed by a trusted projection using main.<table> internally.
  // User SQL cannot name main/temp or inspect schema, so aliases/UNION/CTEs cannot bypass the projection.
  const catalog = object(parser.astify(`WITH ${protectedCatalogSql(identity, units)} SELECT 1`))!;
  root.with = [...catalog.with as unknown[], ...(root.with as unknown[] | null ?? [])];
  return { sql: parser.sqlify(root as unknown as AST, quoting), normalized, units, tables: [...tables], parameters };
}

export async function queryDataset(env: Env, identity: Identity, input: { sql: string; parametros?: Array<string | number | null>; unidadeId?: number; limite?: number; offset?: number }, explain = false) {
  const compiled = compileExplorationSql(identity, input.sql, input.unidadeId);
  const parameters = input.parametros ?? [];
  if (parameters.length !== compiled.parameters || parameters.length > 50 || parameters.some(value => typeof value === 'string' ? value.length > 2000 : value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) throw new ExplorationError('Parâmetros inválidos: use até 50 valores, na ordem dos marcadores ?.');
  const limit = input.limite ?? 100;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new ExplorationError('Paginação inválida.');
  const sql = `${explain ? 'EXPLAIN QUERY PLAN ' : ''}SELECT * FROM (${compiled.sql}) AS _mcp_result LIMIT ${limit + 1} OFFSET ${offset}`;
  let result;
  try {
    result = await env.DB.prepare(sql).bind(...parameters).all<Record<string, unknown>>();
  } catch { throw new ExplorationError('Não foi possível executar a consulta. Confira campos e relacionamentos com descrever_tabela.'); }
  const rows = result.results ?? [];
  const selected: Record<string, unknown>[] = [];
  let bytes = new TextEncoder().encode(JSON.stringify({ sql: compiled.normalized, unidades: compiled.units, tabelas: compiled.tables })).byteLength + 2048;
  for (const row of rows.slice(0, limit)) {
    bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if (bytes > MAX_BYTES) break;
    selected.push(row);
  }
  if (rows.length && !selected.length) throw new ExplorationError('Uma linha excede o limite de resposta. Selecione menos campos.');
  const more = rows.length > selected.length;
  return { sql: compiled.normalized, unidades: compiled.units, tabelas: compiled.tables, [explain ? 'plano' : 'linhas']: selected, quantidade: selected.length, mais_resultados: more, proximo_offset: more && offset + selected.length <= 10000 ? offset + selected.length : null };
}
