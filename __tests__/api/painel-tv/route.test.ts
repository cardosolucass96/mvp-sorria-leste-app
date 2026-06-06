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
    sub: 2,
    email: 'atendente@test.com',
    role: 'atendente',
    roles: ['atendente'],
    nome: 'Atendente Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as getPainelTv } from '@/app/api/painel-tv/[slug]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/painel-tv/[slug]', () => {
  it('retorna a fila agrupada por paciente para o atendente', async () => {
    mockQueryResponse('select * from categorias where slug', {
      id: 7,
      nome: 'Clínico Geral',
      slug: 'clinico-geral',
      cor: '#000000',
      icone: 'activity',
      ativo: 1,
    });
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 10,
        atendimento_id: 100,
        cliente_id: 20,
        cliente_nome: 'Ana Souza',
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        executor_id: null,
        executor_nome: null,
        status: 'pago',
        entrou_na_fila_em: '2026-06-04T09:00:00.000Z',
      },
      {
        item_id: 11,
        atendimento_id: 100,
        cliente_id: 20,
        cliente_nome: 'Ana Souza',
        procedimento_nome: 'Restauração',
        etapa_label: 'Sessão 1',
        executor_id: 8,
        executor_nome: 'Dr. Pedro',
        status: 'executando',
        entrou_na_fila_em: '2026-06-04T09:05:00.000Z',
      },
    ]);

    const ctx = createRouteContext({ slug: 'clinico-geral' });
    const { status, data } = await callRoute(
      getPainelTv,
      '/api/painel-tv/clinico-geral',
      {},
      ctx
    );

    expect(status).toBe(200);
    expect(data).toMatchObject({
      categoria: { slug: 'clinico-geral' },
      pacientes: [
        {
          atendimento_id: 100,
          cliente_nome: 'Ana Souza',
          doutores: ['Dr. Pedro'],
          quantidade_procedimentos: 2,
          possui_procedimento_em_execucao: true,
        },
      ],
    });

    const queries = getExecutedQueries();
    const filaQuery = queries.find(q => q.sql.includes('FROM itens_atendimento i'));
    expect(filaQuery).toBeDefined();
    expect(filaQuery!.sql).toContain("a.status = 'em_execucao'");
    expect(filaQuery!.sql).toContain("i.status IN ('pago', 'executando')");
  });
});
