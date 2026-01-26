import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Usuario } from '@/lib/types';

// GET /api/usuarios - Listar todos os usuários
export async function GET() {
  try {
    const usuarios = query<Usuario>(
      'SELECT * FROM usuarios ORDER BY nome'
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

    const validRoles = ['admin', 'atendente', 'avaliador', 'executor'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Role inválido' },
        { status: 400 }
      );
    }

    // Verifica se email já existe
    const existing = query<Usuario>(
      'SELECT id FROM usuarios WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Email já cadastrado' },
        { status: 409 }
      );
    }

    // Importar execute dinamicamente para evitar problemas
    const { execute } = await import('@/lib/db');
    
    const result = execute(
      'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), role]
    );

    const novoUsuario = query<Usuario>(
      'SELECT * FROM usuarios WHERE id = ?',
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
