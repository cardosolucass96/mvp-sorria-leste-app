import { execute, query, queryOne } from '@/lib/db';
import { nomeProcedimentoItem } from '@/lib/utils/formatters';
import { applyFechamentoCaixaDraft, countFechamentoCaixaAdjustments, createEmptyFechamentoCaixaDraft } from '@/lib/fechamento-caixa/compute';
import type {
  FechamentoCaixaDraft,
  FechamentoCaixaEventoTipo,
  FechamentoCaixaMeta,
  FechamentoCaixaProcedimentoDraft,
  FechamentoCaixaProfissionalDraft,
  FechamentoCaixaProcedimento,
  FechamentoCaixaRecente,
  FechamentoCaixaResponse,
  FechamentoCaixaStatus,
  FechamentoCaixaVisao,
} from '@/lib/fechamento-caixa/types';
import { garantirSchemaComissoesOrigem } from './garantirComissaoSchema';
import { garantirSchemaUsuariosValorDiaria } from './garantirUsuarioSchema';

interface SQLiteColumn {
  name: string;
}

interface UnidadeRow {
  nome: string | null;
}

interface UsuarioClinicoRow {
  id: number;
  nome: string;
  valor_diaria: number;
}

interface PagamentoTotalRow {
  total: number;
}

interface PagamentoMetodoRow {
  metodo: string;
  total: number;
  quantidade: number;
}

interface PagamentoCanceladoRow {
  quantidade: number;
  valor: number;
}

interface ProcedimentoRow {
  item_id: number;
  atendimento_id: number;
  executor_id: number | null;
  executor_nome: string | null;
  executor_valor_diaria: number | null;
  criado_por_id: number | null;
  criado_por_nome: string | null;
  criado_por_valor_diaria: number | null;
  adicionado_em_execucao: number;
  comissao_venda: number | null;
  comissao_acrescimo: number | null;
  valor: number;
  concluido_at: string | null;
  dentes: string | null;
  dente_unico: string | null;
  etapa_label: string | null;
  procedimento_nome: string;
  cliente_nome: string;
}

interface ComissaoRow {
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  usuario_valor_diaria: number | null;
  tipo: 'venda' | 'execucao';
  origem: 'avaliacao' | 'acrescimo' | 'execucao';
  valor_base: number;
  valor_comissao: number;
}

interface AvaliacaoFallback {
  usuario_id: number;
  nome: string;
  valor_gerado: number;
  valor_comissao: number;
  origem: 'avaliacao' | 'acrescimo';
}

interface FechamentoRow {
  id: number;
  unidade_id: number;
  data_referencia: string;
  status: FechamentoCaixaStatus;
  base_json: string | null;
  draft_json: string | null;
  snapshot_json: string | null;
  editado_manual: number;
  ajustes_count: number;
  fechado_por_id: number | null;
  fechado_por_nome: string | null;
  fechado_em: string | null;
  updated_by_id: number | null;
  updated_by_nome: string | null;
  updated_at: string | null;
}

let schemaGarantido = false;

