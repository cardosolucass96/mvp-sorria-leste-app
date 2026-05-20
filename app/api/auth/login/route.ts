import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
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

    // Buscar unidades do usuário (graceful fallback se migração não rodou ainda)
    let unidadeIds: number[] = [1];
    let unidadeAtual = 1;
    try {
      const unidades = await query<{ unidade_id: number }>(
        `SELECT uu.unidade_id FROM usuario_unidades uu
         JOIN unidades u ON u.id = uu.unidade_id
         WHERE uu.usuario_id = ? AND u.ativo = 1
         ORDER BY uu.unidade_id ASC`,
        [user.id]
      );
      if (unidades.length > 0) {
        unidadeIds = unidades.map(u => u.unidade_id);
        unidadeAtual = unidadeIds[0];
      }
    } catch {
      // Tabelas de unidade ainda não existem — usar padrão
    }

    // Buscar roles efetivas do usuário (M2M). Fallback: [user.role] se tabela ainda não existe.
    let roles: string[] = [user.role];
    try {
      const rolesRows = await query<{ role: string }>(
        'SELECT role FROM usuario_roles WHERE usuario_id = ?',
        [user.id]
      );
      if (rolesRows.length > 0) {
        roles = rolesRows.map(r => r.role);
      }
    } catch {
      // Tabela usuario_roles ainda não existe — usar [role] primária
    }

    // Gerar JWT
    const token = await generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      roles,
      nome: user.nome,
      unidade_ids: unidadeIds,
      unidade_atual: unidadeAtual,
    });

    // Remover senha do retorno
    const { senha: _, ...userSemSenha } = user;
    const userComUnidades = {
      ...userSemSenha,
      roles,
      unidade_ids: unidadeIds,
      unidade_atual: unidadeAtual,
    };

    // Retornar token + user (cookie HttpOnly para segurança)
    const response = NextResponse.json({ user: userComUnidades, token });
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
