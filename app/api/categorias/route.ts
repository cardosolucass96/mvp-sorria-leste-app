import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withAuth, withRole } from '@/lib/auth/middleware';
import { Categoria, CategoriaComRoles, UserRole } from '@/lib/types';
import { ALL_ROLES } from '@/lib/constants/roles';

const SLUG_REGEX = /^[a-z0-9-]+$/;

// GET /api/categorias - Lista categorias (todos autenticados — usado no sidebar e selects)
export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const ativo = searchParams.get('ativo');

    const where = ativo === '1' ? 'WHERE c.ativo = 1' : '';
    const categorias = await query<Categoria & { roles_csv: string | null }>(
      `SELECT c.*, (
         SELECT GROUP_CONCAT(role) FROM categoria_roles WHERE categoria_id = c.id
       ) AS roles_csv
       FROM categorias c
       ${where}
       ORDER BY c.ordem ASC, c.nome ASC`
    );

    const result: CategoriaComRoles[] = categorias.map(({ roles_csv, ...c }) => ({
      ...c,
      roles: (roles_csv ? roles_csv.split(',') : []) as UserRole[],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    return NextResponse.json({ error: 'Erro ao listar categorias' }, { status: 500 });
  }
});

// POST /api/categorias - admin
export const POST = withRole(['admin'], async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { nome, slug, cor, icone, ordem, pula_avaliacao, roles } = body;

    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }
    if (!slug || typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: 'Slug inválido (apenas minúsculas, números e hífen)' },
        { status: 400 }
      );
    }
    if (!Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json({ error: 'Informe ao menos uma role' }, { status: 400 });
    }
    for (const r of roles) {
      if (!ALL_ROLES.includes(r as UserRole)) {
        return NextResponse.json({ error: `Role inválida: ${r}` }, { status: 400 });
      }
    }

    const existing = await queryOne<Categoria>('SELECT id FROM categorias WHERE slug = ?', [slug]);
    if (existing) {
      return NextResponse.json({ error: 'Slug já cadastrado' }, { status: 409 });
    }

    const result = await execute(
      `INSERT INTO categorias (nome, slug, cor, icone, ordem, pula_avaliacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        slug,
        cor || 'primary',
        icone || 'Activity',
        Number.isInteger(ordem) ? ordem : 0,
        pula_avaliacao ? 1 : 0,
      ]
    );
    const categoriaId = result.lastInsertRowid as number;

    for (const role of roles) {
      await execute(
        'INSERT OR IGNORE INTO categoria_roles (categoria_id, role) VALUES (?, ?)',
        [categoriaId, role]
      );
    }

    const created = await queryOne<Categoria>('SELECT * FROM categorias WHERE id = ?', [categoriaId]);
    return NextResponse.json({ ...created, roles }, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    return NextResponse.json({ error: 'Erro ao criar categoria' }, { status: 500 });
  }
});
