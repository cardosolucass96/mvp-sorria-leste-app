import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { withUnit } from '@/lib/auth/middleware';
import { garantirTermosDigitaisSchema } from '@/lib/helpers/garantirTermosDigitaisSchema';
import { carregarTermoRenderizadoParaCliente } from '@/lib/helpers/termosCliente';
import { createAutentiqueDocumentFromHtml } from '@/lib/integrations/autentique/client';
import { buildTermoAutentiqueDocument } from '@/lib/helpers/termosDocumento';
import { Cliente } from '@/lib/types';

const SLUG_REGEX = /^[a-z0-9-]+$/;

function normalizePlaceholderInput(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    normalized[normalizedKey] = value === null || value === undefined ? '' : String(value);
  }

  return normalized;
}

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

    const body = await request.json().catch(() => ({})) as { placeholders?: Record<string, unknown> };
    const placeholders = normalizePlaceholderInput(body.placeholders);
    const termoRenderizado = await carregarTermoRenderizadoParaCliente({
      clienteId: id,
      slug,
      unidadeId: ctx.unidadeId,
      placeholders,
    });

    if (!termoRenderizado) {
      return NextResponse.json({ error: 'Termo não encontrado ou inativo.' }, { status: 404 });
    }

    if (termoRenderizado.termo.permite_autentique === 0) {
      return NextResponse.json({ error: 'Este termo está disponível apenas para impressão.' }, { status: 400 });
    }

    if (termoRenderizado.draft.pendentes.length > 0) {
      return NextResponse.json({
        error: `Preencha todos os campos pendentes antes de gerar o termo digital.`,
        pendentes: termoRenderizado.draft.pendentes,
      }, { status: 400 });
    }

    const htmlAutentique = buildTermoAutentiqueDocument(
      termoRenderizado.termo.titulo,
      termoRenderizado.html,
    );

    const created = await createAutentiqueDocumentFromHtml({
      title: `${termoRenderizado.termo.titulo} - ${termoRenderizado.cliente.nome}`,
      html: htmlAutentique,
      signer: {
        name: termoRenderizado.cliente.nome,
        cpf: termoRenderizado.cliente.cpf,
      },
    });

    await garantirTermosDigitaisSchema();

    const placeholdersSnapshot = Object.fromEntries(
      termoRenderizado.draft.campos.map((campo) => [campo.key, campo.value])
    );

    await execute(
      `INSERT INTO termos_digitais (
        cliente_id,
        unidade_id,
        termo_id,
        termo_slug,
        termo_titulo,
        signatario_nome,
        signatario_cpf,
        signatario_email,
        signatario_telefone,
        placeholders_json,
        html_renderizado,
        autentique_document_id,
        autentique_signature_public_id,
        autentique_short_link,
        status,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'criado', ?)`,
      [
        termoRenderizado.cliente.id,
        ctx.unidadeId,
        termoRenderizado.termo.id,
        termoRenderizado.termo.slug,
        termoRenderizado.termo.titulo,
        termoRenderizado.cliente.nome,
        termoRenderizado.cliente.cpf,
        termoRenderizado.cliente.email,
        termoRenderizado.cliente.telefone,
        JSON.stringify(placeholdersSnapshot),
        htmlAutentique,
        created.documentId,
        created.signaturePublicId,
        created.shortLink,
        ctx.user.sub,
      ]
    );

    return NextResponse.json({
      documentoId: created.documentId,
      signaturePublicId: created.signaturePublicId,
      shortLink: created.shortLink,
      status: 'criado',
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao gerar termo no Autentique:', error);
    return NextResponse.json({
      error: error instanceof Error && error.message
        ? `Erro ao gerar termo no Autentique: ${error.message}`
        : 'Erro ao gerar termo no Autentique.',
    }, { status: 502 });
  }
});
