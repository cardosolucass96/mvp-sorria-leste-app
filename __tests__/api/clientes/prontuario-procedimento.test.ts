import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn(),
}));

import { verifyToken } from '@/lib/auth/jwt';
import {
  GET as getProntuario,
  POST as saveProntuario,
} from '@/app/api/clientes/[id]/procedimentos/[itemId]/prontuario/route';

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;

function makePayload(role: 'admin' | 'atendente' | 'executor' = 'admin') {
  return {
    sub: 8,
    email: `${role}@test.com`,
    role,
    roles: [role],
    nome: role === 'admin' ? 'Admin' : 'Atendente',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
}

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  mockVerifyToken.mockResolvedValue(makePayload());
  mockQueryResponse('from itens_atendimento i', {
    id: 3,
    atendimento_id: 20,
    unidade_id: 1,
  });
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('prontuário do procedimento na ficha do cliente', () => {
  it('permite que administrador crie prontuário para o procedimento', async () => {
    const { status, data } = await callRoute<{ success: boolean; message: string }>(
      saveProntuario,
      '/api/clientes/10/procedimentos/3/prontuario',
      {
        method: 'POST',
        body: {
          descricao: 'Procedimento registrado pela ficha do cliente com sucesso.',
          observacoes: 'Orientado retorno conforme necessidade.',
        },
      },
      createRouteContext({ id: '10', itemId: '3' })
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Prontuário criado');
    expect(getExecutedQueries().some((query) => query.sql.includes('INSERT INTO prontuarios'))).toBe(true);
  });

  it('permite que atendente edite evolução compartilhada', async () => {
    mockVerifyToken.mockResolvedValue(makePayload('atendente'));
    mockQueryResponse('from prontuario_evolucao_itens pei', {
      id: 40,
      legacy_prontuario_id: null,
    });

    const { status, data } = await callRoute<{ success: boolean; message: string }>(
      saveProntuario,
      '/api/clientes/10/procedimentos/3/prontuario',
      {
        method: 'POST',
        body: { descricao: 'Evolução compartilhada atualizada pela atendente.' },
      },
      createRouteContext({ id: '10', itemId: '3' })
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Prontuário atualizado');
    expect(getExecutedQueries().some((query) => query.sql.includes('UPDATE prontuario_evolucoes'))).toBe(true);
  });

  it('bloqueia perfis que não são admin ou atendente', async () => {
    mockVerifyToken.mockResolvedValue(makePayload('executor'));

    const { status } = await callRoute(
      getProntuario,
      '/api/clientes/10/procedimentos/3/prontuario',
      {},
      createRouteContext({ id: '10', itemId: '3' })
    );

    expect(status).toBe(403);
  });
});
