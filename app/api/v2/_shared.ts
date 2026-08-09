import { NextRequest, NextResponse } from 'next/server';
import { withAuth, getUserRoles, type AuthenticatedContext } from '@/lib/auth/middleware';
import type { UserRole } from '@/lib/types';
import { getDb, queryOne, type D1PreparedStatement } from '@/lib/db';
import { isProcedureCentricFlowEnabled } from '@/lib/v2/config';
import { V2DomainError } from '@/lib/v2/domain';

export interface V2Context extends AuthenticatedContext {
  unidadeId: number;
}

type V2Handler = (request: NextRequest, context: V2Context) => Promise<Response | void>;

export function withV2(roles: UserRole[], handler: V2Handler) {
  return withAuth(async (request: NextRequest, context: AuthenticatedContext) => {
    if (!isProcedureCentricFlowEnabled()) {
      return NextResponse.json({ error: 'Fluxo V2 não habilitado neste ambiente' }, { status: 404 });
    }

    if (!roles.some((role) => getUserRoles(context.user).includes(role))) {
      return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
    }

    const unidadeHeader = request.headers.get('X-Unidade-Id');
    const unidadeId = unidadeHeader ? Number(unidadeHeader) : context.user.unidade_atual;
    if (!Number.isInteger(unidadeId) || unidadeId <= 0) {
      return NextResponse.json({ error: 'Unidade inválida' }, { status: 400 });
    }

    const isAdmin = getUserRoles(context.user).includes('admin');
    if (!isAdmin && !context.user.unidade_ids.includes(unidadeId)) {
      return NextResponse.json({ error: 'Usuário não pertence à unidade informada' }, { status: 403 });
    }

    const unidade = await queryOne<{ id: number }>('SELECT id FROM unidades WHERE id = ? AND ativo = 1', [unidadeId]);
    if (!unidade) {
      return NextResponse.json({ error: 'Unidade não encontrada ou inativa' }, { status: 403 });
    }

    try {
      return await handler(request, { ...context, unidadeId });
    } catch (error) {
      return handleV2Error(error);
    }
  });
}

export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new V2DomainError('O corpo da requisição deve ser um objeto JSON.');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof V2DomainError) throw error;
    throw new V2DomainError('JSON inválido.');
  }
}

export function handleV2Error(error: unknown): NextResponse {
  if (error instanceof V2DomainError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    return NextResponse.json(
      { error: 'Esta operação já foi registrada.', code: 'operacao_duplicada' },
      { status: 409 },
    );
  }
  console.error('Erro no fluxo V2', error);
  return NextResponse.json({ error: 'Erro interno no fluxo V2' }, { status: 500 });
}

export function getIdempotencyKey(request: NextRequest, required = true): string | null {
  const value = request.headers.get('Idempotency-Key')?.trim() || null;
  if (required && !value) {
    throw new V2DomainError('O header Idempotency-Key é obrigatório.', 400, 'idempotency_key_obrigatoria');
  }
  if (value && value.length > 120) {
    throw new V2DomainError('Idempotency-Key deve ter no máximo 120 caracteres.');
  }
  return value;
}

export async function requireClientInUnit(clienteId: number, unidadeId: number) {
  const cliente = await queryOne<{ id: number; nome: string }>(
    `SELECT c.id, c.nome
     FROM clientes c
     JOIN cliente_unidades_v2 cu ON cu.cliente_id = c.id
     WHERE c.id = ? AND cu.unidade_id = ?`,
    [clienteId, unidadeId],
  );
  if (!cliente) {
    throw new V2DomainError('Paciente não pertence à unidade informada.', 403, 'paciente_fora_da_unidade');
  }
  return cliente;
}

export async function requireProfessionalInUnit(
  usuarioId: number,
  unidadeId: number,
  allowedRoles: UserRole[],
) {
  const profissional = await queryOne<{ id: number; nome: string; roles: string | null }>(
    `SELECT u.id, u.nome, GROUP_CONCAT(ur.role) AS roles
     FROM usuarios u
     JOIN usuario_unidades uu ON uu.usuario_id = u.id AND uu.unidade_id = ?
     LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
     WHERE u.id = ? AND u.ativo = 1
     GROUP BY u.id`,
    [unidadeId, usuarioId],
  );
  const roles = profissional?.roles?.split(',') ?? [];
  if (!profissional || !allowedRoles.some((role) => roles.includes(role))) {
    throw new V2DomainError('Profissional inválido para esta unidade e função.', 403, 'profissional_invalido');
  }
  return profissional;
}

export async function requireScopedEntity<T extends { id: string }>(
  table: 'agenda_compromissos' | 'atendimentos_clinicos' | 'avaliacoes' | 'orcamentos' | 'procedimentos_cliente' | 'recebimentos',
  id: string,
  unidadeId: number,
): Promise<T> {
  const entity = await queryOne<T>(`SELECT * FROM ${table} WHERE id = ? AND unidade_id = ?`, [id, unidadeId]);
  if (!entity) {
    throw new V2DomainError('Registro não encontrado nesta unidade.', 404, 'registro_nao_encontrado');
  }
  return entity;
}

export function domainEventStatement(input: {
  unidadeId: number;
  clienteId?: number | null;
  entityType: string;
  entityId: string;
  eventType: string;
  actorId: number;
  data?: Record<string, unknown>;
  idempotencyKey?: string | null;
}): D1PreparedStatement {
  return getDb().prepare(
    `INSERT INTO eventos_dominio (
      id, unidade_id, cliente_id, entidade_tipo, entidade_id, evento_tipo,
      autor_id, dados_json, idempotency_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.unidadeId,
    input.clienteId ?? null,
    input.entityType,
    input.entityId,
    input.eventType,
    input.actorId,
    JSON.stringify(input.data ?? {}),
    input.idempotencyKey ?? null,
  );
}

export function prepared(sql: string, params: unknown[] = []): D1PreparedStatement {
  const statement = getDb().prepare(sql);
  return params.length > 0 ? statement.bind(...params) : statement;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
