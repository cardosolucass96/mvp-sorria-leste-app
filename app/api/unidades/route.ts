import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withAuth, withRole } from '@/lib/auth/middleware';

// GET /api/unidades - Lista unidades ativas
export const GET = withAuth(async () => {
  try {
    const unidades = await query(
      'SELECT id, nome, endereco, telefone, ativo, created_at FROM unidades WHERE ativo = 1 ORDER BY id'
    );
    return NextResponse.json(unidades);
  } catch (error) {
    console.error('Erro ao buscar unidades:', error);
    return NextResponse.json({ error: 'Erro ao buscar unidades' }, { status: 500 });
  }
});

// POST /api/unidades - Criar nova unidade (admin only)
export const POST = withRole(['admin'], async (request: NextRequest) => {
  try {
    const { nome, endereco, telefone } = await request.json();

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const result = await execute(
      'INSERT INTO unidades (nome, endereco, telefone) VALUES (?, ?, ?)',
      [nome.trim(), endereco || null, telefone || null]
    );

    const nova = await queryOne(
      'SELECT id, nome, endereco, telefone, ativo, created_at FROM unidades WHERE id = ?',
      [result.lastInsertRowid]
    );

    return NextResponse.json(nova, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar unidade:', error);
    return NextResponse.json({ error: 'Erro ao criar unidade' }, { status: 500 });
  }
});
