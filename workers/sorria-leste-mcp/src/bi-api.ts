import { z } from 'zod';
import { safeEqual } from './security';
import type { Env } from './types';

const MAX_BODY_LENGTH = 2_048;
const FORTALEZA_OFFSET_HOURS = 3;

const DailyReportBody = z.object({
  unidadeId: z.coerce.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

interface OriginMetricRow {
  origem: string;
  total: number | string | null;
}

interface EvaluatedProcedureMetricRow extends OriginMetricRow {
  quantidade: number | string | null;
}

interface OriginMetrics {
  atendimentosCriados: number;
  valorItensCriados: number;
  procedimentosAvaliados: number;
  valorProcedimentosAvaliados: number;
  recebidoBruto: number;
}

function json(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  return request.headers.get('X-API-Key')?.trim() || null;
}

function isAuthorized(request: Request, env: Env): boolean {
  const provided = bearerToken(request);
  return Boolean(provided) && safeEqual(provided ?? '', env.BI_API_KEY);
}

function sqlUtcInstantExpression(column: string): string {
  const trimmed = `TRIM(${column})`;
  return `CASE
    WHEN ${column} IS NULL THEN NULL
    WHEN ${trimmed} = '' THEN NULL
    WHEN instr(${trimmed}, 'T') > 0 THEN ${trimmed}
    WHEN instr(${trimmed}, ' ') > 0 THEN replace(${trimmed}, ' ', 'T') || 'Z'
    ELSE ${trimmed}
  END`;
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_LENGTH) {
    throw new Error('Payload muito grande.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) throw new Error('Payload muito grande.');
  if (!text.trim()) throw new Error('Payload JSON obrigatório.');
  return JSON.parse(text) as unknown;
}

function reportWindow(data: string): { inicioUtc: string; fimUtc: string } {
  const [year, month, day] = data.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Data inválida. Use AAAA-MM-DD.');
  }

  return {
    inicioUtc: new Date(Date.UTC(year, month - 1, day, FORTALEZA_OFFSET_HOURS)).toISOString(),
    fimUtc: new Date(Date.UTC(year, month - 1, day + 1, FORTALEZA_OFFSET_HOURS)).toISOString(),
  };
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricFor(map: Map<string, OriginMetrics>, origem: string): OriginMetrics {
  const current = map.get(origem);
  if (current) return current;

  const empty = {
    atendimentosCriados: 0,
    valorItensCriados: 0,
    procedimentosAvaliados: 0,
    valorProcedimentosAvaliados: 0,
    recebidoBruto: 0,
  };
  map.set(origem, empty);
  return empty;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function handleBiApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/bi/relatorio-diario') {
    return new Response('Not found', { status: 404 });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Método não permitido.' }, {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }

  if (!isAuthorized(request, env)) {
    return json({ ok: false, error: 'API key inválida.' }, { status: 401 });
  }

  try {
    const body = DailyReportBody.parse(await parseJsonBody(request));
    const window = reportWindow(body.data);
    const atendimentoCreatedAt = sqlUtcInstantExpression('a.created_at');
    const itemCreatedAt = sqlUtcInstantExpression('i.created_at');
    const pagamentoCreatedAt = sqlUtcInstantExpression('p.created_at');

    const [
      atendimentosResult,
      itensResult,
      procedimentosAvaliadosResult,
      recebimentosResult,
    ] = await env.DB.batch<OriginMetricRow | EvaluatedProcedureMetricRow>([
      env.DB.prepare(
        `SELECT COALESCE(c.origem, 'sem_origem') AS origem,
                COUNT(DISTINCT a.id) AS total
         FROM atendimentos a
         INNER JOIN clientes c ON c.id = a.cliente_id
         WHERE a.unidade_id = ?
           AND ${atendimentoCreatedAt} >= ?
           AND ${atendimentoCreatedAt} < ?
         GROUP BY COALESCE(c.origem, 'sem_origem')`,
      ).bind(body.unidadeId, window.inicioUtc, window.fimUtc),
      env.DB.prepare(
        `SELECT COALESCE(c.origem, 'sem_origem') AS origem,
                ROUND(COALESCE(SUM(COALESCE(i.valor_final, i.valor)), 0), 2) AS total
         FROM itens_atendimento i
         INNER JOIN atendimentos a ON a.id = i.atendimento_id
         INNER JOIN clientes c ON c.id = a.cliente_id
         WHERE a.unidade_id = ?
           AND ${itemCreatedAt} >= ?
           AND ${itemCreatedAt} < ?
         GROUP BY COALESCE(c.origem, 'sem_origem')`,
      ).bind(body.unidadeId, window.inicioUtc, window.fimUtc),
      env.DB.prepare(
        `SELECT COALESCE(c.origem, 'sem_origem') AS origem,
                COUNT(DISTINCT i.id) AS quantidade,
                ROUND(COALESCE(SUM(COALESCE(i.valor_final, i.valor)), 0), 2) AS total
         FROM itens_atendimento i
         INNER JOIN atendimentos a ON a.id = i.atendimento_id
         INNER JOIN clientes c ON c.id = a.cliente_id
         INNER JOIN usuarios u ON u.id = i.criado_por_id
         WHERE a.unidade_id = ?
           AND ${itemCreatedAt} >= ?
           AND ${itemCreatedAt} < ?
           AND (
             u.role = 'avaliador'
             OR EXISTS (
               SELECT 1
               FROM usuario_roles ur
               WHERE ur.usuario_id = u.id
                 AND ur.role = 'avaliador'
             )
           )
         GROUP BY COALESCE(c.origem, 'sem_origem')`,
      ).bind(body.unidadeId, window.inicioUtc, window.fimUtc),
      env.DB.prepare(
        `SELECT COALESCE(c.origem, 'sem_origem') AS origem,
                ROUND(COALESCE(SUM(p.valor), 0), 2) AS total
         FROM pagamentos p
         INNER JOIN atendimentos a ON a.id = p.atendimento_id
         INNER JOIN clientes c ON c.id = a.cliente_id
         WHERE a.unidade_id = ?
           AND COALESCE(p.cancelado, 0) = 0
           AND ${pagamentoCreatedAt} >= ?
           AND ${pagamentoCreatedAt} < ?
         GROUP BY COALESCE(c.origem, 'sem_origem')`,
      ).bind(body.unidadeId, window.inicioUtc, window.fimUtc),
    ]);

    const metrics = new Map<string, OriginMetrics>();
    for (const row of atendimentosResult?.results ?? []) {
      metricFor(metrics, row.origem).atendimentosCriados = toNumber(row.total);
    }
    for (const row of itensResult?.results ?? []) {
      metricFor(metrics, row.origem).valorItensCriados = toNumber(row.total);
    }
    for (const row of procedimentosAvaliadosResult?.results ?? []) {
      const metric = metricFor(metrics, row.origem);
      metric.procedimentosAvaliados = toNumber(
        (row as EvaluatedProcedureMetricRow).quantidade,
      );
      metric.valorProcedimentosAvaliados = toNumber(row.total);
    }
    for (const row of recebimentosResult?.results ?? []) {
      metricFor(metrics, row.origem).recebidoBruto = toNumber(row.total);
    }

    const porOrigem = Array.from(metrics.entries())
      .map(([origem, values]) => ({
        origem,
        atendimentosCriados: values.atendimentosCriados,
        valorItensCriados: roundCurrency(values.valorItensCriados),
        procedimentosAvaliados: values.procedimentosAvaliados,
        valorProcedimentosAvaliados: roundCurrency(values.valorProcedimentosAvaliados),
        recebidoBruto: roundCurrency(values.recebidoBruto),
      }))
      .sort((left, right) => right.recebidoBruto - left.recebidoBruto
        || right.valorItensCriados - left.valorItensCriados
        || right.atendimentosCriados - left.atendimentosCriados
        || left.origem.localeCompare(right.origem));

    const totais = porOrigem.reduce<OriginMetrics>((current, row) => ({
      atendimentosCriados: current.atendimentosCriados + row.atendimentosCriados,
      valorItensCriados: current.valorItensCriados + row.valorItensCriados,
      procedimentosAvaliados: current.procedimentosAvaliados + row.procedimentosAvaliados,
      valorProcedimentosAvaliados:
        current.valorProcedimentosAvaliados + row.valorProcedimentosAvaliados,
      recebidoBruto: current.recebidoBruto + row.recebidoBruto,
    }), {
      atendimentosCriados: 0,
      valorItensCriados: 0,
      procedimentosAvaliados: 0,
      valorProcedimentosAvaliados: 0,
      recebidoBruto: 0,
    });

    console.log(JSON.stringify({
      event: 'bi_relatorio_diario_consultado',
      unidadeId: body.unidadeId,
      data: body.data,
      origens: porOrigem.length,
    }));

    return json({
      ok: true,
      unidadeId: body.unidadeId,
      data: body.data,
      fusoHorario: 'America/Fortaleza',
      janelaUtc: window,
      totais: {
        atendimentosCriados: totais.atendimentosCriados,
        valorItensCriados: roundCurrency(totais.valorItensCriados),
        procedimentosAvaliados: totais.procedimentosAvaliados,
        valorProcedimentosAvaliados: roundCurrency(totais.valorProcedimentosAvaliados),
        recebidoBruto: roundCurrency(totais.recebidoBruto),
      },
      porOrigem,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({
        ok: false,
        error: 'Dados inválidos.',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Erro ao consultar relatório diário.';
    const status = message.includes('Payload') || message.includes('Data inválida') ? 400 : 500;
    if (status === 500) {
      console.error(JSON.stringify({ event: 'bi_relatorio_diario_falhou', error: message }));
    }
    return json({ ok: false, error: status === 400 ? message : 'Erro ao consultar relatório diário.' }, { status });
  }
}
