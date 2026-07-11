import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { TermoTemplate, Cliente } from '@/lib/types';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';
import { buildTermoContext, renderTermoTemplate } from '@/lib/helpers/termosPlaceholder';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { id, slug } = await (ctx.params as Promise<{ id: string; slug: string }>);

    if (!SLUG_REGEX.test(slug)) {
      return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    }

    const cliente = await queryOne<Cliente>(
      'SELECT * FROM clientes WHERE id = ?',
      [id]
    );

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    await garantirTermosSchema();

    const termo = await queryOne<TermoTemplate>(
      'SELECT id, slug, titulo, conteudo_html, ativo, created_by, updated_by, created_at, updated_at FROM termos WHERE slug = ?',
      [slug]
    );

    if (!termo || termo.ativo !== 1) {
      return NextResponse.json({ error: 'Termo não encontrado ou inativo.' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { placeholders?: Record<string, unknown> };
    const context = buildTermoContext(cliente, body.placeholders);
    const { html, placeholdersNaoEncontrados } = renderTermoTemplate(termo.conteudo_html, context);

    return NextResponse.json({
      html,
      titulo: termo.titulo,
      slug: termo.slug,
      placeholdersNaoEncontrados,
    });
  } catch (error) {
    console.error('Erro ao renderizar termo:', error);
    return NextResponse.json({ error: 'Erro ao renderizar termo' }, { status: 500 });
  }
});
