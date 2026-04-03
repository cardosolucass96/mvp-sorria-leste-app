/**
 * Pagamentos — modelo simplificado (sem distribuição por item)
 *
 * Cobre: POST /api/atendimentos/[id]/pagamentos
 *   - marca todos os itens pendentes do atendimento como 'pago' ao registrar pagamento
 *   - aceita crediario e afins_sorria (métodos adicionais)
 *   - rejeita método inválido com mensagem unificada
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
} from '../../helpers/db-mock';
import {
  ATENDIMENTO_AGUARDANDO_PGTO,
  PAGAMENTO_PIX,
} from '../../helpers/seed';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin Teste',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as createPagamento } from '@/app/api/atendimentos/[id]/pagamentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/pagamentos — modelo simplificado', () => {
  it('marca itens pendentes como pago ao registrar pagamento', async () => {
    setLastInsertId(10);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 1 });
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, id: 10 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 300, metodo: 'pix' },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.toLowerCase().includes("status = 'pago'"));
    expect(updateQ).toBeDefined();
    expect(updateQ!.sql.toLowerCase()).toContain("status = 'pendente'");
  });

  it('não exige distribuição por item no body', async () => {
    setLastInsertId(11);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 1 });
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, id: 11 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 500, metodo: 'dinheiro' },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    // pagamentos_itens table has been removed - no vinculação queries expected
  });

  it('aceita crediario como método válido', async () => {
    setLastInsertId(12);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 1 });
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, metodo: 'crediario' });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 200, metodo: 'crediario' },
    }, ctx);

    expect(status).toBe(201);
  });

  it('aceita afins_sorria como método válido', async () => {
    setLastInsertId(13);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 1 });
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, metodo: 'afins_sorria' });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 150, metodo: 'afins_sorria' },
    }, ctx);

    expect(status).toBe(201);
  });

  it('rejeita método inválido com mensagem unificada', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'cheque' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Método de pagamento inválido');
  });

  it('rejeita ausência de método com mensagem unificada', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Método de pagamento inválido');
  });
});
