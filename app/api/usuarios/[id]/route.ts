import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { Usuario } from '@/lib/types';
import { ALL_ROLES } from '@/lib/constants/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/usuarios/[id] - Buscar usuário por ID (com suas unidades e roles)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const usuario = await queryOne<Usuario>(
      'SELECT id, nome, email, role, valor_diaria, ativo, created_at FROM usuarios WHERE id = ?',
      [id]
    );

    if (!usuario) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    const unidades = await query<{ unidade_id: number }>(
      'SELECT unidade_id FROM usuario_unidades WHERE usuario_id = ? ORDER BY unidade_id',
      [id]
    );
    const unidade_ids = unidades.map(u => u.unidade_id);

    let roles: string[] = [usuario.role];
    try {
      const rolesRows = await query<{ role: string }>(
        'SELECT role FROM usuario_roles WHERE usuario_id = ?',
        [id]
      );
      if (rolesRows.length > 0) roles = rolesRows.map(r => r.role);
    } catch {
      // tabela não existe ainda
    }

    return NextResponse.json({ ...usuario, unidade_ids, roles });
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
    const { nome, email, role, roles, role_primaria, ativo, unidade_ids, valor_diaria } = body;

    // Verifica se usuário existe
    const existing = await queryOne<Usuario>(
      'SELECT id, nome, email, role, valor_diaria, ativo, created_at FROM usuarios WHERE id = ?',
      [id]
    );

    const valorDiariaNum = valor_diaria === undefined ? undefined : Number(valor_diaria);
    if (valorDiariaNum !== undefined && (!Number.isFinite(valorDiariaNum) || valorDiariaNum < 0)) {
      return NextResponse.json({ error: 'valor_diaria deve ser um número maior ou igual a 0' }, { status: 400 });
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Resolve roles e primária quando enviados
    const rolesEfetivas: string[] | null = Array.isArray(roles) && roles.length > 0 ? roles : null;
    const primariaBody: string | null = role_primaria || role || null;

    if (rolesEfetivas) {
      for (const r of rolesEfetivas) {
        if (!ALL_ROLES.includes(r as typeof ALL_ROLES[number])) {
          return NextResponse.json({ error: `Role inválida: ${r}` }, { status: 400 });
        }
      }
      if (primariaBody && !rolesEfetivas.includes(primariaBody)) {
        return NextResponse.json({ error: 'Role primária deve estar em roles' }, { status: 400 });
      }
    } else if (role) {
      if (!ALL_ROLES.includes(role as typeof ALL_ROLES[number])) {
        return NextResponse.json({ error: 'Role inválido' }, { status: 400 });
      }
    }

    // Role primária na coluna usuarios.role (CHECK constraint antigo não permite 'ortodontista')
    const primariaParaColuna = primariaBody
      ? (primariaBody === 'ortodontista' ? 'executor' : primariaBody)
      : null;

    // Verifica duplicidade de email
    if (email && email !== existing.email) {
      const emailExists = await query<Usuario>(
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
    await execute(
      `UPDATE usuarios SET
        nome = COALESCE(?, nome),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        valor_diaria = COALESCE(?, valor_diaria),
        ativo = COALESCE(?, ativo)
      WHERE id = ?`,
      [
        nome?.trim() || null,
        email?.toLowerCase().trim() || null,
        primariaParaColuna,
        valorDiariaNum ?? null,
        ativo !== undefined ? (ativo ? 1 : 0) : null,
        id
      ]
    );

    // Atualizar unidades (se informadas)
    if (Array.isArray(unidade_ids)) {
      await execute('DELETE FROM usuario_unidades WHERE usuario_id = ?', [id]);
      for (const uid of unidade_ids) {
        await execute(
          'INSERT OR IGNORE INTO usuario_unidades (usuario_id, unidade_id) VALUES (?, ?)',
          [id, uid]
        );
      }
    }

    // Atualizar roles efetivas (M2M). Se `roles` não foi enviado, não mexe.
    if (rolesEfetivas) {
      await execute('DELETE FROM usuario_roles WHERE usuario_id = ?', [id]);
      for (const r of rolesEfetivas) {
        await execute(
          'INSERT OR IGNORE INTO usuario_roles (usuario_id, role) VALUES (?, ?)',
          [id, r]
        );
      }
    }

    const updated = await queryOne<Usuario>(
      'SELECT id, nome, email, role, valor_diaria, ativo, created_at FROM usuarios WHERE id = ?',
      [id]
    );

    // Buscar unidades atualizadas
    const unidades = await query<{ unidade_id: number }>(
      'SELECT unidade_id FROM usuario_unidades WHERE usuario_id = ? ORDER BY unidade_id',
      [id]
    );

    const rolesFinais = await query<{ role: string }>(
      'SELECT role FROM usuario_roles WHERE usuario_id = ?',
      [id]
    );

    return NextResponse.json({
      ...updated,
      unidade_ids: unidades.map(u => u.unidade_id),
      roles: rolesFinais.length > 0 ? rolesFinais.map(r => r.role) : [updated?.role || 'atendente'],
    });
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
    
    const existing = await queryOne<Usuario>(
      'SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ?',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Soft delete - apenas marca como inativo
    await execute(
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