function roundMoney(value: number): number {
  return Number((value || 0).toFixed(2));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowSqlite(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function tryParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function buildAvaliacaoFallback(row: ProcedimentoRow, valorReferencia: number): AvaliacaoFallback | null {
  if (!row.criado_por_id || !row.criado_por_nome) return null;

  const origem = row.adicionado_em_execucao ? 'acrescimo' : 'avaliacao';
  const percentual = Number(
    origem === 'acrescimo'
      ? row.comissao_acrescimo ?? 0
      : row.comissao_venda ?? 0
  );

  if (!(percentual > 0)) return null;

  return {
    usuario_id: row.criado_por_id,
    nome: row.criado_por_nome,
    valor_gerado: valorReferencia,
    valor_comissao: roundMoney(valorReferencia * (percentual / 100)),
    origem,
  };
}

function sanitizeFechamentoView(view: FechamentoCaixaVisao): FechamentoCaixaVisao {
  const sanitized = cloneJson(view);

  sanitized.dentistas.forEach((dentista) => {
    dentista.comissao_execucao = 0;
    dentista.total_dia = roundMoney(
      dentista.valor_diaria
      + dentista.comissao_avaliacao
      + dentista.lancamentos_manuais.reduce((sum, item) => sum + item.valor, 0)
    );
  });

  const visibleDentistas = sanitized.dentistas.filter((dentista) => dentista.included);
  const visibleProcedimentos = visibleDentistas.flatMap((dentista) =>
    dentista.procedimentos_executados.filter((procedimento) => procedimento.included)
  );
  const ajustesGerais = sanitized.lancamentos_manuais_gerais.reduce((sum, item) => sum + item.valor, 0);
  const ajustesProfissionais = visibleDentistas.reduce(
    (sum, dentista) => sum + dentista.lancamentos_manuais.reduce((inner, item) => inner + item.valor, 0),
    0
  );

  sanitized.resumo.procedimentos_executados = visibleProcedimentos.length;
  sanitized.resumo.total_diarias = roundMoney(visibleDentistas.reduce((sum, dentista) => sum + dentista.valor_diaria, 0));
  sanitized.resumo.total_comissao_avaliacao = roundMoney(visibleDentistas.reduce((sum, dentista) => sum + dentista.comissao_avaliacao, 0));
  sanitized.resumo.total_comissao_execucao = 0;
  sanitized.resumo.ajustes_manuais = roundMoney(ajustesGerais + ajustesProfissionais);
  sanitized.resumo.total_final = roundMoney(
    sanitized.resumo.faturamento_dia
    - sanitized.resumo.total_diarias
    - sanitized.resumo.total_comissao_avaliacao
    + sanitized.resumo.ajustes_manuais
  );

  return sanitized;
}

function mergeDraft(value: unknown): FechamentoCaixaDraft {
  const fallback = createEmptyFechamentoCaixaDraft();
  if (!value || typeof value !== 'object') return fallback;
  const draft = value as Partial<FechamentoCaixaDraft>;
  return {
    profissionais: draft.profissionais && typeof draft.profissionais === 'object' ? draft.profissionais : {},
    procedimentos: draft.procedimentos && typeof draft.procedimentos === 'object' ? draft.procedimentos : {},
    lancamentos_manuais: Array.isArray(draft.lancamentos_manuais) ? draft.lancamentos_manuais : [],
  };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error('Valor inválido informado no fechamento de caixa.');
  }
  return roundMoney(numberValue);
}

function normalizeProfessionalDraft(entry: FechamentoCaixaDraft['profissionais'][string]): FechamentoCaixaProfissionalDraft {
  const normalized: FechamentoCaixaProfissionalDraft = {};

  if (entry.included === false) {
    normalized.included = false;
    normalized.included_motivo = normalizeNullableText(entry.included_motivo);
  }

  const valorDiariaOverride = normalizeOptionalNumber(entry.valor_diaria_override);
  if (valorDiariaOverride != null) {
    normalized.valor_diaria_override = valorDiariaOverride;
    normalized.valor_diaria_motivo = normalizeNullableText(entry.valor_diaria_motivo);
  }

  const comissaoAvaliacaoOverride = normalizeOptionalNumber(entry.comissao_avaliacao_override);
  if (comissaoAvaliacaoOverride != null) {
    normalized.comissao_avaliacao_override = comissaoAvaliacaoOverride;
    normalized.comissao_avaliacao_motivo = normalizeNullableText(entry.comissao_avaliacao_motivo);
  }

  return normalized;
}

function normalizeProcedureDraft(entry: FechamentoCaixaDraft['procedimentos'][string]): FechamentoCaixaProcedimentoDraft {
  const normalized: FechamentoCaixaProcedimentoDraft = {};

  if (entry.included === false) {
    normalized.included = false;
    normalized.included_motivo = normalizeNullableText(entry.included_motivo);
  }

  const valorOverride = normalizeOptionalNumber(entry.valor_override);
  if (valorOverride != null) {
    normalized.valor_override = valorOverride;
    normalized.valor_motivo = normalizeNullableText(entry.valor_motivo);
  }

  return normalized;
}

function normalizeDraft(value: unknown): FechamentoCaixaDraft {
  const merged = mergeDraft(value);
  const profissionais = Object.fromEntries(
    Object.entries(merged.profissionais)
      .map(([key, entry]) => [key, normalizeProfessionalDraft(entry)] as const)
      .filter(([, entry]) => Object.keys(entry).length > 0)
  );

  const procedimentos = Object.fromEntries(
    Object.entries(merged.procedimentos)
      .map(([key, entry]) => [key, normalizeProcedureDraft(entry)] as const)
      .filter(([, entry]) => Object.keys(entry).length > 0)
  );

  const lancamentos_manuais = merged.lancamentos_manuais.map((item) => ({
    ...item,
    escopo: item.escopo,
    usuario_id: item.usuario_id ?? null,
    descricao: normalizeText(item.descricao),
    valor: normalizeOptionalNumber(item.valor) ?? 0,
    motivo: normalizeText(item.motivo),
    created_at: normalizeText(item.created_at) || nowSqlite(),
  }));

  return {
    profissionais,
    procedimentos,
    lancamentos_manuais,
  };
}

function validateDraft(draft: FechamentoCaixaDraft) {
  Object.entries(draft.profissionais).forEach(([usuarioId, entry]) => {
    if (entry.included === false && !entry.included_motivo) {
      throw new Error(`Motivo obrigatório para excluir o profissional ${usuarioId} do fechamento.`);
    }
    if (entry.valor_diaria_override != null && !entry.valor_diaria_motivo) {
      throw new Error(`Motivo obrigatório para ajustar a diária do profissional ${usuarioId}.`);
    }
    if (entry.comissao_avaliacao_override != null && !entry.comissao_avaliacao_motivo) {
      throw new Error(`Motivo obrigatório para ajustar a comissão de avaliação do profissional ${usuarioId}.`);
    }
  });

  Object.entries(draft.procedimentos).forEach(([itemKey, entry]) => {
    if (entry.included === false && !entry.included_motivo) {
      throw new Error(`Motivo obrigatório para excluir o procedimento ${itemKey} do fechamento.`);
    }
    if (entry.valor_override != null && !entry.valor_motivo) {
      throw new Error(`Motivo obrigatório para ajustar o valor do procedimento ${itemKey}.`);
    }
  });

  draft.lancamentos_manuais.forEach((item) => {
    if (!item.descricao) {
      throw new Error('Descrição obrigatória para lançamento manual no fechamento.');
    }
    if (!item.motivo) {
      throw new Error('Motivo obrigatório para lançamento manual no fechamento.');
    }
    if (item.escopo !== 'geral' && item.escopo !== 'profissional') {
      throw new Error('Escopo inválido para lançamento manual no fechamento.');
    }
    if (item.escopo === 'profissional' && item.usuario_id == null) {
      throw new Error('Usuário obrigatório para lançamento manual por profissional.');
    }
  });
}

function coerceBooleanInt(value: boolean): number {
  return value ? 1 : 0;
}

function collectMotivos(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key, fieldValue]) => key.endsWith('_motivo') && typeof fieldValue === 'string' && fieldValue.trim().length > 0)
    .map(([, fieldValue]) => String(fieldValue).trim());
}

function draftChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

function buildAjusteEvents(
  anterior: FechamentoCaixaDraft,
  proximo: FechamentoCaixaDraft
): Array<{
  entidade_tipo: string;
  entidade_chave: string;
  antes_json: string | null;
  depois_json: string | null;
  motivo: string | null;
}> {
  const eventos: Array<{
    entidade_tipo: string;
    entidade_chave: string;
    antes_json: string | null;
    depois_json: string | null;
    motivo: string | null;
  }> = [];

  const professionalKeys = new Set([
    ...Object.keys(anterior.profissionais),
    ...Object.keys(proximo.profissionais),
  ]);
  professionalKeys.forEach((key) => {
    const before = anterior.profissionais[key];
    const after = proximo.profissionais[key];
    if (!draftChanged(before, after)) return;
    const motivos = [...collectMotivos(after), ...collectMotivos(before)];
    if (after?.included_motivo) motivos.unshift(after.included_motivo);
    if (!after && before?.included_motivo) motivos.unshift(before.included_motivo);
    eventos.push({
      entidade_tipo: 'profissional',
      entidade_chave: `usuario:${key}`,
      antes_json: before ? JSON.stringify(before) : null,
      depois_json: after ? JSON.stringify(after) : null,
      motivo: motivos.find(Boolean) || null,
    });
  });

  const procedureKeys = new Set([
    ...Object.keys(anterior.procedimentos),
    ...Object.keys(proximo.procedimentos),
  ]);
  procedureKeys.forEach((key) => {
    const before = anterior.procedimentos[key];
    const after = proximo.procedimentos[key];
    if (!draftChanged(before, after)) return;
    const motivos = [...collectMotivos(after), ...collectMotivos(before)];
    if (after?.included_motivo) motivos.unshift(after.included_motivo);
    if (!after && before?.included_motivo) motivos.unshift(before.included_motivo);
    eventos.push({
      entidade_tipo: 'procedimento',
      entidade_chave: key,
      antes_json: before ? JSON.stringify(before) : null,
      depois_json: after ? JSON.stringify(after) : null,
      motivo: motivos.find(Boolean) || null,
    });
  });

  const manualKeys = new Set([
    ...anterior.lancamentos_manuais.map((item) => item.id),
    ...proximo.lancamentos_manuais.map((item) => item.id),
  ]);
  manualKeys.forEach((key) => {
    const before = anterior.lancamentos_manuais.find((item) => item.id === key);
    const after = proximo.lancamentos_manuais.find((item) => item.id === key);
    if (!draftChanged(before, after)) return;
    eventos.push({
      entidade_tipo: 'lancamento_manual',
      entidade_chave: `manual:${key}`,
      antes_json: before ? JSON.stringify(before) : null,
      depois_json: after ? JSON.stringify(after) : null,
      motivo: after?.motivo || before?.motivo || null,
    });
  });

  return eventos;
}

function createMetaFromRow(
  row: FechamentoRow | null,
  unidadeId: number,
  dataReferencia: string
): FechamentoCaixaMeta {
  if (!row) {
    return {
      id: null,
      unidade_id: unidadeId,
      data_referencia: dataReferencia,
      status: 'aberto',
      editado_manual: false,
      ajustes_count: 0,
      fechado_por_id: null,
      fechado_por_nome: null,
      fechado_em: null,
      updated_by_id: null,
      updated_by_nome: null,
      updated_at: null,
    };
  }

  return {
    id: row.id,
    unidade_id: row.unidade_id,
    data_referencia: row.data_referencia,
    status: row.status,
    editado_manual: Boolean(row.editado_manual),
    ajustes_count: row.ajustes_count || 0,
    fechado_por_id: row.fechado_por_id,
    fechado_por_nome: row.fechado_por_nome,
    fechado_em: row.fechado_em,
    updated_by_id: row.updated_by_id,
    updated_by_nome: row.updated_by_nome,
    updated_at: row.updated_at,
  };
}

