import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface Usuario {
  id: number;
  senha: string;
}

// PUT /api/auth/senha - Alterar senha do usuário
export async function PUT(request: NextRequest) {
  try {
    const { usuario_id, senha_atual, nova_senha } = await request.json();

    // Validações
    if (!usuario_id) {
      return NextResponse.json(
        { error: 'Usuário não identificado' },
        { status: 400 }
      );
    }

    if (!senha_atual || typeof senha_atual !== 'string') {
      return NextResponse.json(
        { error: 'Senha atual é obrigatória' },
        { status: 400 }
      );
    }

    if (!nova_senha || typeof nova_senha !== 'string') {
      return NextResponse.json(
        { error: 'Nova senha é obrigatória' },
        { status: 400 }
      );
    }

    if (nova_senha.length < 6) {
      return NextResponse.json(
        { error: 'A nova senha deve ter pelo menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Buscar usuário
    const usuario = queryOne<Usuario>(
      'SELECT id, senha FROM usuarios WHERE id = ? AND ativo = 1',
      [usuario_id]
    );

    if (!usuario) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Verificar senha atual
    if (usuario.senha !== senha_atual) {
      return NextResponse.json(
        { error: 'Senha atual incorreta' },
        { status: 401 }
      );
    }

    // Atualizar senha
    execute(
      'UPDATE usuarios SET senha = ? WHERE id = ?',
      [nova_senha, usuario_id]
    );

    return NextResponse.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
