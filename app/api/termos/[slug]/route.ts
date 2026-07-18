import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withRole } from '@/lib/auth/middleware';
import { TermoTemplate } from '@/lib/types';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';
import { normalizeLegacyTermoTemplateHtml } from '@/lib/helpers/termosPlaceholder';
import { nowUtcIso } from '@/lib/time';

const SLUG_REGEX = /^[a-z0-9-]+$/;

function normalizarSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

export const GET = withRole(['admin'], async (_request: NextRequest, ctx) => {
  try {
    await garantirTermosSchema();
    const { slug } = await (ctx.params as Promise<{ slug: string }>);

    const termo = await queryOne<TermoTemplate>(
      'SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at FROM termos WHERE slug = ?',
      [slug]
    );

    if (!termo) {
      return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 });
    }

    return NextResponse.json(termo);
  } catch (error) {
    console.error('Erro ao buscar termo:', error);
    return NextResponse.json({ error: 'Erro ao buscar termo' }, { status: 500 });
  }
});

export const PUT = withRole(['admin'], async (request: NextRequest, ctx) => {
  try {
    await garantirTermosSchema();
    const { slug: slugAtual } = await (ctx.params as Promise<{ slug: string }>);

    if (!SLUG_REGEX.test(slugAtual)) {
      return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    }

    const body = await request.json();
    const titulo = body?.titulo !== undefined ? String(body.titulo).trim() : null;
    const slugNovoEntrada = body?.slug !== undefined ? String(body.slug).trim() : null;
    const conteudoHtml = body?.conteudo_html !== undefined
      ? normalizeLegacyTermoTemplateHtml(String(body.conteudo_html).trim())
      : null;
    const ativo = body?.ativo === undefined ? null : Number(Boolean(body.ativo));
    const permiteAutentique = body?.permite_autentique === undefined ? null : Number(Boolean(body.permite_autentique));

    const termo = await queryOne<TermoTemplate>(
      'SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at FROM termos WHERE slug = ?',
      [slugAtual]
    );

    if (!termo) {
      return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 });
    }

    const slugNovo = slugNovoEntrada
      ? normalizarSlug(slugNovoEntrada)
      : termo.slug;

    if (!slugNovo || !SLUG_REGEX.test(slugNovo)) {
      return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    }

    if (slugNovo !== termo.slug) {
      const conflito = await queryOne<TermoTemplate>(
        'SELECT id FROM termos WHERE slug = ? AND id != ?',
        [slugNovo, termo.id]
      );
      if (conflito) {
        return NextResponse.json({ error: 'Já existe um termo com este slug.' }, { status: 409 });
      }
    }

    if (titulo === '') {
      return NextResponse.json({ error: 'Título não pode ficar vazio.' }, { status: 400 });
    }

    if (conteudoHtml === '') {
      return NextResponse.json({ error: 'Conteúdo HTML não pode ficar vazio.' }, { status: 400 });
    }

    await execute(
      `UPDATE termos
         SET slug = ?,
             titulo = ?,
             conteudo_html = ?,
             ativo = ?,
             permite_autentique = ?,
             updated_by = ?,
             updated_at = ?
       WHERE slug = ?`,
      [
        slugNovo,
        titulo ?? termo.titulo,
        conteudoHtml ?? termo.conteudo_html,
        ativo ?? termo.ativo,
        permiteAutentique ?? termo.permite_autentique ?? 1,
        ctx.user.sub,
        nowUtcIso(),
        slugAtual,
      ]
    );

    const termoAtualizado = await queryOne<TermoTemplate>(
      'SELECT id, slug, titulo, conteudo_html, ativo, permite_autentique, created_by, updated_by, created_at, updated_at FROM termos WHERE id = ?',
      [termo.id]
    );

    return NextResponse.json(termoAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar termo:', error);
    return NextResponse.json({ error: 'Erro ao atualizar termo' }, { status: 500 });
  }
});

export const DELETE = withRole(['admin'], async (_request: NextRequest, ctx) => {
  try {
    await garantirTermosSchema();
    const { slug } = await (ctx.params as Promise<{ slug: string }>);

    if (!SLUG_REGEX.test(slug)) {
      return NextResponse.json({ error: 'Slug inválido.' }, { status: 400 });
    }

    const termo = await queryOne<TermoTemplate>(
      'SELECT id FROM termos WHERE slug = ?',
      [slug]
    );

    if (!termo) {
      return NextResponse.json({ error: 'Termo não encontrado' }, { status: 404 });
    }

    await execute('DELETE FROM termos WHERE id = ?', [termo.id]);
    return NextResponse.json({ message: 'Termo removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover termo:', error);
    return NextResponse.json({ error: 'Erro ao remover termo' }, { status: 500 });
  }
});