async function getFechamentoRow(unidadeId: number, dataReferencia: string): Promise<FechamentoRow | null> {
  return queryOne<FechamentoRow>(
    `SELECT
       f.id,
       f.unidade_id,
       f.data_referencia,
       f.status,
       f.base_json,
       f.draft_json,
       f.snapshot_json,
       f.editado_manual,
       f.ajustes_count,
       f.fechado_por_id,
       fechado.nome as fechado_por_nome,
       f.fechado_em,
       f.updated_by_id,
       updated.nome as updated_by_nome,
       f.updated_at
     FROM fechamentos_caixa f
     LEFT JOIN usuarios fechado ON fechado.id = f.fechado_por_id
     LEFT JOIN usuarios updated ON updated.id = f.updated_by_id
     WHERE f.unidade_id = ? AND f.data_referencia = ?`,
    [unidadeId, dataReferencia]
  );
}

async function getFechamentosRecentes(unidadeId: number): Promise<FechamentoCaixaRecente[]> {
  const rows = await query<FechamentoRow>(
    `SELECT
       f.id,
       f.unidade_id,
       f.data_referencia,
       f.status,
       f.base_json,
       f.draft_json,
       f.snapshot_json,
       f.editado_manual,
       f.ajustes_count,
       f.fechado_por_id,
       fechado.nome as fechado_por_nome,
       f.fechado_em,
       f.updated_by_id,
       updated.nome as updated_by_nome,
       f.updated_at
     FROM fechamentos_caixa f
     LEFT JOIN usuarios fechado ON fechado.id = f.fechado_por_id
     LEFT JOIN usuarios updated ON updated.id = f.updated_by_id
     WHERE f.unidade_id = ?
     ORDER BY f.data_referencia DESC
     LIMIT 7`,
    [unidadeId]
  );

  return rows.map((row) => ({
    id: row.id,
    data_referencia: row.data_referencia,
    status: row.status,
    editado_manual: Boolean(row.editado_manual),
    ajustes_count: row.ajustes_count || 0,
    fechado_por_nome: row.fechado_por_nome,
    fechado_em: row.fechado_em,
  }));
}

export function validarDataFechamentoCaixa(data: string | null): string {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error('Data inválida. Use o formato YYYY-MM-DD.');
  }
  return data;
}

