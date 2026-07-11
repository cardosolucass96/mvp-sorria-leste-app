import { query, queryOne } from '@/lib/db';

export type UsuarioRoleValidationResult = 'not_found' | 'ok' | 'invalid';

interface ValidationOptions {
  allowAdmin?: boolean;
}

export async function carregarRolesUsuarioAtivo(usuarioId: number): Promise<string[] | null> {
  const usuario = await queryOne<{ id: number; role: string }>(
    'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
    [usuarioId]
  );

  if (!usuario) return null;

  let roles = [usuario.role];

  try {
    const rolesRows = await query<{ role: string }>(
      'SELECT role FROM usuario_roles WHERE usuario_id = ?',
      [usuarioId]
    );

    if (rolesRows.length > 0) {
      roles = Array.from(new Set([usuario.role, ...rolesRows.map((row) => row.role)]));
    }
  } catch {
    // Tabela usuario_roles ainda não existe — usa role primária.
  }

  return roles;
}

export async function validarUsuarioPorRoles(
  usuarioId: number,
  rolesFallback: string[],
  categoriaId: number | null = null,
  options: ValidationOptions = {}
): Promise<UsuarioRoleValidationResult> {
  const roles = await carregarRolesUsuarioAtivo(usuarioId);
  if (!roles) return 'not_found';

  if (options.allowAdmin && roles.includes('admin')) {
    return 'ok';
  }

  if (categoriaId) {
    try {
      const categoriaRoles = await query<{ role: string }>(
        'SELECT role FROM categoria_roles WHERE categoria_id = ?',
        [categoriaId]
      );
      const allowedRoles = categoriaRoles.map((row) => row.role);

      if (allowedRoles.length > 0) {
        return roles.some((role) => allowedRoles.includes(role)) ? 'ok' : 'invalid';
      }
    } catch {
      // Tabela categoria_roles ainda não existe — usa fallback.
    }
  }

  return roles.some((role) => rolesFallback.includes(role)) ? 'ok' : 'invalid';
}
