import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Usuario } from '@/lib/types';
import { hashPassword } from '@/lib/auth';

// GET /api/usuarios - Listar todos os usuários
export async function GET() {
  try {
    const usuarios = await query<Usuario>(
      'SELECT id, nome, email, role, ativo, created_at FROM usuarios ORDER BY nome'
    );
    return NextResponse.json(usuarios);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar usuários' },
      { status: 500 }
    );
  }
}

// POST /api/usuarios - Criar novo usuário
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, role } = body;

    // Validações
    if (!nome || !email || !role) {
      return NextResponse.json(
        { error: 'Nome, email e role são obrigatórios' },
        { status: 400 }
      );
    }

    if (typeof nome === 'string' && nome.trim() === '') {
      return NextResponse.json(
        { error: 'Nome não pode ser vazio' },
        { status: 400 }
      );
    }

    if (typeof email === 'string' && email.trim() === '') {
      return NextResponse.json(
        { error: 'Email não pode ser vazio' },
        { status: 400 }
      );
    }

    const validRoles = ['admin', 'atendente', 'avaliador', 'executor'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Role inválido' },
        { status: 400 }
      );
    }

    // Verifica se email já existe
    const existing = await query<Usuario>(
      'SELECT id FROM usuarios WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Email já cadastrado' },
        { status: 409 }
      );
    }

    // Hash da senha padrão
    const senhaHash = await hashPassword('Sorria@123');

    // Importar execute dinamicamente para evitar problemas
    const { execute } = await import('@/lib/db');
    
    const result = await execute(
      'INSERT INTO usuarios (nome, email, role, senha) VALUES (?, ?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), role, senhaHash]
    );

    const novoUsuario = await query<Usuario>(
      'SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE id = ?',
      [result.lastInsertRowid]
    );

    return NextResponse.json(novoUsuario[0], { status: 201 });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}
