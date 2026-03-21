/**
 * Sprint 3 — Testes de validação /api/clientes
 *
 * Cobre: nome obrigatório, origem inválida, CPF duplicado, campos edge-case
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
} from '../../helpers/db-mock';
import { CLIENTE_BASICO } from '../../helpers/seed';

import { POST as createCliente } from '@/app/api/clientes/route';
import { PUT as updateCliente, DELETE as deleteCliente } from '@/app/api/clientes/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Validação — POST /api/clientes
// =============================================================================

describe('POST /api/clientes — validações', () => {
  it('rejeita se nome não enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { origem: 'fachada' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita se nome é string vazia', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: '', origem: 'fachada' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita se nome é apenas espaços', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: '   ', origem: 'fachada' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita se origem não enviada', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Teste' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Origem é obrigatória');
  });

  it('rejeita se origem é inválida', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Teste', origem: 'instagram' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Origem é obrigatória');
  });

  it('rejeita se origem é string vazia', async () => {
    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Teste', origem: '' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Origem é obrigatória');
  });

  it.each([
    'fachada', 'trafego_meta', 'trafego_google', 'organico', 'indicacao',
  ])('aceita origem válida: %s', async (origem) => {
    const mockCliente = { ...CLIENTE_BASICO, id: 99, origem };
    mockQueryResponse('select * from clientes where id', mockCliente);

    const { status } = await callRoute(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Teste', origem },
    });

    expect(status).toBe(201);
  });

  it('rejeita CPF duplicado', async () => {
    // Simula que o CPF já existe
    mockQueryResponse('select id from clientes where cpf', [{ id: 5 }]);

    const { status, data } = await callRoute<{ error: string }>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Teste', origem: 'fachada', cpf: '52998224725' },
    });

    expect(status).toBe(409);
    expect(data.error).toBe('CPF já cadastrado');
  });

  it('permite CPF null (não verifica duplicidade)', async () => {
    mockQueryResponse('select * from clientes where id', { ...CLIENTE_BASICO, id: 50, cpf: null });

    const { status } = await callRoute(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Sem CPF', origem: 'indicacao' },
    });

    expect(status).toBe(201);
  });
});

// =============================================================================
// Validação — PUT /api/clientes/[id]
// =============================================================================

describe('PUT /api/clientes/[id] — validações', () => {
  it('rejeita nome vazio no update', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { nome: '' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('rejeita nome apenas espaços no update', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { nome: '   ' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('permite nome undefined no update (campo não enviado)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { email: 'novo@email.com' },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita origem inválida no update', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { origem: 'twitter' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Origem é obrigatória');
  });

  it('rejeita origem vazia no update', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { origem: '' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Origem é obrigatória');
  });

  it('permite origem undefined no update (campo não enviado)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { nome: 'Novo Nome' },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita CPF duplicado no update (CPF diferente do atual)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO); // cpf = 52998224725
    mockQueryResponse('select id from clientes where cpf', [{ id: 3 }]); // CPF já existe em outro

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { cpf: '11144477735' },
    }, ctx);

    expect(status).toBe(409);
    expect(data.error).toBe('CPF já cadastrado');
  });

  it('permite manter o mesmo CPF (não verifica duplicidade)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO); // cpf = 52998224725

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { cpf: '52998224725', nome: 'Mesmo CPF' }, // mesmo CPF do existing
    }, ctx);

    expect(status).toBe(200);
  });

  it('permite CPF null no update (não verifica duplicidade)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { nome: 'Sem CPF update' },
      // cpf não enviado → undefined → falsy → skip duplicidade
    }, ctx);

    expect(status).toBe(200);
  });
});

// =============================================================================
// Validação — DELETE /api/clientes/[id]
// =============================================================================

describe('DELETE /api/clientes/[id] — validações', () => {
  it('verifica que é hard delete (não soft delete)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);
    mockQueryResponse('select count(*) as count from atendimentos', [{ count: 0 }]);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(deleteCliente, '/api/clientes/1', { method: 'DELETE' }, ctx);

    // Verifica que usou DELETE FROM (não UPDATE SET ativo=0)
    const queries = (await import('../../helpers/db-mock')).getExecutedQueries();
    const delQuery = queries.find(q => q.sql.includes('DELETE FROM clientes'));
    expect(delQuery).toBeDefined();
    // Verifica que NÃO fez soft delete
    const softQuery = queries.find(q => q.sql.includes('UPDATE clientes SET ativo'));
    expect(softQuery).toBeUndefined();
  });

  it('impede exclusão com 1 atendimento vinculado', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);
    mockQueryResponse('select count(*) as count from atendimentos', [{ count: 1 }]);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(deleteCliente, '/api/clientes/1', { method: 'DELETE' }, ctx);

    expect(status).toBe(409);
  });
});
