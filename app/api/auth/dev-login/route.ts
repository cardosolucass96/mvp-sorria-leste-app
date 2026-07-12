import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import { Usuario, UserRole } from '@/lib/types';

interface UsuarioComSenha extends Usuario {
  senha: string;
}

const QUICK_LOGIN_ROLES = new Set<UserRole>(['admin', 'atendente', 'avaliador', 'executor']);

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const { role } = await request.json() as { role?: UserRole };
  if (!role || !QUICK_LOGIN_ROLES.has(role)) {
    return NextResponse.json({ error: 'Role inválida para acesso rápido' }, { status: 400 });
  }

  const user = await queryOne<UsuarioComSenha>(
    `SELECT *
     FROM usuarios
     WHERE role = ? AND ativo = 1
     ORDER BY id ASC
     LIMIT 1`,
    [role]
  );

  if (!user) {
    return NextResponse.json({ error: `Nenhum usuário ativo com role principal ${role}` }, { status: 404 });
  }

  let unidadeIds: number[] = [1];
  let unidadeAtual = 1;
  try {
    const unidades = await query<{ unidade_id: number }>(
      `SELECT uu.unidade_id
       FROM usuario_unidades uu
       JOIN unidades u ON u.id = uu.unidade_id
       WHERE uu.usuario_id = ? AND u.ativo = 1
       ORDER BY uu.unidade_id ASC`,
      [user.id]
    );
    if (unidades.length > 0) {
      unidadeIds = unidades.map((u) => u.unidade_id);
      unidadeAtual = unidadeIds[0];
    }
  } catch {
    // Banco de desenvolvimento pode estar parcialmente migrado.
  }

  // Acesso rápido deve representar o botão clicado. Mesmo que o usuário real
  // tenha roles extras, no dev usamos apenas a role principal escolhida.
  const roles: string[] = [user.role];

  const token = await generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    roles,
    nome: user.nome,
    unidade_ids: unidadeIds,
    unidade_atual: unidadeAtual,
  });

  const { senha: senhaRemovida, ...userSemSenha } = user;
  void senhaRemovida;
  const userComUnidades = {
    ...userSemSenha,
    roles,
    unidade_ids: unidadeIds,
    unidade_atual: unidadeAtual,
  };

  const response = NextResponse.json({ user: userComUnidades, token });
  response.cookies.set('auth-token', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: '/',
  });

  return response;
}
