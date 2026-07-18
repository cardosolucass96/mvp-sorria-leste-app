import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { garantirTermosDigitaisSchema } from '@/lib/helpers/garantirTermosDigitaisSchema';
import { Cliente, TermoDigital } from '@/lib/types';

export const GET = withAuth(async (_request: NextRequest, ctx) => {
  try {
    const { id } = await (ctx.params as Promise<{ id: string }>);

    const cliente = await queryOne<Cliente>(
      'SELECT id FROM clientes WHERE id = ?',
      [id]
    );

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    await garantirTermosDigitaisSchema();

    const termosDigitais = await query<TermoDigital>(
      `SELECT
        id,
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
        pdf_assinado_url,
        viewed_at,
        signed_at,
        rejected_at,
        finished_at,
        created_by,
        created_at,
        updated_at
       FROM termos_digitais
       WHERE cliente_id = ?
       ORDER BY created_at DESC, id DESC`,
      [id]
    );

    return NextResponse.json(termosDigitais);
  } catch (error) {
    console.error('Erro ao listar termos digitais do cliente:', error);
    return NextResponse.json({ error: 'Erro ao buscar termos digitais' }, { status: 500 });
  }
});
