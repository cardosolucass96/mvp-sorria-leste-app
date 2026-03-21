/**
 * Sprint 4 — Testes de validação /api/procedimentos
 *
 * Cobre: nome obrigatório, valor negativo, comissão fora do range 0-100,
 *        edge cases de por_dente, nenhum campo no update
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
} from '../../helpers/db-mock';
import { PROC_LIMPEZA } from '../../helpers/seed';

import { POST as createProcedimento } from '@/app/api/procedimentos/route';
import { PUT as updateProcedimento } from '@/app/api/procedimentos/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Validação — POST /api/procedimentos
// =============================================================================

describe('POST /api/procedimentos — validações', () => {
  // --- Nome ---

  it('rejeita se nome não enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { valor: 100 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita nome vazio', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: '', valor: 100 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita nome apenas espaços', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: '   ', valor: 100 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  // --- Valor ---

  it('rejeita se valor não enviado (undefined)', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Valor deve ser maior ou igual a zero');
  });

  it('rejeita valor negativo', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: -1 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Valor deve ser maior ou igual a zero');
  });

  it('rejeita valor -0.01', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: -0.01 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Valor deve ser maior ou igual a zero');
  });

  it('aceita valor = 0', async () => {
    setLastInsertId(20);
    mockQueryResponse('select * from procedimentos where id', {
      id: 20, nome: 'Free', valor: 0, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Free', valor: 0 },
    });

    expect(status).toBe(201);
  });

  it('aceita valor decimal (ex: 199.99)', async () => {
    setLastInsertId(21);
    mockQueryResponse('select * from procedimentos where id', {
      id: 21, nome: 'Decimal', valor: 199.99, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Decimal', valor: 199.99 },
    });

    expect(status).toBe(201);
  });

  // --- Comissão de Venda ---

  it('rejeita comissao_venda > 100', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: 100, comissao_venda: 101 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de venda deve estar entre 0 e 100');
  });

  it('rejeita comissao_venda < 0', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: 100, comissao_venda: -1 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de venda deve estar entre 0 e 100');
  });

  it('aceita comissao_venda = 0 (limite inferior)', async () => {
    setLastInsertId(22);
    mockQueryResponse('select * from procedimentos where id', {
      id: 22, nome: 'CVenda0', valor: 100, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'CVenda0', valor: 100, comissao_venda: 0 },
    });

    expect(status).toBe(201);
  });

  it('aceita comissao_venda = 100 (limite superior)', async () => {
    setLastInsertId(23);
    mockQueryResponse('select * from procedimentos where id', {
      id: 23, nome: 'CVenda100', valor: 100, comissao_venda: 100,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'CVenda100', valor: 100, comissao_venda: 100 },
    });

    expect(status).toBe(201);
  });

  it('aceita comissao_venda decimal (ex: 12.5)', async () => {
    setLastInsertId(24);
    mockQueryResponse('select * from procedimentos where id', {
      id: 24, nome: 'CVendaDec', valor: 100, comissao_venda: 12.5,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'CVendaDec', valor: 100, comissao_venda: 12.5 },
    });

    expect(status).toBe(201);
  });

  // --- Comissão de Execução ---

  it('rejeita comissao_execucao > 100', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: 100, comissao_execucao: 150 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de execução deve estar entre 0 e 100');
  });

  it('rejeita comissao_execucao < 0', async () => {
    const { status, data } = await callRoute<{ error: string }>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Teste', valor: 100, comissao_execucao: -5 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de execução deve estar entre 0 e 100');
  });

  it('aceita comissao_execucao = 100', async () => {
    setLastInsertId(25);
    mockQueryResponse('select * from procedimentos where id', {
      id: 25, nome: 'CExec100', valor: 100, comissao_venda: 0,
      comissao_execucao: 100, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'CExec100', valor: 100, comissao_execucao: 100 },
    });

    expect(status).toBe(201);
  });

  // --- Comissão não obrigatória ---

  it('comissões não enviadas → usam default 0 (sem erro)', async () => {
    setLastInsertId(26);
    mockQueryResponse('select * from procedimentos where id', {
      id: 26, nome: 'SemComissao', valor: 100, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    });

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'SemComissao', valor: 100 },
    });

    // Não deve dar erro de validação — comissões são opcionais
    expect(status).toBe(201);
  });
});

// =============================================================================
// Validação — PUT /api/procedimentos/[id]
// =============================================================================

describe('PUT /api/procedimentos/[id] — validações', () => {
  it('rejeita nome vazio no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { nome: '' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('rejeita nome apenas espaços no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { nome: '   ' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('aceita nome undefined no update (campo não enviado)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { valor: 200 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita valor negativo no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { valor: -10 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Valor deve ser maior ou igual a zero');
  });

  it('aceita valor = 0 no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { valor: 0 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita comissao_venda > 100 no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_venda: 101 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de venda deve estar entre 0 e 100');
  });

  it('rejeita comissao_venda < 0 no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_venda: -1 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de venda deve estar entre 0 e 100');
  });

  it('rejeita comissao_execucao > 100 no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_execucao: 200 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de execução deve estar entre 0 e 100');
  });

  it('rejeita comissao_execucao < 0 no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_execucao: -0.5 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Comissão de execução deve estar entre 0 e 100');
  });

  it('rejeita body vazio (nenhum campo para atualizar)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nenhum campo para atualizar');
  });

  it('aceita comissões nos limites (0 e 100) no update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_venda: 0, comissao_execucao: 100 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('por_dente não gera erro de validação (sem range)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { por_dente: true },
    }, ctx);

    expect(status).toBe(200);
  });

  it('reativa procedimento inativo via PUT ativo=true', async () => {
    mockQueryResponse('select * from procedimentos where id', { ...PROC_LIMPEZA, ativo: 0 });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { ativo: true },
    }, ctx);

    expect(status).toBe(200);

    const { getExecutedQueries } = await import('../../helpers/db-mock');
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('ativo = ?');
    expect(updateQuery!.params).toContain(1);
  });
});
