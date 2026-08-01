import { z } from 'zod';
import { audit, createLeadEvaluation } from './repository';
import { safeEqual } from './security';
import type { Env } from './types';

const MAX_BODY_LENGTH = 32_000;
const MAX_OBSERVACOES_LENGTH = 2_000;

const LeadEvaluationBody = z.object({
  nome: z.string().trim().min(1).max(120),
  origem: z.enum(['fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao']),
  unidadeId: z.coerce.number().int().positive().optional(),
  telefone: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(160).optional(),
  cpf: z.string().trim().max(120).optional(),
  dataNascimento: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endereco: z.string().trim().max(300).optional(),
  sexo: z.enum(['masculino', 'feminino', 'outro']).optional(),
  planoOdontologico: z.enum(['Clin', 'Prime', 'OdontoArt']).optional(),
  observacoes: z.string().trim().max(MAX_OBSERVACOES_LENGTH).optional(),
  dataAgendada: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  executorId: z.coerce.number().int().positive().optional(),
  observacoesAgendamento: z.string().trim().max(300).optional(),
}).strict();

function positiveIntegerSetting(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Configuração ${name} inválida.`);
  }
  return parsed;
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
  return Boolean(provided) && safeEqual(provided ?? '', env.SDR_API_KEY);
}

function isClientError(message: string, error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  return message.includes('Payload')
    || message.includes('obrigatório')
    || message.includes('inválid')
    || message.includes('não encontrad')
    || message.includes('passado')
    || message.includes('CPF já cadastrado')
    || message.includes('Criador')
    || message.includes('role de dentista')
    || message.includes('pertence à unidade');
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

export async function handleSdrApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/sdr/lead-avaliacao') {
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

  let unidadeId: number | null = null;
  try {
    const parsed = LeadEvaluationBody.parse(await parseJsonBody(request));
    unidadeId = parsed.unidadeId
      ?? positiveIntegerSetting(env.SDR_DEFAULT_UNIT_ID, 'SDR_DEFAULT_UNIT_ID');
    const criadoPorId = positiveIntegerSetting(
      env.SDR_CREATED_BY_USER_ID,
      'SDR_CREATED_BY_USER_ID',
    );

    const payload = await createLeadEvaluation(env, {
      nome: parsed.nome,
      origem: parsed.origem,
      unidadeId,
      criadoPorId,
      telefone: parsed.telefone,
      email: parsed.email,
      cpf: parsed.cpf,
      dataNascimento: parsed.dataNascimento,
      endereco: parsed.endereco,
      sexo: parsed.sexo,
      planoOdontologico: parsed.planoOdontologico,
      observacoes: parsed.observacoes,
      dataAgendada: parsed.dataAgendada,
      executorId: parsed.executorId,
      observacoesAgendamento: parsed.observacoesAgendamento,
    });

    await audit(env, {
      id: criadoPorId,
      clientId: 'sdr-api',
    }, 'api_sdr_lead_avaliacao', unidadeId, true);
    return json({ ok: true, ...payload }, { status: 201 });
  } catch (error) {
    await audit(env, null, 'api_sdr_lead_avaliacao', unidadeId, false);
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

    const message = error instanceof Error ? error.message : 'Erro ao criar lead e avaliação.';
    const status = isClientError(message, error) ? 400 : 500;
    return json({ ok: false, error: status === 400 ? message : 'Erro ao criar lead e avaliação.' }, { status });
  }
}
