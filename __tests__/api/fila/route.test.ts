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
  verifyToken: jest.fn().mockResolvedValue({
    sub: 4,
    email: 'executor@test.com',
    role: 'executor',
    nome: 'Executor Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as getFila } from '@/app/api/fila/[slug]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/fila/[slug]', () => {
  it('consulta somente atendimentos em_execucao na fila', async () => {
    mockQueryResponse('select * from categorias where slug', {
      id: 10,
      nome: 'Clínico Geral',
      slug: 'clinico-geral',
      cor: '#000000',
      icone: 'activity',
      ativo: 1,
    });
    mockQueryResponse('select role from categoria_roles where categoria_id', [{ role: 'executor' }]);
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ slug: 'clinico-geral' });
    const { status } = await callRoute(
      getFila,
      '/api/fila/clinico-geral',
      { searchParams: { executor_id: '4' } },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const filaQuery = queries.find(q => q.sql.includes('FROM itens_atendimento i'));
    expect(filaQuery).toBeDefined();
    expect(filaQuery!.sql).toContain("a.status = 'em_execucao'");
    expect(filaQuery!.sql).toContain("i.status IN ('pago', 'executando')");
  });
});
