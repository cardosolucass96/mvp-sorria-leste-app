import type { D1Database } from '@/lib/db';
import type { NextRequest } from 'next/server';
import type { UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { CalendarRequestError } from './runtime';

export async function checkCalendarAccess(db: D1Database, actorId: number, ownerId: number, unit: number, manage: boolean) {
  const rows = await db.prepare(`SELECT u.id,u.nome,u.role,
    EXISTS(SELECT 1 FROM usuario_roles r WHERE r.usuario_id=u.id AND r.role='admin') AS extra_admin,
    EXISTS(SELECT 1 FROM usuario_roles r WHERE r.usuario_id=u.id AND r.role='atendente') AS extra_staff,
    EXISTS(SELECT 1 FROM usuario_unidades m WHERE m.usuario_id=u.id AND m.unidade_id=?) AS member
    FROM usuarios u WHERE u.id IN (?,?) AND u.ativo=1`).bind(unit, actorId, ownerId)
    .all<{ id: number; nome: string; role: string; extra_admin: number; extra_staff: number; member: number }>();
  const actor = rows.results.find(row => row.id === actorId);
  const owner = rows.results.find(row => row.id === ownerId);
  const admin = actor && (actor.role === 'admin' || actor.extra_admin);
  const ownerAdmin = owner && (owner.role === 'admin' || owner.extra_admin);
  if (!actor || !owner || (!admin && !actor.member) || (!ownerAdmin && !owner.member)) {
    throw new CalendarRequestError('Usuário não disponível nesta unidade.', 403);
  }
  const staff = actor.role === 'atendente' || actor.extra_staff;
  if (ownerId !== actorId && !admin && (manage || !staff)) throw new CalendarRequestError('Sem permissão para acessar esta agenda.', 403);
  return { ownerId, ownerName: owner.nome, canManage: Boolean(admin || ownerId === actorId) };
}
export async function calendarAccess(db: D1Database, request: NextRequest, context: UnitAuthenticatedContext, manage = false) {
  const value = request.nextUrl.searchParams.get('usuario_id');
  const owner = value === null ? context.user.sub : Number(value);
  if (!Number.isSafeInteger(owner) || owner < 1) throw new CalendarRequestError('Selecione um responsável válido.');
  return checkCalendarAccess(db, context.user.sub, owner, context.unidadeId, manage);
}
