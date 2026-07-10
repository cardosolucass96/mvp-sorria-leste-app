import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
import {
  ATENDIMENTO_AGUARDANDO_PGTO,
  ITEM_LIMPEZA_PENDENTE,
} from '../../helpers/seed';

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

import { POST as selecionarHoje } from '@/app/api/atendimentos/[id]/selecionar-hoje/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/selecionar-hoje', () => {
  it('atualiza o executor do item quando o procedimento segue para fazer_hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id, role from usuarios where id', { id: 7, role: 'executor' });
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: 7,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 0, itens_hoje: 1 });

    const queries = getExecutedQueries();
    const updateExecutorQuery = queries.find((query) => query.sql.includes('UPDATE itens_atendimento SET executor_id = ? WHERE id = ?'));

    expect(updateExecutorQuery).toBeDefined();
    expect(updateExecutorQuery?.params).toEqual([7, 1]);
  });

  it('permite definir admin como executor para o item que segue para hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id, role from usuarios where id', { id: 1, role: 'admin' });
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: 1,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateExecutorQuery = queries.find((query) => query.sql.includes('UPDATE itens_atendimento SET executor_id = ? WHERE id = ?'));

    expect(updateExecutorQuery).toBeDefined();
    expect(updateExecutorQuery?.params).toEqual([1, 1]);
  });

  it('mantem executor nulo ao gerar agendamento futuro sem executor', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'agendar',
              data_agendada: '2026-07-10',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[3]).toBeNull();
  });

  it('mantem executor nulo ao quebrar procedimento em etapas para fazer_hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, procedimento_id: 9, executor_id: 4, etapas_valores: null },
    ]);
    mockQueryResponse('select count(*) as count from procedimento_etapas_modelo where procedimento_id', { count: 1 });
    mockQueryResponse('select id, nome, valor from procedimento_etapas_modelo where procedimento_id', [
      { id: 101, nome: 'Sessão 1', valor: 150 },
    ]);
    mockQueryResponse('select coalesce(sum(pa.valor_alocado), 0) as total', { total: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: 101,
              destino_status: 'fazer_hoje',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const insertItemQuery = queries.find((query) => query.sql.includes('INSERT INTO itens_atendimento\n              (atendimento_id'));

    expect(insertItemQuery).toBeDefined();
    expect(insertItemQuery?.params[2]).toBeNull();
  });
});