export async function garantirSchemaFechamentoCaixa() {
  if (schemaGarantido) return;

  await execute(`
    CREATE TABLE IF NOT EXISTS fechamentos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unidade_id INTEGER NOT NULL,
      data_referencia TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
      base_json TEXT,
      draft_json TEXT,
      snapshot_json TEXT,
      editado_manual INTEGER NOT NULL DEFAULT 0,
      ajustes_count INTEGER NOT NULL DEFAULT 0,
      fechado_por_id INTEGER,
      fechado_em TEXT,
      updated_by_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      FOREIGN KEY (fechado_por_id) REFERENCES usuarios(id),
      FOREIGN KEY (updated_by_id) REFERENCES usuarios(id)
    )
  `);
  await execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_fechamentos_caixa_unidade_data ON fechamentos_caixa(unidade_id, data_referencia)'
  );
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_fechamentos_caixa_status ON fechamentos_caixa(status)'
  );
  await execute(`
    CREATE TABLE IF NOT EXISTS fechamento_caixa_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unidade_id INTEGER NOT NULL,
      data_referencia TEXT NOT NULL,
      tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('ajuste', 'fechado', 'reaberto')),
      entidade_tipo TEXT NOT NULL,
      entidade_chave TEXT NOT NULL,
      antes_json TEXT,
      depois_json TEXT,
      motivo TEXT,
      usuario_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_eventos_unidade_data ON fechamento_caixa_eventos(unidade_id, data_referencia)'
  );
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_fechamento_caixa_eventos_tipo ON fechamento_caixa_eventos(tipo_evento)'
  );

  const fechamentoColunas = await query<SQLiteColumn>('PRAGMA table_info(fechamentos_caixa)');
  const temUpdatedBy = fechamentoColunas.some((coluna) => coluna.name === 'updated_by_id');
  if (!temUpdatedBy) {
    await execute('ALTER TABLE fechamentos_caixa ADD COLUMN updated_by_id INTEGER');
  }
  const temUpdatedAt = fechamentoColunas.some((coluna) => coluna.name === 'updated_at');
  if (!temUpdatedAt) {
    await execute("ALTER TABLE fechamentos_caixa ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))");
  }

  schemaGarantido = true;
}

export async function construirBaseFechamentoCaixa(unidadeId: number, dataReferencia: string): Promise<FechamentoCaixaVisao> {
  await garantirSchemaFechamentoCaixa();
  await garantirSchemaComissoesOrigem();
  await garantirSchemaUsuariosValorDiaria();

  const unidade = await queryOne<UnidadeRow>(
    'SELECT nome FROM unidades WHERE id = ?',
    [unidadeId]
  );

  const profissionaisAtivos = await query<UsuarioClinicoRow>(
    `SELECT DISTINCT u.id, u.nome, u.valor_diaria
     FROM usuarios u
     INNER JOIN usuario_unidades uu ON uu.usuario_id = u.id
     WHERE uu.unidade_id = ?
       AND u.ativo = 1
       AND (
         u.role IN ('avaliador', 'executor')
         OR EXISTS (
           SELECT 1
           FROM usuario_roles ur
           WHERE ur.usuario_id = u.id
             AND ur.role IN ('avaliador', 'executor', 'ortodontista')
         )
       )
     ORDER BY u.nome`,
    [unidadeId]
  );

  const faturamentoRow = await queryOne<PagamentoTotalRow>(
    `SELECT COALESCE(SUM(p.valor), 0) as total
     FROM pagamentos p
     INNER JOIN atendimentos a ON a.id = p.atendimento_id
     WHERE a.unidade_id = ?
       AND p.cancelado = 0
       AND DATE(p.created_at) = ?`,
    [unidadeId, dataReferencia]
  );

  const faturamentoPorMetodo = await query<PagamentoMetodoRow>(
    `SELECT
       p.metodo,
       COALESCE(SUM(p.valor), 0) as total,
       COUNT(*) as quantidade
     FROM pagamentos p
     INNER JOIN atendimentos a ON a.id = p.atendimento_id
     WHERE a.unidade_id = ?
       AND p.cancelado = 0
       AND DATE(p.created_at) = ?
     GROUP BY p.metodo
     ORDER BY total DESC`,
    [unidadeId, dataReferencia]
  );

  const canceladosRow = await queryOne<PagamentoCanceladoRow>(
    `SELECT
       COUNT(*) as quantidade,
       COALESCE(SUM(p.valor), 0) as valor
     FROM pagamentos p
     INNER JOIN atendimentos a ON a.id = p.atendimento_id
     WHERE a.unidade_id = ?
       AND p.cancelado = 1
       AND DATE(p.created_at) = ?`,
    [unidadeId, dataReferencia]
  );

  const procedimentosRows = await query<ProcedimentoRow>(
    `SELECT
       i.id as item_id,
       i.atendimento_id,
       i.executor_id,
       executor.nome as executor_nome,
       executor.valor_diaria as executor_valor_diaria,
       i.criado_por_id,
       criador.nome as criado_por_nome,
       criador.valor_diaria as criado_por_valor_diaria,
       i.adicionado_em_execucao,
       p.comissao_venda,
       p.comissao_acrescimo,
       i.valor,
       i.concluido_at,
       i.dentes,
       i.dente_unico,
       i.etapa_label,
       p.nome as procedimento_nome,
       c.nome as cliente_nome
     FROM itens_atendimento i
     INNER JOIN atendimentos a ON a.id = i.atendimento_id
     INNER JOIN procedimentos p ON p.id = i.procedimento_id
     INNER JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN usuarios executor ON executor.id = i.executor_id
     LEFT JOIN usuarios criador ON criador.id = i.criado_por_id
     WHERE a.unidade_id = ?
       AND i.status = 'concluido'
       AND i.concluido_at IS NOT NULL
       AND DATE(i.concluido_at) = ?
     ORDER BY i.concluido_at DESC, i.id DESC`,
    [unidadeId, dataReferencia]
  );

  const comissoesRows = await query<ComissaoRow>(
    `SELECT
       c.item_atendimento_id,
       c.usuario_id,
       u.nome as usuario_nome,
       u.valor_diaria as usuario_valor_diaria,
       c.tipo,
       COALESCE(c.origem, CASE WHEN c.tipo = 'execucao' THEN 'execucao' ELSE 'avaliacao' END) as origem,
       c.valor_base,
       c.valor_comissao
     FROM comissoes c
     INNER JOIN atendimentos a ON a.id = c.atendimento_id
     INNER JOIN itens_atendimento i ON i.id = c.item_atendimento_id
     INNER JOIN usuarios u ON u.id = c.usuario_id
     WHERE a.unidade_id = ?
       AND i.status = 'concluido'
       AND i.concluido_at IS NOT NULL
       AND DATE(i.concluido_at) = ?`,
    [unidadeId, dataReferencia]
  );

  const dentistasMap = new Map<number, FechamentoCaixaVisao['dentistas'][number]>();

  const ensureDentista = (usuarioId: number | null, nome: string | null, valorDiaria: number | null) => {
    if (!usuarioId || !nome) return null;
    const existing = dentistasMap.get(usuarioId);
    if (existing) return existing;
    const novo = {
      usuario_id: usuarioId,
      nome,
      included: true,
      manualmente_editado: false,
      ajuste_count: 0,
      valor_diaria: roundMoney(Number(valorDiaria || 0)),
      comissao_avaliacao: 0,
      comissao_execucao: 0,
      ajustes: [],
      lancamentos_manuais: [],
      total_dia: 0,
      procedimentos_executados: [],
    };
    dentistasMap.set(usuarioId, novo);
    return novo;
  };

  profissionaisAtivos.forEach((profissional) => {
    ensureDentista(profissional.id, profissional.nome, profissional.valor_diaria);
  });

  const comissoesPorItem = new Map<number, ComissaoRow[]>();
  comissoesRows.forEach((comissao) => {
    ensureDentista(comissao.usuario_id, comissao.usuario_nome, comissao.usuario_valor_diaria);
    const current = comissoesPorItem.get(comissao.item_atendimento_id) ?? [];
    current.push(comissao);
    comissoesPorItem.set(comissao.item_atendimento_id, current);

    const dentista = dentistasMap.get(comissao.usuario_id);
    if (!dentista) return;
    if (comissao.origem === 'avaliacao' || comissao.origem === 'acrescimo') {
      dentista.comissao_avaliacao = roundMoney(dentista.comissao_avaliacao + Number(comissao.valor_comissao || 0));
    }
  });

  procedimentosRows.forEach((row) => {
    const dentistaExecutor =
      ensureDentista(row.executor_id, row.executor_nome, row.executor_valor_diaria)
      ?? ensureDentista(row.criado_por_id, row.criado_por_nome, row.criado_por_valor_diaria);
    if (!dentistaExecutor) return;

    const comissoesItem = comissoesPorItem.get(row.item_id) ?? [];
    const vendaComissoes = comissoesItem.filter((item) => item.tipo === 'venda');
    const execComissoes = comissoesItem.filter((item) => item.tipo === 'execucao');
    const valorReferencia = roundMoney(
      Number(vendaComissoes[0]?.valor_base ?? execComissoes[0]?.valor_base ?? row.valor ?? 0)
    );
    const avaliacaoFallback = vendaComissoes.length === 0
      ? buildAvaliacaoFallback(row, valorReferencia)
      : null;

    if (avaliacaoFallback) {
      const dentistaAvaliador = ensureDentista(
        row.criado_por_id,
        row.criado_por_nome,
        row.criado_por_valor_diaria
      );
      if (dentistaAvaliador) {
        dentistaAvaliador.comissao_avaliacao = roundMoney(
          dentistaAvaliador.comissao_avaliacao + avaliacaoFallback.valor_comissao
        );
      }
    }

    const procedimento: FechamentoCaixaProcedimento = {
      key: `item:${row.item_id}`,
      item_id: row.item_id,
      atendimento_id: row.atendimento_id,
      cliente_nome: row.cliente_nome,
      procedimento_nome: row.procedimento_nome,
      procedimento_label: nomeProcedimentoItem({
        procedimento_nome: row.procedimento_nome,
        etapa_label: row.etapa_label,
        dentes: row.dentes,
        dente_unico: row.dente_unico,
      }),
      valor: roundMoney(Number(row.valor || 0)),
      concluido_at: row.concluido_at,
      included: true,
      manualmente_editado: false,
      ajustes: [],
      ranking_avaliadores: vendaComissoes.length > 0
        ? vendaComissoes.map((item) => ({
            usuario_id: item.usuario_id,
            nome: item.usuario_nome,
            valor_gerado: roundMoney(Number(item.valor_base || valorReferencia)),
            valor_comissao: roundMoney(Number(item.valor_comissao || 0)),
            origem: item.origem,
          }))
        : avaliacaoFallback
          ? [avaliacaoFallback]
          : [],
      ranking_executores: execComissoes.length > 0
        ? execComissoes.map((item) => ({
            usuario_id: item.usuario_id,
            nome: item.usuario_nome,
            valor_gerado: roundMoney(Number(item.valor_base || valorReferencia)),
            valor_comissao: roundMoney(Number(item.valor_comissao || 0)),
            origem: item.origem,
          }))
        : row.executor_id && row.executor_nome
          ? [{
              usuario_id: row.executor_id,
              nome: row.executor_nome,
              valor_gerado: valorReferencia,
              valor_comissao: 0,
              origem: 'execucao',
            }]
          : [],
    };

    dentistaExecutor.procedimentos_executados.push(procedimento);
  });

  const dentistas = Array.from(dentistasMap.values()).map((dentista) => ({
    ...dentista,
    total_dia: roundMoney(dentista.valor_diaria + dentista.comissao_avaliacao),
    procedimentos_executados: dentista.procedimentos_executados.sort((a, b) => {
      const dateA = a.concluido_at ? new Date(a.concluido_at.replace(' ', 'T')).getTime() : 0;
      const dateB = b.concluido_at ? new Date(b.concluido_at.replace(' ', 'T')).getTime() : 0;
      return dateB - dateA;
    }),
  }));

  dentistas.sort((a, b) => {
    if (b.total_dia !== a.total_dia) return b.total_dia - a.total_dia;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const totalDiarias = roundMoney(dentistas.reduce((sum, dentista) => sum + dentista.valor_diaria, 0));
  const totalComissaoAvaliacao = roundMoney(dentistas.reduce((sum, dentista) => sum + dentista.comissao_avaliacao, 0));
  const procedimentosExecutados = dentistas.reduce((sum, dentista) => sum + dentista.procedimentos_executados.length, 0);
  const faturamentoDia = roundMoney(Number(faturamentoRow?.total || 0));

  const base: FechamentoCaixaVisao = {
    data_referencia: dataReferencia,
    unidade_id: unidadeId,
    unidade_nome: unidade?.nome ?? null,
    editado_manual: false,
    ajustes_count: 0,
    resumo: {
      faturamento_dia: faturamentoDia,
      faturamento_por_metodo: faturamentoPorMetodo.map((row) => ({
        metodo: row.metodo,
        total: roundMoney(Number(row.total || 0)),
        quantidade: Number(row.quantidade || 0),
      })),
      procedimentos_executados: procedimentosExecutados,
      total_diarias: totalDiarias,
      total_comissao_avaliacao: totalComissaoAvaliacao,
      total_comissao_execucao: 0,
      ajustes_manuais: 0,
      total_final: roundMoney(faturamentoDia - totalDiarias - totalComissaoAvaliacao),
      pagamentos_cancelados_dia: {
        quantidade: Number(canceladosRow?.quantidade || 0),
        valor: roundMoney(Number(canceladosRow?.valor || 0)),
      },
    },
    graficos: {
      procedimentos_por_quantidade: [],
      ranking_avaliadores: [],
      ranking_executores: [],
    },
    dentistas,
    lancamentos_manuais_gerais: [],
  };

  return applyFechamentoCaixaDraft(base, createEmptyFechamentoCaixaDraft());
}

async function saveFechamentoRow(params: {
  unidadeId: number;
  dataReferencia: string;
  status: FechamentoCaixaStatus;
  base: FechamentoCaixaVisao;
  draft: FechamentoCaixaDraft;
  snapshot: FechamentoCaixaVisao | null;
  updatedById: number;
  fechadoPorId?: number | null;
  fechadoEm?: string | null;
}) {
  const ajustesCount = countFechamentoCaixaAdjustments(params.draft);
  const editadoManual = ajustesCount > 0;
  await execute(
    `INSERT INTO fechamentos_caixa (
       unidade_id,
       data_referencia,
       status,
       base_json,
       draft_json,
       snapshot_json,
       editado_manual,
       ajustes_count,
       fechado_por_id,
       fechado_em,
       updated_by_id,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(unidade_id, data_referencia) DO UPDATE SET
       status = excluded.status,
       base_json = excluded.base_json,
       draft_json = excluded.draft_json,
       snapshot_json = excluded.snapshot_json,
       editado_manual = excluded.editado_manual,
       ajustes_count = excluded.ajustes_count,
       fechado_por_id = excluded.fechado_por_id,
       fechado_em = excluded.fechado_em,
       updated_by_id = excluded.updated_by_id,
       updated_at = excluded.updated_at`,
    [
      params.unidadeId,
      params.dataReferencia,
      params.status,
      JSON.stringify(params.base),
      JSON.stringify(params.draft),
      params.snapshot ? JSON.stringify(params.snapshot) : null,
      coerceBooleanInt(editadoManual),
      ajustesCount,
      params.fechadoPorId ?? null,
      params.fechadoEm ?? null,
      params.updatedById,
      nowSqlite(),
    ]
  );
}

async function insertEvento(params: {
  unidadeId: number;
  dataReferencia: string;
  tipoEvento: FechamentoCaixaEventoTipo;
  entidadeTipo: string;
  entidadeChave: string;
  antesJson?: string | null;
  depoisJson?: string | null;
  motivo?: string | null;
  usuarioId: number;
}) {
  await execute(
    `INSERT INTO fechamento_caixa_eventos (
       unidade_id,
       data_referencia,
       tipo_evento,
       entidade_tipo,
       entidade_chave,
       antes_json,
       depois_json,
       motivo,
       usuario_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.unidadeId,
      params.dataReferencia,
      params.tipoEvento,
      params.entidadeTipo,
      params.entidadeChave,
      params.antesJson ?? null,
      params.depoisJson ?? null,
      params.motivo ?? null,
      params.usuarioId,
    ]
  );
}

