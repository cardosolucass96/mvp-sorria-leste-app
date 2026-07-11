import {
  getUsuarioRoles,
  isExecutorDisponivel,
  isProfissionalAgenda,
} from '@/lib/utils/usuariosProfissionais';

describe('usuariosProfissionais utils', () => {
  test('usa roles secundarias quando elas existem', () => {
    expect(
      getUsuarioRoles({
        role: 'atendente',
        roles: ['atendente', 'ortodontista'],
        ativo: 1,
      })
    ).toEqual(['atendente', 'ortodontista']);
  });

  test('remove executor inativo da lista de pagamento', () => {
    expect(
      isExecutorDisponivel({
        role: 'executor',
        roles: ['executor'],
        ativo: 0,
      })
    ).toBe(false);
  });

  test('permite executor por role secundaria no pagamento', () => {
    expect(
      isExecutorDisponivel({
        role: 'atendente',
        roles: ['atendente', 'ortodontista'],
        ativo: 1,
      })
    ).toBe(true);
  });

  test('mantem admin como profissional valido na agenda', () => {
    expect(
      isProfissionalAgenda({
        role: 'admin',
        roles: ['admin'],
        ativo: 1,
      })
    ).toBe(true);
  });
});
