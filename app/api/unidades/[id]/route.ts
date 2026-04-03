import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withRole } from '@/lib/auth/middleware';

// PUT /api/unidades/[id] - Atualizar unidade (admin only)
export const PUT = withRole(['admin'], async (request: NextRequest, context) => {
  try {
    const { id } = await context.params!;
    const unidadeId = parseInt(id as string);
    const { nome, endereco, telefone, ativo } = await request.json();

    const existing = await queryOne(
      'SELECT id FROM unidades WHERE id = ?',
      [unidadeId]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 });
    }

    if (nome !== undefined && (!nome || typeof nome !== 'string' || nome.trim().length === 0)) {
      return NextResponse.json({ error: 'Nome não pode ser vazio' }, { status: 400 });
    }

    await execute(
      `UPDATE unidades SET
        nome = COALESCE(?, nome),
        endereco = COALESCE(?, endereco),
        telefone = COALESCE(?, telefone),
        ativo = COALESCE(?, ativo)
      WHERE id = ?`,
      [
        nome?.trim() || null,
        endereco !== undefined ? (endereco || null) : null,
        telefone !== undefined ? (telefone || null) : null,
        ativo !== undefined ? (ativo ? 1 : 0) : null,
        unidadeId,
      ]
    );

    const updated = await queryOne(
      'SELECT id, nome, endereco, telefone, ativo, created_at FROM unidades WHERE id = ?',
      [unidadeId]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar unidade:', error);
    return NextResponse.json({ error: 'Erro ao atualizar unidade' }, { status: 500 });
  }
});