export async function obterFechamentoCaixaResponse(unidadeId: number, dataReferencia: string): Promise<FechamentoCaixaResponse> {
  await garantirSchemaFechamentoCaixa();

  const row = await getFechamentoRow(unidadeId, dataReferencia);
  const draft = mergeDraft(parseJson(row?.draft_json, createEmptyFechamentoCaixaDraft()));
  const recentes = await getFechamentosRecentes(unidadeId);

  if (row?.status === 'fechado' && row.snapshot_json) {
    const base = sanitizeFechamentoView(
      tryParseJson<FechamentoCaixaVisao>(row.base_json)
      ?? await construirBaseFechamentoCaixa(unidadeId, dataReferencia)
    );
    const snapshot = sanitizeFechamentoView(tryParseJson<FechamentoCaixaVisao>(row.snapshot_json) ?? base);
    return {
      fechamento: createMetaFromRow(row, unidadeId, dataReferencia),
      draft,
      base,
      resultado: snapshot,
      recentes,
    };
  }

  const base = sanitizeFechamentoView(await construirBaseFechamentoCaixa(unidadeId, dataReferencia));
  const resultado = sanitizeFechamentoView(applyFechamentoCaixaDraft(base, draft));
  return {
    fechamento: createMetaFromRow(row, unidadeId, dataReferencia),
    draft,
    base,
    resultado,
    recentes,
  };
}

