type UsuarioComRolesBasico = {
  role: string;
  roles?: string[];
  ativo?: number | null;
};

const ROLES_PROFISSIONAL_AGENDA = new Set(['avaliador', 'executor', 'ortodontista']);
const ROLES_EXECUCAO = new Set(['executor', 'ortodontista']);

export function getUsuarioRoles(usuario: UsuarioComRolesBasico): string[] {
  return Array.isArray(usuario.roles) && usuario.roles.length > 0
    ? usuario.roles
    : [usuario.role];
}

export function isProfissionalAgenda(usuario: UsuarioComRolesBasico): boolean {
  if (usuario.ativo === 0) return false;

  const roles = getUsuarioRoles(usuario);
  return roles.includes('admin') || roles.some((role) => ROLES_PROFISSIONAL_AGENDA.has(role));
}

export function isExecutorDisponivel(usuario: UsuarioComRolesBasico): boolean {
  if (usuario.ativo === 0) return false;

  const roles = getUsuarioRoles(usuario);
  return roles.includes('admin') || roles.some((role) => ROLES_EXECUCAO.has(role));
}
