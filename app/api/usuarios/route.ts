import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { Usuario } from '@/lib/types';
import { hashPassword } from '@/lib/auth';

// GET /api/usuarios - Listar todos os usuários (com suas unidades)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeId = searchParams.get('unidade_id');

    let usuarios: (Usuario & { unidade_ids?: number[] })[];

    if (unidadeId) {
      // Filtrar por unidade específica
      usuarios = await query<Usuario>(
        `SELECT DISTINCT u.id, u.nome, u.email, u.role, u.ativo, u.created_at
         FROM usuarios u
         INNER JOIN usuario_unidades uu ON uu.usuario_id = u.id
         WHERE uu.unidade_id = ?
         ORDER BY u.nome`,
        [parseInt(unidadeId)]
      );
    } else {
      usuarios = await query<Usuario>(
        'SELECT id, nome, email, role, ativo, created_at FROM usuarios ORDER BY nome'
      );
    }

    // Buscar unidades de cada usuário
    const unidadesMap = new Map<number, number[]>();
    const unidadesRows = await query<{ usuario_id: number; unidade_id: number }>(
      'SELECT usuario_id, unidade_id FROM usuario_unidades ORDER BY unidade_id'
    );
    for (const row of unidadesRows) {
      if (!unidadesMap.has(row.usuario_id)) {
        unidadesMap.set(row.usuario_id, []);
      }
      unidadesMap.get(row.usuario_id)!.push(row.unidade_id);
    }

    const result = usuarios.map(u => ({
      ...u,
      unidade_ids: unidadesMap.get(u.id) || [],
    }));

    return NextResponse.json(result);
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
    const { nome, email, role, unidade_ids } = body;

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

    const result = await execute(
      'INSERT INTO usuarios (nome, email, role, senha) VALUES (?, ?, ?, ?)',
      [nome.trim(), email.toLowerCase().trim(), role, senhaHash]
    );

    const userId = result.lastInsertRowid as number;

    // Atribuir unidades (se informadas, senão atribui a unidade 1)
    const idsToAssign = Array.isArray(unidade_ids) && unidade_ids.length > 0 ? unidade_ids : [1];
    for (const uid of idsToAssign) {
      await execute(
        'INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id) VALUES (?, ?)',
        [userId, uid]
      );
    }

    const novoUsuario = await query<Usuario>(
      'SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE id = ?',
      [userId]
    );

    return NextResponse.json({ ...novoUsuario[0], unidade_ids: idsToAssign }, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}
