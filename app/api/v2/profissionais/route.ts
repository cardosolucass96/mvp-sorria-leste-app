import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withV2, type V2Context } from '../_shared';

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (_request, context: V2Context) => {
    const professionals = await query<{
      id: number;
      nome: string;
      role: string;
      roles_csv: string | null;
    }>(
      `SELECT u.id, u.nome, u.role, GROUP_CONCAT(DISTINCT ur.role) AS roles_csv
       FROM usuarios u
       JOIN usuario_unidades uu ON uu.usuario_id = u.id AND uu.unidade_id = ?
       LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
       WHERE u.ativo = 1
       GROUP BY u.id ORDER BY u.nome`,
      [context.unidadeId],
    );
    return NextResponse.json(professionals.map(({ roles_csv, ...professional }) => ({
      ...professional,
      roles: roles_csv?.split(',').filter(Boolean) ?? [professional.role],
    })));
  },
);
