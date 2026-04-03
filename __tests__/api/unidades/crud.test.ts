/**
 * Testes de CRUD de Unidades
 *
 * Cobre:
 *   GET  /api/unidades       — lista unidades ativas
 *   POST /api/unidades       — cria unidade (admin only)
 *   PUT  /api/unidades/[id]  — atualiza unidade (admin only)
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
import { UNIDADE_BARRA, UNIDADE_VILA, TODAS_UNIDADES } from '../../helpers/seed';

// Mock JWT — admin com acesso a ambas unidades
jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin Teste',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as listUnidades, POST as createUnidade } from '@/app/api/unidades/route';
import { PUT as updateUnidade } from '@/app/api/unidades/[id]/route';

const { verifyToken } = jest.requireMock('@/lib/auth/jwt');

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/unidades
// =============================================================================

describe('GET /api/unidades', () => {
  it('retorna lista de unidades ativas', async () => {
    mockQueryResponse('from unidades where ativo', TODAS_UNIDADES);

    const { status, data } = await callRoute(listUnidades, '/api/unidades');

    expect(status).toBe(200);
    expect(data).toEqual(TODAS_UNIDADES);
  });

  it('retorna lista vazia se nenhuma unidade', async () => {
    mockQueryResponse('from unidades where ativo', []);

    const { status, data } = await callRoute(listUnidades, '/api/unidades');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('rejeita sem autenticação (401)', async () => {
    verifyToken.mockResolvedValueOnce(null);

    const { status } = await callRoute(listUnidades, '/api/unidades');

    expect(status).toBe(401);
  });
});

// =============================================================================
// POST /api/unidades
// =============================================================================

describe('POST /api/unidades', () => {
  it('cria unidade com sucesso', async () => {
    setLastInsertId(3);
    const novaUnidade = { id: 3, nome: 'Messejana', endereco: 'Av Frei Cirilo', telefone: '8533001234', ativo: 1 };
    mockQueryResponse('from unidades where id', novaUnidade);

    const { status, data } = await callRoute(createUnidade, '/api/unidades', {
      method: 'POST',
      body: { nome: 'Messejana', endereco: 'Av Frei Cirilo', telefone: '8533001234' },
    });

    expect(status).toBe(201);
    expect(data).toMatchObject({ nome: 'Messejana' });

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO unidades'));
    expect(insertQ).toBeDefined();
    expect(insertQ!.params[0]).toBe('Messejana');
  });

  it('cria unidade com apenas nome (endereco e telefone opcionais)', async () => {
    setLastInsertId(4);
    mockQueryResponse('from unidades where id', { id: 4, nome: 'Centro', ativo: 1 });

    const { status, data } = await callRoute(createUnidade, '/api/unidades', {
      method: 'POST',
      body: { nome: 'Centro' },
    });

    expect(status).toBe(201);
    expect(data).toMatchObject({ nome: 'Centro' });
  });

  it('rejeita nome vazio', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUnidade, '/api/unidades', {
      method: 'POST',
      body: { nome: '' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita sem nome', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUnidade, '/api/unidades', {
      method: 'POST',
      body: { endereco: 'Rua X' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome é obrigatório');
  });

  it('rejeita se role não é admin', async () => {
    verifyToken.mockResolvedValueOnce({
      sub: 2, email: 'atendente@test.com', role: 'atendente', nome: 'Maria',
      unidade_ids: [1], unidade_atual: 1,
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const { status } = await callRoute(createUnidade, '/api/unidades', {
      method: 'POST',
      body: { nome: 'Nova Unidade' },
    });

    expect(status).toBe(403);
  });
});

// =============================================================================
// PUT /api/unidades/[id]
// =============================================================================

describe('PUT /api/unidades/[id]', () => {
  it('atualiza nome da unidade', async () => {
    mockQueryResponse('select id from unidades', { id: 1 });
    mockQueryResponse('select id, nome', { ...UNIDADE_BARRA, nome: 'Barra Atualizada' });

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(updateUnidade, '/api/unidades/1', {
      method: 'PUT',
      body: { nome: 'Barra Atualizada' },
    }, ctx);

    expect(status).toBe(200);
    expect(data).toMatchObject({ nome: 'Barra Atualizada' });
  });

  it('atualiza endereco e telefone', async () => {
    mockQueryResponse('select id from unidades', { id: 2 });
    mockQueryResponse('select id, nome', { ...UNIDADE_VILA, endereco: 'Rua Nova', telefone: '8599990000' });

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute(updateUnidade, '/api/unidades/2', {
      method: 'PUT',
      body: { endereco: 'Rua Nova', telefone: '8599990000' },
    }, ctx);

    expect(status).toBe(200);
    expect(data).toMatchObject({ endereco: 'Rua Nova', telefone: '8599990000' });
  });

  it('desativa unidade (ativo = false)', async () => {
    mockQueryResponse('select id from unidades', { id: 1 });
    mockQueryResponse('select id, nome', { ...UNIDADE_BARRA, ativo: 0 });

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(updateUnidade, '/api/unidades/1', {
      method: 'PUT',
      body: { ativo: false },
    }, ctx);

    expect(status).toBe(200);
    expect(data).toMatchObject({ ativo: 0 });
  });

  it('rejeita nome vazio', async () => {
    mockQueryResponse('select id from unidades', { id: 1 });

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateUnidade, '/api/unidades/1', {
      method: 'PUT',
      body: { nome: '' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('retorna 404 se unidade não existe', async () => {
    // Sem mock = queryOne retorna null

    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(updateUnidade, '/api/unidades/999', {
      method: 'PUT',
      body: { nome: 'Teste' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Unidade não encontrada');
  });

  it('rejeita se role não é admin', async () => {
    verifyToken.mockResolvedValueOnce({
      sub: 4, email: 'executor@test.com', role: 'executor', nome: 'Carlos',
      unidade_ids: [1], unidade_atual: 1,
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateUnidade, '/api/unidades/1', {
      method: 'PUT',
      body: { nome: 'Hack' },
    }, ctx);

    expect(status).toBe(403);
  });
});
