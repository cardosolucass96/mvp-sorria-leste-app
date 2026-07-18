import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withRole } from '@/lib/auth/middleware';
import { TermoTemplate } from '@/lib/types';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';
import { normalizeLegacyTermoTemplateHtml } from '@/lib/helpers/termosPlaceholder';

function normalizarSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

function toAtivoBoolean(value: unknown, fallback = true): number {
  if (value === undefined) return fallback ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  return value ? 1 : 0;
}

// GET /api/termos
export const GET = withRole(['admin'], async (request: NextRequest) => {
  try {
    await garantirTermosSchema();
    const { searchParams } = new URL(request.url);
    const apenasAtivos = searchParams.get('ativo') === '1';

    const termos = await query<TermoTemplate>(
      `SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at
         FROM termos
        ${apenasAtivos ? 'WHERE ativo = 1' : ''}
        ORDER BY titulo ASC, id DESC`
    );

    return NextResponse.json(termos);
  } catch (error) {
    console.error('Erro ao listar termos:', error);
    return NextResponse.json({ error: 'Erro ao listar termos' }, { status: 500 });
  }
});

// POST /api/termos
export const POST = withRole(['admin'], async (request: NextRequest, context) => {
  try {
    await garantirTermosSchema();

    const body = await request.json();
    const titulo = String(body?.titulo || '').trim();
    const slugEntrada = String(body?.slug || '').trim();
    const conteudoHtml = normalizeLegacyTermoTemplateHtml(String(body?.conteudo_html || '').trim());
    const ativo = toAtivoBoolean(body?.ativo, true);
    const permiteAutentique = toAtivoBoolean(body?.permite_autentique, true);

    if (!titulo) {
      return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 });
    }

    const slug = normalizarSlug(slugEntrada || titulo);
    if (!slug) {
      return NextResponse.json({ error: 'Slug inválido. Informe um texto com letras, números ou hífen.' }, { status: 400 });
    }

    if (!conteudoHtml) {
      return NextResponse.json({ error: 'Conteúdo HTML é obrigatório.' }, { status: 400 });
    }

    const existente = await queryOne<TermoTemplate>('SELECT id FROM termos WHERE slug = ?', [slug]);
    if (existente) {
      return NextResponse.json({ error: 'Já existe um termo com este slug.' }, { status: 409 });
    }

    await execute(
      `INSERT INTO termos (slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [slug, titulo, conteudoHtml, ativo, permiteAutentique, context.user.sub, context.user.sub]
    );

    const criado = await queryOne<TermoTemplate>(
      'SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at FROM termos WHERE slug = ?',
      [slug]
    );

    return NextResponse.json(criado, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar termo:', error);
    return NextResponse.json({ error: 'Erro ao criar termo' }, { status: 500 });
  }
});
