import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { Usuario } from '@/lib/types';
import { verifyPassword, needsMigration, hashPassword, generateToken } from '@/lib/auth';

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

    const user = await queryOne<UsuarioComSenha>(
      'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return NextResponse.json(
        { error: 'Email ou senha inválidos' },
        { status: 401 }
      );
    }

    // Verificar senha (suporta hash e texto plano legado)
    const senhaValida = await verifyPassword(senha, user.senha);
    if (!senhaValida) {
      return NextResponse.json(
        { error: 'Email ou senha inválidos' },
        { status: 401 }
      );
    }

    // Migração gradual: se a senha ainda é texto plano, fazer hash
    if (needsMigration(user.senha)) {
      const hashedPassword = await hashPassword(senha);
      await execute(
        'UPDATE usuarios SET senha = ? WHERE id = ?',
        [hashedPassword, user.id]
      );
    }

    // Gerar JWT
    const token = await generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      nome: user.nome,
    });

    // Remover senha do retorno
    const { senha: _, ...userSemSenha } = user;

    // Retornar token + user (cookie HttpOnly para segurança)
    const response = NextResponse.json({ user: userSemSenha, token });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24h
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Erro no login:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
