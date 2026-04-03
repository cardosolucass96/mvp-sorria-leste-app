/**
 * Sprint 6 — Testes de pagamentos (CRUD + validações)
 *
 * Cobre: GET /api/atendimentos/[id]/pagamentos
 *        POST /api/atendimentos/[id]/pagamentos
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
  ATENDIMENTO_EM_EXECUCAO,
  ATENDIMENTO_TRIAGEM,
  ATENDIMENTO_AVALIACAO,
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

import { GET as listPagamentos, POST as createPagamento } from '@/app/api/atendimentos/[id]/pagamentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/atendimentos/[id]/pagamentos
// =============================================================================

describe('GET /api/atendimentos/[id]/pagamentos', () => {
  it('retorna lista de pagamentos com recebido_por_nome', async () => {
    const pagamentos = [
      { ...PAGAMENTO_PIX, recebido_por_nome: 'Maria Atendente' },
    ];
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from pagamentos p', pagamentos);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listPagamentos, '/api/atendimentos/3/pagamentos', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(pagamentos);
  });

  it('ordena por created_at DESC', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from pagamentos p', []);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(listPagamentos, '/api/atendimentos/3/pagamentos', {}, ctx);

    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM pagamentos'));
    expect(selectQ!.sql).toContain('ORDER BY p.created_at DESC');
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(listPagamentos, '/api/atendimentos/999/pagamentos', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('retorna lista vazia se sem pagamentos', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from pagamentos p', []);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listPagamentos, '/api/atendimentos/3/pagamentos', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });
});

// =============================================================================
// POST /api/atendimentos/[id]/pagamentos
// =============================================================================

describe('POST /api/atendimentos/[id]/pagamentos', () => {
  const baseBody = {
    valor: 400,
    metodo: 'pix',
  };

  it('cria pagamento com sucesso em aguardando_pagamento', async () => {
    setLastInsertId(1);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX, id: 1 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(201);
    expect(data.metodo).toBe('pix');
  });

  it('cria pagamento com sucesso em em_execucao', async () => {
    setLastInsertId(2);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX, id: 2 });

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/4/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(201);
  });

  it('rejeita pagamento em triagem', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/1/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Não é possível registrar pagamento neste status');
  });

  it('rejeita pagamento em avaliação', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AVALIACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/2/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita pagamento em finalizado', async () => {
    mockQueryResponse('from atendimentos where id',{ ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' });

    const ctx = createRouteContext({ id: '5' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/5/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita valor zero', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 0, metodo: 'pix' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Valor do pagamento é obrigatório e deve ser maior que zero');
  });

  it('rejeita valor negativo', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: -100, metodo: 'pix' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita sem valor', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { metodo: 'pix' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita sem método de pagamento', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Método de pagamento inválido');
  });

  it('rejeita método de pagamento inválido', async () => {
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'bitcoin' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Método de pagamento inválido');
  });

  it('aceita dinheiro como método', async () => {
    setLastInsertId(3);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX, metodo: 'dinheiro' });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'dinheiro' },
    }, ctx);

    expect(status).toBe(201);
  });

  it('aceita cartao_debito como método', async () => {
    setLastInsertId(4);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX, metodo: 'cartao_debito' });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'cartao_debito' },
    }, ctx);

    expect(status).toBe(201);
  });

  it('aceita cartao_credito como método', async () => {
    setLastInsertId(5);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX, metodo: 'cartao_credito' });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'cartao_credito' },
    }, ctx);

    expect(status).toBe(201);
  });

  it('salva observações quando fornecidas', async () => {
    setLastInsertId(7);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX });

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'pix', observacoes: 'Pagamento parcial' },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO pagamentos'));
    expect(insertQ!.params[4]).toBe('Pagamento parcial');
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/999/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    expect(status).toBe(404);
  });

  it('recebido_por_id usa o usuário logado (context.user.sub)', async () => {
    setLastInsertId(8);
    mockQueryResponse('from atendimentos where id',ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from pagamentos where id', { ...PAGAMENTO_PIX });

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: baseBody,
    }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO pagamentos'));
    // recebido_por_id vem do context.user.sub (JWT mock retorna sub=1)
    expect(insertQ!.params[1]).toBe(1);
  });
});
