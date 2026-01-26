import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { Usuario } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/usuarios/[id] - Buscar usuário por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const usuario = queryOne<Usuario>(
      'SELECT * FROM usuarios WHERE id = ?',
      [id]
    );

    if (!usuario) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(usuario);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar usuário' },
      { status: 500 }
    );
  }
}

// PUT /api/usuarios/[id] - Atualizar usuário
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nome, email, role, ativo } = body;

    // Verifica se usuário existe
    const existing = queryOne<Usuario>(
      'SELECT * FROM usuarios WHERE id = ?',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Validações
    if (role) {
      const validRoles = ['admin', 'atendente', 'avaliador', 'executor'];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Role inválido' },
          { status: 400 }
        );
      }
    }

    // Verifica duplicidade de email
    if (email && email !== existing.email) {
      const emailExists = query<Usuario>(
        'SELECT id FROM usuarios WHERE email = ? AND id != ?',
        [email.toLowerCase().trim(), id]
      );

      if (emailExists.length > 0) {
        return NextResponse.json(
          { error: 'Email já cadastrado' },
          { status: 409 }
        );
      }
    }

    // Atualiza
    execute(
      `UPDATE usuarios SET 
        nome = COALESCE(?, nome),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        ativo = COALESCE(?, ativo)
      WHERE id = ?`,
      [
        nome?.trim() || null,
        email?.toLowerCase().trim() || null,
        role || null,
        ativo !== undefined ? (ativo ? 1 : 0) : null,
        id
      ]
    );

    const updated = queryOne<Usuario>(
      'SELECT * FROM usuarios WHERE id = ?',
      [id]
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar usuário' },
      { status: 500 }
    );
  }
}

// DELETE /api/usuarios/[id] - Excluir usuário (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    const existing = queryOne<Usuario>(
      'SELECT * FROM usuarios WHERE id = ?',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Soft delete - apenas marca como inativo
    execute(
      'UPDATE usuarios SET ativo = 0 WHERE id = ?',
      [id]
    );

    return NextResponse.json({ message: 'Usuário desativado com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir usuário' },
      { status: 500 }
    );
  }
}
