import { query } from '@/lib/db';

function normalizePositiveInt(value: number | null | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export async function resolveAvaliadorPrimarioDaUnidade(unidadeId: number): Promise<number | null> {
  try {
    const rows = await query<{ id: number }>(
      `SELECT u.id
         FROM usuarios u
        WHERE u.ativo = 1
          AND u.role = 'avaliador'
          AND EXISTS (
            SELECT 1
              FROM usuario_unidades uu
             WHERE uu.usuario_id = u.id
               AND uu.unidade_id = ?
          )
        ORDER BY u.id`,
      [unidadeId]
    );

    if (rows.length === 1) {
      return normalizePositiveInt(rows[0]?.id);
    }

    return null;
  } catch {
    return null;
  }
}

export async function resolveAvaliadorPadraoDaUnidade(
  unidadeId: number,
  fallbackUsuarioId: number | null | undefined
): Promise<number | null> {
  const avaliadorPrimarioId = await resolveAvaliadorPrimarioDaUnidade(unidadeId);
  return avaliadorPrimarioId ?? normalizePositiveInt(fallbackUsuarioId);
}

export async function resolveVendedorPadraoParaAtendimento(
  atendimento: {
    status: string;
    unidade_id: number;
    avaliador_id: number | null;
  },
  fallbackUsuarioId: number | null | undefined
): Promise<number | null> {
  if (!['triagem', 'avaliacao'].includes(atendimento.status)) {
    return normalizePositiveInt(fallbackUsuarioId);
  }

  const avaliadorAtualId = normalizePositiveInt(atendimento.avaliador_id);
  if (avaliadorAtualId) {
    return avaliadorAtualId;
  }

  return resolveAvaliadorPadraoDaUnidade(atendimento.unidade_id, fallbackUsuarioId);
}