export async function salvarDraftFechamentoCaixa(params: {
  unidadeId: number;
  dataReferencia: string;
  draft: FechamentoCaixaDraft;
  usuarioId: number;
}): Promise<FechamentoCaixaResponse> {
  await garantirSchemaFechamentoCaixa();

  const existente = await getFechamentoRow(params.unidadeId, params.dataReferencia);
  if (existente?.status === 'fechado') {
    throw new Error('O fechamento deste dia já está fechado. Reabra para editar.');
  }

  const draft = normalizeDraft(params.draft);
  validateDraft(draft);
  const anterior = mergeDraft(parseJson(existente?.draft_json, createEmptyFechamentoCaixaDraft()));
  const base = await construirBaseFechamentoCaixa(params.unidadeId, params.dataReferencia);
  await saveFechamentoRow({
    unidadeId: params.unidadeId,
    dataReferencia: params.dataReferencia,
    status: 'aberto',
    base,
    draft,
    snapshot: null,
    updatedById: params.usuarioId,
    fechadoPorId: existente?.fechado_por_id ?? null,
    fechadoEm: existente?.fechado_em ?? null,
  });

  const eventos = buildAjusteEvents(anterior, draft);
  for (const evento of eventos) {
    await insertEvento({
      unidadeId: params.unidadeId,
      dataReferencia: params.dataReferencia,
      tipoEvento: 'ajuste',
      entidadeTipo: evento.entidade_tipo,
      entidadeChave: evento.entidade_chave,
      antesJson: evento.antes_json,
      depoisJson: evento.depois_json,
      motivo: evento.motivo,
      usuarioId: params.usuarioId,
    });
  }

  return obterFechamentoCaixaResponse(params.unidadeId, params.dataReferencia);
}

