import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { Usuario } from '@/lib/types';

interface UsuarioComSenha extends Usuario {
  senha: string;
}

export async function POST(request: NextRequest) {
  try {
    const { email, senha } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    if (!senha || typeof senha !== 'string') {
      return NextResponse.json(
        { error: 'Senha é obrigatória' },
        { status: 400 }
      );
    }

    const user = queryOne<UsuarioComSenha>(
      'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return NextResponse.json(
        { error: 'Email ou senha inválidos' },
        { status: 401 }
      );
    }

    // Verificar senha (comparação simples)
    if (user.senha !== senha) {
      return NextResponse.json(
        { error: 'Email ou senha inválidos' },
        { status: 401 }
      );
    }

    // Remover senha do retorno
    const { senha: _, ...userSemSenha } = user;

    return NextResponse.json({ user: userSemSenha });
  } catch (error) {
    console.error('Erro no login:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
