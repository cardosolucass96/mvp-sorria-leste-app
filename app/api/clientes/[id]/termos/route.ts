import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { TermoTemplate, Cliente } from '@/lib/types';
import { garantirTermosSchema } from '@/lib/helpers/garantirTermosSchema';

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

    await garantirTermosSchema();

    const termos = await query<TermoTemplate>(
      'SELECT id, slug, titulo, permite_autentique FROM termos WHERE ativo = 1 ORDER BY titulo ASC',
      []
    );

    return NextResponse.json(termos);
  } catch (error) {
    console.error('Erro ao buscar termos do cliente:', error);
    return NextResponse.json({ error: 'Erro ao buscar termos' }, { status: 500 });
  }
});
