import { queryOne } from '@/lib/db';
import { FOLLOWUP_TIPO_CONFIG } from '@/lib/constants/followup';
import {
  clinicDateTimeInputToUtcIso,
  clinicDateTimeInputToUtcIsoEndOfDay,
  parseStoredUtcInstant,
} from '@/lib/time';
import type { FollowupTarefa, FollowupTarefaCompleta, FollowupTipo } from '@/lib/types';

export const FOLLOWUP_DETAIL_SQL = `
  SELECT
    f.*,
    c.nome AS cliente_nome,
    c.telefone AS cliente_telefone,
    ru.nome AS responsavel_usuario_nome,
    cu.nome AS criado_por_nome,
    uu.nome AS concluida_por_nome
  FROM followup_tarefas f
  JOIN clientes c ON c.id = f.cliente_id
  JOIN usuarios ru ON ru.id = f.responsavel_usuario_id
  JOIN usuarios cu ON cu.id = f.criado_por_id
  LEFT JOIN usuarios uu ON uu.id = f.concluida_por_id
  WHERE f.id = ? AND f.unidade_id = ?
`;

export function isFollowupTipo(value: unknown): value is FollowupTipo {
  return typeof value === 'string' && value in FOLLOWUP_TIPO_CONFIG;
}

export function normalizeDateTimeInput(value: unknown): string | null {
  return typeof value === 'string' ? clinicDateTimeInputToUtcIso(value) : null;
}

export function normalizeRangeStart(value: string | null): string | null {
  return clinicDateTimeInputToUtcIso(value);
}

export function normalizeRangeEnd(value: string | null): string | null {
  return clinicDateTimeInputToUtcIsoEndOfDay(value);
}

export function parseLocalDateTime(value: string | null | undefined): Date | null {
  return parseStoredUtcInstant(value);
}

export function isTaskMutable(task: Pick<FollowupTarefa, 'status' | 'excluida_em'>): boolean {
  return task.status === 'aberta' && task.excluida_em === null;
}

export async function isValidResponsavelAtendente(
  responsavelUsuarioId: number,
  unidadeId: number
): Promise<boolean> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM usuarios u
      WHERE u.id = ?
        AND u.ativo = 1
        AND (
          u.role IN ('atendente', 'admin')
          OR EXISTS (
            SELECT 1
              FROM usuario_roles ur
             WHERE ur.usuario_id = u.id
               AND ur.role IN ('atendente', 'admin')
          )
        )
        AND EXISTS (
          SELECT 1
            FROM usuario_unidades uu
           WHERE uu.usuario_id = u.id
             AND uu.unidade_id = ?
        )`,
    [responsavelUsuarioId, unidadeId]
  );
  return !!row && row.n > 0;
}

export async function getFollowupTask(
  id: number,
  unidadeId: number
): Promise<FollowupTarefa | null> {
  return queryOne<FollowupTarefa>(
    'SELECT * FROM followup_tarefas WHERE id = ? AND unidade_id = ?',
    [id, unidadeId]
  );
}

export async function getFollowupTaskDetail(
  id: number,
  unidadeId: number
): Promise<FollowupTarefaCompleta | null> {
  return queryOne<FollowupTarefaCompleta>(FOLLOWUP_DETAIL_SQL, [id, unidadeId]);
}
