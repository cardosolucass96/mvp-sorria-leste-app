import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setLastInsertId,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 2,
    email: 'atendente@test.com',
    role: 'atendente',
    nome: 'Atendente Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as gerarAgendamento } from '@/app/api/atendimentos/[id]/gerar-agendamento/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/gerar-agendamento', () => {
  it('converte data_agendada da clínica para UTC antes de inserir', async () => {
    mockQueryResponse(
      'select id, cliente_id, unidade_id, status from atendimentos',
      { id: 3, cliente_id: 10, unidade_id: 1, status: 'em_execucao' }
    );
    mockQueryResponse('select id from procedimentos where id', { id: 7 });
    setLastInsertId(99);
    mockQueryResponse('from agendamentos a', {
      id: 99,
      cliente_id: 10,
      atendimento_origem_id: 3,
      procedimento_id: 7,
      executor_id: null,
      data_agendada: '2099-07-20T18:30:00.000Z',
      status: 'agendado',
      observacoes: null,
      unidade_id: 1,
      cliente_nome: 'Maria',
      cliente_telefone: '85999999999',
      procedimento_nome: 'Limpeza',
      executor_nome: null,
      dias_desde_criacao: 0,
    });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      gerarAgendamento,
      '/api/atendimentos/3/gerar-agendamento',
      {
        method: 'POST',
        body: {
          procedimento_id: 7,
          data_agendada: '2099-07-20T15:30',
        },
      },
      ctx
    );

    expect(status).toBe(201);

    const insertQuery = getExecutedQueries().find((query) => query.sql.includes('INSERT INTO agendamentos'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.params[5]).toBe('2099-07-20T18:30:00.000Z');
    expect(insertQuery?.params[6]).toBe('agendado');
  });

  it('rejeita data_agendada no passado', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      gerarAgendamento,
      '/api/atendimentos/3/gerar-agendamento',
      {
        method: 'POST',
        body: {
          procedimento_id: 7,
          data_agendada: '2000-01-01T09:00',
        },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('passado');
    expect(getExecutedQueries()).toEqual([]);
  });
});
