import 'server-only';
import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import type { JwtPayload } from './jwt';
import { getUserRoles } from './middleware';

type AccessMode = 'read' | 'write';
const CLINICAL_ROLES = ['avaliador', 'executor', 'ortodontista'];

function denied() {
  return NextResponse.json({ error: 'Acesso não autorizado ao anexo' }, { status: 403 });
}

export async function checkPatientAttachmentAccess(user: JwtPayload, clienteId: number, mode: AccessMode) {
  const roles = getUserRoles(user);
  // Cadastro de cliente é global; profissionais consultam os documentos no prontuário.
  if (roles.includes('admin') || roles.includes('atendente')) return null;
  if (mode === 'write' || !roles.some(role => CLINICAL_ROLES.includes(role))) return denied();

  const unidades = user.unidade_ids ?? [];
  if (!unidades.length) return denied();
  const placeholders = unidades.map(() => '?').join(', ');
  const vinculo = await queryOne<{ id: number }>(
    `SELECT id FROM atendimentos WHERE cliente_id = ? AND unidade_id IN (${placeholders})
     UNION ALL
     SELECT id FROM agendamentos WHERE cliente_id = ? AND unidade_id IN (${placeholders}) LIMIT 1`,
    [clienteId, ...unidades, clienteId, ...unidades],
  );
  return vinculo ? null : denied();
}

export async function checkExecutionAttachmentAccess(user: JwtPayload, itemId: number, mode: AccessMode) {
  const item = await queryOne<{
    unidade_id: number | null;
    avaliador_id: number | null;
    executor_id: number | null;
    criado_por_id: number;
  }>(
    `SELECT a.unidade_id, a.avaliador_id, i.executor_id, i.criado_por_id
     FROM itens_atendimento i JOIN atendimentos a ON a.id = i.atendimento_id WHERE i.id = ?`,
    [itemId],
  );
  if (!item) return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });

  const roles = getUserRoles(user);
  if (roles.includes('admin')) return null;
  if (item.unidade_id === null || !user.unidade_ids?.includes(item.unidade_id)) return denied();
  if (roles.includes('atendente')) return null;
  if (!roles.some(role => CLINICAL_ROLES.includes(role))) return denied();
  if (mode === 'read') return null;
  return [item.avaliador_id, item.executor_id, item.criado_por_id].includes(user.sub) ? null : denied();
}

export async function checkStoredAttachmentAccess(user: JwtPayload, caminho: string) {
  const anexo = await queryOne<{ cliente_id: number | null; item_id: number | null }>(
    `SELECT cliente_id, NULL AS item_id FROM anexos_cliente WHERE caminho = ?
     UNION ALL
     SELECT NULL AS cliente_id, item_atendimento_id AS item_id FROM anexos_execucao WHERE caminho = ? LIMIT 1`,
    [caminho, caminho],
  );
  if (!anexo) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  return anexo.item_id !== null
    ? checkExecutionAttachmentAccess(user, anexo.item_id, 'read')
    : checkPatientAttachmentAccess(user, anexo.cliente_id!, 'read');
}
