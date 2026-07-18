import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { withUnit } from '@/lib/auth/middleware';
import { Cliente } from '@/lib/types';
import { carregarTermoRenderizadoParaCliente } from '@/lib/helpers/termosCliente';

const SLUG_REGEX = /^[a-z0-9-]+$/;

export const POST = withUnit(async (request: NextRequest, ctx) => {
  try {
    const { id, slug } = await (ctx.params as Promise<{ id: string; slug: string }>);

    if (!SLUG_REGEX.test(slug)) {
      return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    }

    const cliente = await queryOne<Cliente>(
      'SELECT id FROM clientes WHERE id = ?',
      [id]
    );

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { placeholders?: Record<string, unknown> };
    const termoRenderizado = await carregarTermoRenderizadoParaCliente({
      clienteId: id,
      slug,
      unidadeId: ctx.unidadeId,
      placeholders: body.placeholders,
    });

    if (!termoRenderizado) {
      return NextResponse.json({ error: 'Termo não encontrado ou inativo.' }, { status: 404 });
    }

    return NextResponse.json({
      html: termoRenderizado.html,
      titulo: termoRenderizado.termo.titulo,
      slug: termoRenderizado.termo.slug,
      placeholdersNaoEncontrados: termoRenderizado.placeholdersNaoEncontrados,
      draft: termoRenderizado.draft,
    });
  } catch (error) {
    console.error('Erro ao renderizar termo:', error);
    return NextResponse.json({ error: 'Erro ao renderizar termo' }, { status: 500 });
  }
});
