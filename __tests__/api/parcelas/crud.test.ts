/**
 * Sprint 6 — Testes de parcelas (CRUD)
 *
 * Cobre: GET  /api/atendimentos/[id]/parcelas
 *        POST /api/atendimentos/[id]/parcelas
 *        PUT  /api/atendimentos/[id]/parcelas  (marcar como paga)
 *        DELETE /api/atendimentos/[id]/parcelas
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
  PARCELA_PENDENTE,
  PARCELA_PAGA,
} from '../../helpers/seed';

import {
  GET as listParcelas,
  POST as createParcela,
  PUT as updateParcela,
  DELETE as deleteParcela,
} from '@/app/api/atendimentos/[id]/parcelas/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/atendimentos/[id]/parcelas
// =============================================================================

describe('GET /api/atendimentos/[id]/parcelas', () => {
  it('retorna lista de parcelas ordenadas por número', async () => {
    const parcelas = [
      { ...PARCELA_PENDENTE, numero: 1 },
      { ...PARCELA_PAGA, numero: 2 },
    ];
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from parcelas', parcelas);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listParcelas, '/api/atendimentos/3/parcelas', {}, ctx);

    expect(status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].numero).toBe(1);
  });

  it('retorna lista vazia', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from parcelas', []);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listParcelas, '/api/atendimentos/3/parcelas', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status } = await callRoute(listParcelas, '/api/atendimentos/999/parcelas', {}, ctx);

    expect(status).toBe(404);
  });

  it('ordena por numero ASC', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from parcelas', []);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(listParcelas, '/api/atendimentos/3/parcelas', {}, ctx);

    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM parcelas'));
    expect(selectQ!.sql).toContain('ORDER BY numero ASC');
  });
});

// =============================================================================
// POST /api/atendimentos/[id]/parcelas
// =============================================================================

describe('POST /api/atendimentos/[id]/parcelas', () => {
  it('cria parcela com número auto-incrementado', async () => {
    setLastInsertId(4);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select max(numero)', { max_numero: 2 });
    mockQueryResponse('select * from parcelas where id', { ...PARCELA_PENDENTE, id: 4, numero: 3 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: 150, data_vencimento: '2025-04-01' },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO parcelas'));
    expect(insertQ!.params[1]).toBe(3); // numero = max(2) + 1
  });

  it('primeira parcela recebe número 1', async () => {
    setLastInsertId(1);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select max(numero)', { max_numero: null }); // nenhuma parcela ainda
    mockQueryResponse('select * from parcelas where id', { ...PARCELA_PENDENTE, id: 1, numero: 1 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: 100, data_vencimento: '2025-03-01' },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO parcelas'));
    expect(insertQ!.params[1]).toBe(1); // (null || 0) + 1 = 1
  });

  it('rejeita sem valor', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { data_vencimento: '2025-04-01' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Valor da parcela é obrigatório e deve ser maior que zero');
  });

  it('rejeita valor zero', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: 0, data_vencimento: '2025-04-01' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita valor negativo', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: -50, data_vencimento: '2025-04-01' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita sem data de vencimento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Data de vencimento é obrigatória');
  });

  it('salva observações', async () => {
    setLastInsertId(5);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select max(numero)', { max_numero: 0 });
    mockQueryResponse('select * from parcelas where id', PARCELA_PENDENTE);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createParcela, '/api/atendimentos/3/parcelas', {
      method: 'POST',
      body: { valor: 100, data_vencimento: '2025-04-01', observacoes: 'Parcela final' },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO parcelas'));
    expect(insertQ!.params[4]).toBe('Parcela final');
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status } = await callRoute(createParcela, '/api/atendimentos/999/parcelas', {
      method: 'POST',
      body: { valor: 100, data_vencimento: '2025-04-01' },
    }, ctx);

    expect(status).toBe(404);
  });
});

// =============================================================================
// PUT /api/atendimentos/[id]/parcelas  (marcar como paga)
// =============================================================================

describe('PUT /api/atendimentos/[id]/parcelas', () => {
  it('marca parcela como paga', async () => {
    mockQueryResponse('select * from parcelas where id', PARCELA_PENDENTE);
    mockQueryResponse('select * from parcelas where id', { ...PARCELA_PENDENTE, pago: 1, pagamento_id: 10 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(updateParcela, '/api/atendimentos/3/parcelas', {
      method: 'PUT',
      body: { parcela_id: 1, pagamento_id: 10 },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.includes('UPDATE parcelas SET pago = 1'));
    expect(updateQ).toBeDefined();
    expect(updateQ!.params[0]).toBe(10); // pagamento_id
    expect(updateQ!.params[1]).toBe(1); // parcela_id
  });

  it('marca parcela como paga sem pagamento_id', async () => {
    mockQueryResponse('select * from parcelas where id', PARCELA_PENDENTE);
    mockQueryResponse('select * from parcelas where id', { ...PARCELA_PENDENTE, pago: 1, pagamento_id: null });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(updateParcela, '/api/atendimentos/3/parcelas', {
      method: 'PUT',
      body: { parcela_id: 1 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita sem parcela_id', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(updateParcela, '/api/atendimentos/3/parcelas', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('ID da parcela é obrigatório');
  });

  it('retorna 404 se parcela não encontrada', async () => {
    // parcela não mockada → queryOne retorna null

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(updateParcela, '/api/atendimentos/3/parcelas', {
      method: 'PUT',
      body: { parcela_id: 999 },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Parcela não encontrada');
  });
});

// =============================================================================
// DELETE /api/atendimentos/[id]/parcelas
// =============================================================================

describe('DELETE /api/atendimentos/[id]/parcelas', () => {
  it('remove parcela pendente', async () => {
    mockQueryResponse('select * from parcelas where id', PARCELA_PENDENTE);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ message: string }>(deleteParcela, '/api/atendimentos/3/parcelas', {
      method: 'DELETE',
      searchParams: { parcela_id: '1' },
    }, ctx);

    expect(status).toBe(200);
    expect(data.message).toBe('Parcela removida com sucesso');

    const queries = getExecutedQueries();
    const deleteQ = queries.find(q => q.sql.includes('DELETE FROM parcelas'));
    expect(deleteQ).toBeDefined();
  });

  it('bloqueia remoção de parcela já paga', async () => {
    mockQueryResponse('select * from parcelas where id', PARCELA_PAGA);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(deleteParcela, '/api/atendimentos/3/parcelas', {
      method: 'DELETE',
      searchParams: { parcela_id: '2' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Não é possível remover parcela já paga');
  });

  it('rejeita sem parcela_id', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(deleteParcela, '/api/atendimentos/3/parcelas', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('ID da parcela é obrigatório');
  });

  it('retorna 404 se parcela não encontrada', async () => {
    // parcela não mockada

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(deleteParcela, '/api/atendimentos/3/parcelas', {
      method: 'DELETE',
      searchParams: { parcela_id: '999' },
    }, ctx);

    expect(status).toBe(404);
  });
});
