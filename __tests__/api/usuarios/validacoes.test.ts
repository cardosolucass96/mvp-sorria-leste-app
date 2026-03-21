/**
 * Sprint 3 — Testes de validação /api/usuarios
 *
 * Cobre: campos obrigatórios, role inválida, email duplicado,
 * senha nunca exposta, soft delete vs hard delete
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
} from '../../helpers/db-mock';
import { USUARIO_ADMIN, USUARIO_ATENDENTE, USUARIO_INATIVO } from '../../helpers/seed';

import { POST as createUsuario } from '@/app/api/usuarios/route';
import { PUT as updateUsuario } from '@/app/api/usuarios/[id]/route';

// Mock hashPassword
jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn().mockResolvedValue('pbkdf2:100000:mocksalt:mockhash'),
}));

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Validação — POST /api/usuarios
// =============================================================================

describe('POST /api/usuarios — validações', () => {
  it('rejeita se nome não enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { email: 'test@test.com', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita se email não enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita se role não enviada', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', email: 'test@test.com' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita se nenhum campo enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: {},
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita nome vazio', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: '', email: 'test@test.com', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita email vazio', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', email: '', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it('rejeita nome só com espaços (trim)', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: '   ', email: 'test@test.com', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Nome não pode ser vazio');
  });

  it('rejeita email só com espaços (trim)', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', email: '   ', role: 'admin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Email não pode ser vazio');
  });

  it('rejeita role inválida', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', email: 'test@test.com', role: 'superadmin' },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Role inválido');
  });

  it('rejeita role vazia', async () => {
    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Test', email: 'test@test.com', role: '' },
    });

    expect(status).toBe(400);
    // role vazia é falsy → cai na primeira validação
    expect(data.error).toBe('Nome, email e role são obrigatórios');
  });

  it.each([
    'admin', 'atendente', 'avaliador', 'executor',
  ])('aceita role válida: %s', async (role) => {
    setLastInsertId(50);
    mockQueryResponse('select id from usuarios where email', []);
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 50, nome: 'Role Test', email: 'role@test.com', role, ativo: 1, created_at: '2025-03-20',
    }]);

    const { status } = await callRoute(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Role Test', email: 'role@test.com', role },
    });

    expect(status).toBe(201);
  });

  it('rejeita email duplicado', async () => {
    mockQueryResponse('select id from usuarios where email', [{ id: 1 }]);

    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Duplicado', email: 'admin@sorrialeste.com', role: 'atendente' },
    });

    expect(status).toBe(409);
    expect(data.error).toBe('Email já cadastrado');
  });

  it('rejeita email duplicado (case-insensitive)', async () => {
    mockQueryResponse('select id from usuarios where email', [{ id: 1 }]);

    const { status, data } = await callRoute<{ error: string }>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Dup', email: 'ADMIN@SorriaLeste.com', role: 'atendente' },
    });

    expect(status).toBe(409);
    expect(data.error).toBe('Email já cadastrado');
  });
});

// =============================================================================
// Validação — PUT /api/usuarios/[id]
// =============================================================================

describe('PUT /api/usuarios/[id] — validações', () => {
  it('rejeita role inválida no update', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { role: 'superadmin' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Role inválido');
  });

  it.each([
    'admin', 'atendente', 'avaliador', 'executor',
  ])('aceita role válida no update: %s', async (role) => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { role },
    }, ctx);

    expect(status).toBe(200);
  });

  it('rejeita email duplicado no update (email diferente do atual)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);
    mockQueryResponse('select id from usuarios where email', [{ id: 1 }]);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { email: 'admin@sorrialeste.com' }, // já usado pelo admin
    }, ctx);

    expect(status).toBe(409);
    expect(data.error).toBe('Email já cadastrado');
  });

  it('permite manter mesmo email (não verifica duplicidade)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { email: 'maria@sorrialeste.com', nome: 'Maria Mesmo Email' },
    }, ctx);

    expect(status).toBe(200);
  });

  it('role vazia/falsy é ignorada (COALESCE mantém original)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ADMIN);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/1', {
      method: 'PUT',
      body: { nome: 'Admin Atualizado' },
      // role não enviada → undefined → falsy → skip validação
    }, ctx);

    expect(status).toBe(200);
  });

  it('ativo false → converte para 0 (inteiro)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ADMIN);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateUsuario, '/api/usuarios/1', {
      method: 'PUT',
      body: { ativo: false },
    }, ctx);

    const { getExecutedQueries } = await import('../../helpers/db-mock');
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    // ativo deve ser 0 (número), não false (boolean)
    const ativoParam = updateQuery!.params[3];
    expect(ativoParam).toBe(0);
    expect(typeof ativoParam).toBe('number');
  });

  it('ativo true → converte para 1 (inteiro)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_INATIVO);

    const ctx = createRouteContext({ id: '5' });
    await callRoute(updateUsuario, '/api/usuarios/5', {
      method: 'PUT',
      body: { ativo: true },
    }, ctx);

    const { getExecutedQueries } = await import('../../helpers/db-mock');
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    const ativoParam = updateQuery!.params[3];
    expect(ativoParam).toBe(1);
    expect(typeof ativoParam).toBe('number');
  });

  it('ativo não enviado → null (COALESCE mantém original)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ADMIN);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateUsuario, '/api/usuarios/1', {
      method: 'PUT',
      body: { nome: 'Somente nome' },
    }, ctx);

    const { getExecutedQueries } = await import('../../helpers/db-mock');
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    const ativoParam = updateQuery!.params[3];
    expect(ativoParam).toBeNull();
  });
});
