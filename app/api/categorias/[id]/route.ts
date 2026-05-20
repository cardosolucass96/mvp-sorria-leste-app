import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withAuth, withRole } from '@/lib/auth/middleware';
import { Categoria, UserRole } from '@/lib/types';
import { ALL_ROLES } from '@/lib/constants/roles';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { id } = await (ctx.params as Promise<{ id: string }>);
    const categoria = await queryOne<Categoria>('SELECT * FROM categorias WHERE id = ?', [id]);
    if (!categoria) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }
    const roles = await query<{ role: string }>(
      'SELECT role FROM categoria_roles WHERE categoria_id = ?',
      [id]
    );
    return NextResponse.json({ ...categoria, roles: roles.map(r => r.role) });
  } catch (error) {
    console.error('Erro ao buscar categoria:', error);
    return NextResponse.json({ error: 'Erro ao buscar categoria' }, { status: 500 });
  }
});

export const PUT = withRole(['admin'], async (request: NextRequest, ctx) => {
  try {
    const { id } = await (ctx.params as Promise<{ id: string }>);
    const body = await request.json();
    const { nome, slug, cor, icone, ordem, pula_avaliacao, ativo, roles } = body;

    const existing = await queryOne<Categoria>('SELECT * FROM categorias WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    if (slug && (typeof slug !== 'string' || !SLUG_REGEX.test(slug))) {
      return NextResponse.json(
        { error: 'Slug inválido (apenas minúsculas, números e hífen)' },
        { status: 400 }
      );
    }

    if (slug && slug !== existing.slug) {
      const conflict = await queryOne<Categoria>(
        'SELECT id FROM categorias WHERE slug = ? AND id != ?',
        [slug, id]
      );
      if (conflict) {
        return NextResponse.json({ error: 'Slug já cadastrado' }, { status: 409 });
      }
    }

    if (roles !== undefined) {
      if (!Array.isArray(roles) || roles.length === 0) {
        return NextResponse.json({ error: 'Informe ao menos uma role' }, { status: 400 });
      }
      for (const r of roles) {
        if (!ALL_ROLES.includes(r as UserRole)) {
          return NextResponse.json({ error: `Role inválida: ${r}` }, { status: 400 });
        }
      }
    }

    await execute(
      `UPDATE categorias SET
         nome = COALESCE(?, nome),
         slug = COALESCE(?, slug),
         cor = COALESCE(?, cor),
         icone = COALESCE(?, icone),
         ordem = COALESCE(?, ordem),
         pula_avaliacao = COALESCE(?, pula_avaliacao),
         ativo = COALESCE(?, ativo)
       WHERE id = ?`,
      [
        typeof nome === 'string' ? nome.trim() : null,
        slug || null,
        cor || null,
        icone || null,
        Number.isInteger(ordem) ? ordem : null,
        pula_avaliacao === undefined ? null : (pula_avaliacao ? 1 : 0),
        ativo === undefined ? null : (ativo ? 1 : 0),
        id,
      ]
    );

    if (Array.isArray(roles)) {
      await execute('DELETE FROM categoria_roles WHERE categoria_id = ?', [id]);
      for (const role of roles) {
        await execute(
          'INSERT OR IGNORE INTO categoria_roles (categoria_id, role) VALUES (?, ?)',
          [id, role]
        );
      }
    }

    const updated = await queryOne<Categoria>('SELECT * FROM categorias WHERE id = ?', [id]);
    const rolesAtualizadas = await query<{ role: string }>(
      'SELECT role FROM categoria_roles WHERE categoria_id = ?',
      [id]
    );
    return NextResponse.json({ ...updated, roles: rolesAtualizadas.map(r => r.role) });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    return NextResponse.json({ error: 'Erro ao atualizar categoria' }, { status: 500 });
  }
});

// DELETE /api/categorias/[id] - soft delete
export const DELETE = withRole(['admin'], async (_req: NextRequest, ctx) => {
  try {
    const { id } = await (ctx.params as Promise<{ id: string }>);

    const existing = await queryOne<Categoria>('SELECT * FROM categorias WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    // Bloqueia se tem atendimento não-finalizado usando a categoria
    const emUso = await queryOne<{ n: number }>(
      `SELECT COUNT(*) as n FROM atendimentos
        WHERE categoria_id = ?
          AND status NOT IN ('finalizado', 'encerrado')`,
      [id]
    );
    if (emUso && emUso.n > 0) {
      return NextResponse.json(
        { error: `Existem ${emUso.n} atendimento(s) abertos nessa categoria. Finalize-os antes.` },
        { status: 409 }
      );
    }

    await execute('UPDATE categorias SET ativo = 0 WHERE id = ?', [id]);
    return NextResponse.json({ message: 'Categoria desativada com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    return NextResponse.json({ error: 'Erro ao excluir categoria' }, { status: 500 });
  }
});