export async function fecharFechamentoCaixa(params: {
  unidadeId: number;
  dataReferencia: string;
  usuarioId: number;
}): Promise<FechamentoCaixaResponse> {
  await garantirSchemaFechamentoCaixa();

  const existente = await getFechamentoRow(params.unidadeId, params.dataReferencia);
  const draft = normalizeDraft(parseJson(existente?.draft_json, createEmptyFechamentoCaixaDraft()));
  validateDraft(draft);
  const base = await construirBaseFechamentoCaixa(params.unidadeId, params.dataReferencia);
  const snapshot = applyFechamentoCaixaDraft(base, draft);
  const fechadoEm = nowSqlite();

  await saveFechamentoRow({
    unidadeId: params.unidadeId,
    dataReferencia: params.dataReferencia,
    status: 'fechado',
    base,
    draft,
    snapshot,
    updatedById: params.usuarioId,
    fechadoPorId: params.usuarioId,
    fechadoEm,
  });

  await insertEvento({
    unidadeId: params.unidadeId,
    dataReferencia: params.dataReferencia,
    tipoEvento: 'fechado',
    entidadeTipo: 'fechamento',
    entidadeChave: `${params.unidadeId}:${params.dataReferencia}`,
    antesJson: existente ? JSON.stringify({ status: existente.status, ajustes_count: existente.ajustes_count }) : null,
    depoisJson: JSON.stringify({
      status: 'fechado',
      ajustes_count: snapshot.ajustes_count,
      total_final: snapshot.resumo.total_final,
    }),
    usuarioId: params.usuarioId,
  });

  return obterFechamentoCaixaResponse(params.unidadeId, params.dataReferencia);
}

export async function reabrirFechamentoCaixa(params: {
  unidadeId: number;
  dataReferencia: string;
  usuarioId: number;
  motivo: string;
}): Promise<FechamentoCaixaResponse> {
  await garantirSchemaFechamentoCaixa();

  const motivo = params.motivo.trim();
  if (!motivo) {
    throw new Error('Motivo da reabertura é obrigatório.');
  }

  const existente = await getFechamentoRow(params.unidadeId, params.dataReferencia);
  if (!existente || existente.status !== 'fechado') {
    throw new Error('Não existe fechamento oficial para reabrir nesta data.');
  }

  const draft = normalizeDraft(parseJson(existente.draft_json, createEmptyFechamentoCaixaDraft()));
  validateDraft(draft);
  const base = await construirBaseFechamentoCaixa(params.unidadeId, params.dataReferencia);
  await saveFechamentoRow({
    unidadeId: params.unidadeId,
    dataReferencia: params.dataReferencia,
    status: 'aberto',
    base,
    draft,
    snapshot: null,
    updatedById: params.usuarioId,
    fechadoPorId: existente.fechado_por_id,
    fechadoEm: existente.fechado_em,
  });

  await insertEvento({
    unidadeId: params.unidadeId,
    dataReferencia: params.dataReferencia,
    tipoEvento: 'reaberto',
    entidadeTipo: 'fechamento',
    entidadeChave: `${params.unidadeId}:${params.dataReferencia}`,
    antesJson: JSON.stringify({ status: 'fechado' }),
    depoisJson: JSON.stringify({ status: 'aberto' }),
    motivo,
    usuarioId: params.usuarioId,
  });

  return obterFechamentoCaixaResponse(params.unidadeId, params.dataReferencia);
}
