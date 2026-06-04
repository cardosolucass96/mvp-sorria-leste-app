import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { Usuario } from '@/lib/types';
import { hashPassword } from '@/lib/auth';
import { ALL_ROLES } from '@/lib/constants/roles';

// GET /api/usuarios - Listar todos os usuários (com suas unidades e roles)
// Params: ?unidade_id=X | ?categoria_id=X | ?role=X (filtra por roles válidas p/ a categoria ou pela role exata)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeId = searchParams.get('unidade_id');
    const categoriaId = searchParams.get('categoria_id');
    const role = searchParams.get('role');

    let usuarios: (Usuario & { unidade_ids?: number[]; roles?: string[] })[];

    if (categoriaId || role || unidadeId) {
      const joins = new Set<string>();
      const conditions: string[] = [];
      const params: Array<string | number> = [];

      if (categoriaId || role) {
        joins.add('JOIN usuario_roles ur ON ur.usuario_id = u.id');
      }
      if (categoriaId) {
        joins.add('JOIN categoria_roles cr ON cr.role = ur.role');
        conditions.push('cr.categoria_id = ?');
        params.push(parseInt(categoriaId));
      }
      if (role) {
        conditions.push('ur.role = ?');
        params.push(role);
      }
      if (unidadeId) {
        joins.add('INNER JOIN usuario_unidades uu ON uu.usuario_id = u.id');
        conditions.push('uu.unidade_id = ?');
        params.push(parseInt(unidadeId));
      }
      if (categoriaId || role) {
        conditions.push('u.ativo = 1');
      }

      usuarios = await query<Usuario>(
        `SELECT DISTINCT u.id, u.nome, u.email, u.role, u.ativo, u.created_at
           FROM usuarios u
           ${Array.from(joins).join('\n')}
           ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
          ORDER BY u.nome`,
        params
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

    // Buscar roles de cada usuário (fallback graceful se tabela não existir ainda)
    const rolesMap = new Map<number, string[]>();
    try {
      const rolesRows = await query<{ usuario_id: number; role: string }>(
        'SELECT usuario_id, role FROM usuario_roles'
      );
      for (const row of rolesRows) {
        if (!rolesMap.has(row.usuario_id)) rolesMap.set(row.usuario_id, []);
        rolesMap.get(row.usuario_id)!.push(row.role);
      }
    } catch {
      // tabela ainda não migrada
    }

    const result = usuarios.map(u => ({
      ...u,
      unidade_ids: unidadesMap.get(u.id) || [],
      roles: rolesMap.get(u.id) || [u.role],
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
    const { nome, email, role, roles, role_primaria, unidade_ids } = body;

    // Resolve roles efetivas e role primária (compatibilidade com clientes antigos que só mandavam `role`).
    const rolesEfetivas: string[] = Array.isArray(roles) && roles.length > 0 ? roles : (role ? [role] : []);
    const primaria: string = role_primaria || role || rolesEfetivas[0];

    // Validações
    if (!nome || !email || rolesEfetivas.length === 0) {
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

    for (const r of rolesEfetivas) {
      if (!ALL_ROLES.includes(r as typeof ALL_ROLES[number])) {
        return NextResponse.json({ error: `Role inválida: ${r}` }, { status: 400 });
      }
    }
    if (!rolesEfetivas.includes(primaria)) {
      return NextResponse.json({ error: 'Role primária deve estar em roles' }, { status: 400 });
    }

    // Para o CHECK constraint de usuarios.role (que não inclui 'ortodontista'), armazenamos a primária
    // convertendo 'ortodontista' → 'executor' (role primária de display sem afetar autorização).
    const primariaParaColuna = primaria === 'ortodontista' ? 'executor' : primaria;

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
      [nome.trim(), email.toLowerCase().trim(), primariaParaColuna, senhaHash]
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

    // Atribuir todas as roles efetivas (M2M)
    for (const r of rolesEfetivas) {
      await execute(
        'INSERT OR IGNORE INTO usuario_roles (usuario_id, role) VALUES (?, ?)',
        [userId, r]
      );
    }

    const novoUsuario = await query<Usuario>(
      'SELECT id, nome, email, role, ativo, created_at FROM usuarios WHERE id = ?',
      [userId]
    );

    return NextResponse.json({
      ...novoUsuario[0],
      unidade_ids: idsToAssign,
      roles: rolesEfetivas,
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao criar usuário' },
      { status: 500 }
    );
  }
}
