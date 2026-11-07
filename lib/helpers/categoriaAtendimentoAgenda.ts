import { query } from '@/lib/db';

export async function resolverCategoriaAtendimentoAgenda(
  procedimentoIds: number[],
  categoriaAtualId: number | null = null
): Promise<number | null> {
  const categorias = await query<{ id: number; slug: string }>(
    'SELECT id, slug FROM categorias WHERE ativo = 1'
  );
  if (categoriaAtualId !== null) {
    return categorias.some(categoria => categoria.id === categoriaAtualId) ? categoriaAtualId : null;
  }

  const geralId = categorias.find(categoria => categoria.slug === 'geral')?.id;
  const ids = [...new Set(procedimentoIds)];
  const procedimentos = ids.length > 0
    ? await query<{ id: number; categoria_id: number | null }>(
      `SELECT id, categoria_id FROM procedimentos WHERE id IN (${ids.map(() => '?').join(', ')})`, ids
    )
    : [];
  if (procedimentos.length !== ids.length) return null;

  const categoriasIds = new Set(procedimentos.map(procedimento => procedimento.categoria_id ?? geralId));
  if (categoriasIds.size === 0 && geralId !== undefined) categoriasIds.add(geralId);
  if (categoriasIds.size !== 1) return null;
  const categoriaId = [...categoriasIds][0];
  return categorias.find(categoria => categoria.id === categoriaId)?.id ?? null;
}
