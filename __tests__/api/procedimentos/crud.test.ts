/**
 * Sprint 4 — Testes CRUD /api/procedimentos
 *
 * Cobre: GET (listar, buscar, filtro inativos), POST (criar),
 *        GET [id], PUT [id], DELETE [id] (soft delete)
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
  PROC_LIMPEZA,
  PROC_RESTAURACAO,
  PROC_CANAL,
  PROC_INATIVO,
  TODOS_PROCEDIMENTOS,
} from '../../helpers/seed';

import { GET as listProcedimentos, POST as createProcedimento } from '@/app/api/procedimentos/route';
import { GET as getProcedimento, PUT as updateProcedimento, DELETE as deleteProcedimento } from '@/app/api/procedimentos/[id]/route';

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/procedimentos  (listar)
// =============================================================================

describe('GET /api/procedimentos', () => {
  const PROCS_ATIVOS = TODOS_PROCEDIMENTOS.filter(p => p.ativo === 1);

  it('retorna apenas procedimentos ativos por padrão', async () => {
    mockQueryResponse('select * from procedimentos where ativo = 1', PROCS_ATIVOS);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos');

    expect(status).toBe(200);
    expect(data).toEqual(PROCS_ATIVOS);

    // Verifica que filtrou por ativo = 1
    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ativo = 1');
  });

  it('inclui inativos quando ?inativos=true', async () => {
    mockQueryResponse('select * from procedimentos', TODOS_PROCEDIMENTOS);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos', {
      searchParams: { inativos: 'true' },
    });

    expect(status).toBe(200);
    expect(data).toEqual(TODOS_PROCEDIMENTOS);

    // Verifica que NÃO filtrou por ativo
    const queries = getExecutedQueries();
    expect(queries[0].sql).not.toContain('ativo = 1');
  });

  it('não inclui inativos quando ?inativos=false', async () => {
    mockQueryResponse('select * from procedimentos where ativo = 1', PROCS_ATIVOS);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos', {
      searchParams: { inativos: 'false' },
    });

    expect(status).toBe(200);
    // Verifica que filtrou (false !== 'true')
    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ativo = 1');
  });

  it('busca por nome parcial', async () => {
    mockQueryResponse('nome like', [PROC_LIMPEZA]);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos', {
      searchParams: { busca: 'Limpeza' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([PROC_LIMPEZA]);

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('nome LIKE ?');
    expect(queries[0].params).toContain('%Limpeza%');
  });

  it('busca + filtro de ativos combinados', async () => {
    mockQueryResponse('nome like', [PROC_RESTAURACAO]);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos', {
      searchParams: { busca: 'Restauração' },
    });

    expect(status).toBe(200);

    // Deve ter AMBAS as condições: nome LIKE e ativo = 1
    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('nome LIKE ?');
    expect(queries[0].sql).toContain('ativo = 1');
    expect(queries[0].sql).toContain('AND');
  });

  it('busca + inclui inativos', async () => {
    mockQueryResponse('nome like', [PROC_INATIVO]);

    const { status } = await callRoute(listProcedimentos, '/api/procedimentos', {
      searchParams: { busca: 'Antigo', inativos: 'true' },
    });

    expect(status).toBe(200);

    // Deve ter nome LIKE mas NÃO ativo = 1
    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('nome LIKE ?');
    expect(queries[0].sql).not.toContain('ativo = 1');
  });

  it('retorna lista vazia quando sem resultados', async () => {
    mockQueryResponse('select * from procedimentos', []);

    const { status, data } = await callRoute(listProcedimentos, '/api/procedimentos');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('ordena por nome ASC', async () => {
    mockQueryResponse('select * from procedimentos', PROCS_ATIVOS);

    await callRoute(listProcedimentos, '/api/procedimentos');

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY nome ASC');
  });
});

// =============================================================================
// POST /api/procedimentos  (criar)
// =============================================================================

describe('POST /api/procedimentos', () => {
  it('cria procedimento com dados mínimos (nome + valor)', async () => {
    setLastInsertId(10);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 10,
      nome: 'Clareamento',
      descricao: null,
      valor: 500,
      comissao_venda: 0,
      comissao_execucao: 0,
      por_dente: 0,
      ativo: 1,
      created_at: '2025-03-20 10:00:00',
    }]);

    const { status, data } = await callRoute<Record<string, unknown>>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Clareamento', valor: 500 },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(10);
    expect(data.nome).toBe('Clareamento');
    expect(data.valor).toBe(500);
  });

  it('cria procedimento com todos os campos', async () => {
    setLastInsertId(11);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 11,
      nome: 'Coroa',
      descricao: null,
      valor: 1200,
      comissao_venda: 15,
      comissao_execucao: 30,
      por_dente: 1,
      ativo: 1,
      created_at: '2025-03-20',
    }]);

    const { status, data } = await callRoute<Record<string, unknown>>(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: {
        nome: 'Coroa',
        valor: 1200,
        comissao_venda: 15,
        comissao_execucao: 30,
        por_dente: true,
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(11);
  });

  it('trim no nome', async () => {
    setLastInsertId(12);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 12, nome: 'Trimmed', valor: 100, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: '  Trimmed  ', valor: 100 },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO procedimentos'));
    expect(insertQuery!.params[0]).toBe('Trimmed');
  });

  it('comissão default é 0 quando não enviada', async () => {
    setLastInsertId(13);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 13, nome: 'Default', valor: 100, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Default', valor: 100 },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO procedimentos'));
    expect(insertQuery!.params[2]).toBe(0); // comissao_venda
    expect(insertQuery!.params[3]).toBe(0); // comissao_execucao
  });

  it('por_dente boolean → inteiro (true → 1, false/undefined → 0)', async () => {
    setLastInsertId(14);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 14, nome: 'PorDente', valor: 200, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 1, ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'PorDente', valor: 200, por_dente: true },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO procedimentos'));
    expect(insertQuery!.params[4]).toBe(1); // por_dente

    // Reset para testar false
    resetMockDb();
    setLastInsertId(15);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 15, nome: 'NaoPorDente', valor: 200, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'NaoPorDente', valor: 200, por_dente: false },
    });

    const queries2 = getExecutedQueries();
    const insertQuery2 = queries2.find(q => q.sql.includes('INSERT INTO procedimentos'));
    expect(insertQuery2!.params[4]).toBe(0);
  });

  it('permite valor = 0', async () => {
    setLastInsertId(16);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 16, nome: 'Gratis', valor: 0, comissao_venda: 0,
      comissao_execucao: 0, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    }]);

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Gratis', valor: 0 },
    });

    expect(status).toBe(201);
  });

  it('permite comissão = 0 e comissão = 100 (limites)', async () => {
    setLastInsertId(17);
    mockQueryResponse('select * from procedimentos where id', [{
      id: 17, nome: 'Limites', valor: 100, comissao_venda: 0,
      comissao_execucao: 100, por_dente: 0, ativo: 1, created_at: '2025-03-20',
    }]);

    const { status } = await callRoute(createProcedimento, '/api/procedimentos', {
      method: 'POST',
      body: { nome: 'Limites', valor: 100, comissao_venda: 0, comissao_execucao: 100 },
    });

    expect(status).toBe(201);
  });
});

// =============================================================================
// GET /api/procedimentos/[id]  (buscar por ID)
// =============================================================================

describe('GET /api/procedimentos/[id]', () => {
  it('retorna procedimento pelo ID', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(getProcedimento, '/api/procedimentos/1', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(PROC_LIMPEZA);
  });

  it('retorna 404 se não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(getProcedimento, '/api/procedimentos/999', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Procedimento não encontrado');
  });

  it('retorna procedimento inativo pelo ID (sem filtro de ativo)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_INATIVO);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<Record<string, unknown>>(getProcedimento, '/api/procedimentos/4', {}, ctx);

    expect(status).toBe(200);
    expect(data.ativo).toBe(0);
  });

  it('converte ID para int (parseInt)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(getProcedimento, '/api/procedimentos/2', {}, ctx);

    const queries = getExecutedQueries();
    expect(queries[0].params[0]).toBe(2); // int, não string '2'
  });
});

// =============================================================================
// PUT /api/procedimentos/[id]  (atualizar)
// =============================================================================

describe('PUT /api/procedimentos/[id]', () => {
  it('atualiza nome do procedimento', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { nome: 'Limpeza Completa' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.sql).toContain('nome = ?');
    expect(updateQuery!.params).toContain('Limpeza Completa');
  });

  it('atualiza valor', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { valor: 250 },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('valor = ?');
    expect(updateQuery!.params).toContain(250);
  });

  it('atualiza comissões', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { comissao_venda: 20, comissao_execucao: 35 },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('comissao_venda = ?');
    expect(updateQuery!.sql).toContain('comissao_execucao = ?');
    expect(updateQuery!.params).toContain(20);
    expect(updateQuery!.params).toContain(35);
  });

  it('atualiza por_dente (boolean → int)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { por_dente: true },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('por_dente = ?');
    expect(updateQuery!.params).toContain(1);
  });

  it('ativa/desativa via PUT (ativo boolean → int)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { ativo: false },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('ativo = ?');
    expect(updateQuery!.params).toContain(0);
  });

  it('retorna 404 se procedimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/999', {
      method: 'PUT',
      body: { nome: 'Nao Existe' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Procedimento não encontrado');
  });

  it('retorna 400 se nenhum campo enviado para atualizar', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nenhum campo para atualizar');
  });

  it('atualização parcial — só inclui campos enviados na query', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { nome: 'Só nome' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.sql).toContain('nome = ?');
    expect(updateQuery!.sql).not.toContain('valor = ?');
    expect(updateQuery!.sql).not.toContain('comissao_venda = ?');
    expect(updateQuery!.sql).not.toContain('comissao_execucao = ?');
  });

  it('atualiza múltiplos campos de uma vez', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(updateProcedimento, '/api/procedimentos/2', {
      method: 'PUT',
      body: {
        nome: 'Restauração Premium',
        valor: 350,
        comissao_venda: 20,
        comissao_execucao: 40,
        por_dente: false,
      },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    // Todos os campos presentes
    expect(updateQuery!.sql).toContain('nome = ?');
    expect(updateQuery!.sql).toContain('valor = ?');
    expect(updateQuery!.sql).toContain('comissao_venda = ?');
    expect(updateQuery!.sql).toContain('comissao_execucao = ?');
    expect(updateQuery!.sql).toContain('por_dente = ?');
  });

  it('trim no nome durante update', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateProcedimento, '/api/procedimentos/1', {
      method: 'PUT',
      body: { nome: '  Limpeza Trimmed  ' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos'));
    expect(updateQuery!.params[0]).toBe('Limpeza Trimmed');
  });
});

// =============================================================================
// DELETE /api/procedimentos/[id]  (soft delete)
// =============================================================================

describe('DELETE /api/procedimentos/[id]', () => {
  it('soft delete — marca como inativo (ativo=0)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ message: string }>(deleteProcedimento, '/api/procedimentos/1', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(200);
    expect(data.message).toBe('Procedimento desativado com sucesso');

    // Verifica UPDATE ativo=0, não DELETE FROM
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE procedimentos SET ativo = 0'));
    expect(updateQuery).toBeDefined();
    const deleteQuery = queries.find(q => q.sql.includes('DELETE FROM procedimentos'));
    expect(deleteQuery).toBeUndefined();
  });

  it('retorna 404 se procedimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(deleteProcedimento, '/api/procedimentos/999', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Procedimento não encontrado');
  });

  it('permite desativar procedimento já inativo (idempotente)', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_INATIVO);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(deleteProcedimento, '/api/procedimentos/4', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(200);
  });

  it('converte ID para int', async () => {
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(deleteProcedimento, '/api/procedimentos/1', { method: 'DELETE' }, ctx);

    const queries = getExecutedQueries();
    // Tanto o SELECT quanto o UPDATE devem usar parseInt
    queries.forEach(q => {
      if (q.params.length > 0) {
        const idParam = q.params[q.params.length - 1];
        expect(typeof idParam).toBe('number');
      }
    });
  });
});
