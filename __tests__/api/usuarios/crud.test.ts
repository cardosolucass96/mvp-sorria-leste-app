/**
 * Sprint 3 — Testes CRUD /api/usuarios
 *
 * Cobre: GET (listar), POST (criar), GET [id], PUT [id], DELETE [id] (soft delete)
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
  USUARIO_ADMIN,
  USUARIO_ATENDENTE,
  USUARIO_AVALIADOR,
  USUARIO_EXECUTOR,
  USUARIO_INATIVO,
  TODOS_USUARIOS,
} from '../../helpers/seed';

// Importar handlers
import { GET as listUsuarios, POST as createUsuario } from '@/app/api/usuarios/route';
import { GET as getUsuario, PUT as updateUsuario, DELETE as deleteUsuario } from '@/app/api/usuarios/[id]/route';

// Mock hashPassword para evitar crypto real nos testes
jest.mock('@/lib/auth', () => ({
  hashPassword: jest.fn().mockResolvedValue('pbkdf2:100000:mocksalt:mockhash'),
}));

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/usuarios  (listar)
// =============================================================================

describe('GET /api/usuarios', () => {
  // Usuarios em GET list nunca retornam senha (SELECT exclui coluna)
  const usuariosSemSenha = TODOS_USUARIOS.map(u => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ...rest } = u;
    return rest;
  });

  it('retorna lista de usuários ordenados por nome', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios order by nome', usuariosSemSenha);

    const { status, data } = await callRoute(listUsuarios, '/api/usuarios');

    expect(status).toBe(200);
    expect(data).toEqual(usuariosSemSenha);
  });

  it('retorna lista vazia quando não há usuários', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios order by nome', []);

    const { status, data } = await callRoute(listUsuarios, '/api/usuarios');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('nunca retorna campo senha na listagem', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios', usuariosSemSenha);

    const { status, data } = await callRoute<Record<string, unknown>[]>(listUsuarios, '/api/usuarios');

    expect(status).toBe(200);
    // Verifica a query SQL — não deve conter "senha"
    const queries = getExecutedQueries();
    const selectQuery = queries[0];
    expect(selectQuery.sql).not.toContain('senha');
    expect(selectQuery.sql).not.toContain('SELECT *');
  });
});

// =============================================================================
// POST /api/usuarios  (criar)
// =============================================================================

describe('POST /api/usuarios', () => {
  it('cria usuário com dados válidos', async () => {
    setLastInsertId(10);
    // Email não duplicado
    mockQueryResponse('select id from usuarios where email', []);
    // Retorno pós-INSERT
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 10,
      nome: 'Novo Usuário',
      email: 'novo@sorrialeste.com',
      role: 'atendente',
      ativo: 1,
      created_at: '2025-03-20 10:00:00',
    }]);

    const { status, data } = await callRoute<Record<string, unknown>>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Novo Usuário', email: 'novo@sorrialeste.com', role: 'atendente' },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(10);
    expect(data.nome).toBe('Novo Usuário');
    expect(data.role).toBe('atendente');
  });

  it('hasheia a senha padrão (Sorria@123) no INSERT', async () => {
    setLastInsertId(11);
    mockQueryResponse('select id from usuarios where email', []);
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 11, nome: 'Hash User', email: 'hash@test.com', role: 'executor', ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Hash User', email: 'hash@test.com', role: 'executor' },
    });

    // Verifica que a senha foi hasheada no INSERT
    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO usuarios'));
    expect(insertQuery).toBeDefined();
    // O 4o parâmetro (senha) deve ser o hash, não "Sorria@123"
    expect(insertQuery!.params[3]).toBe('pbkdf2:100000:mocksalt:mockhash');
    expect(insertQuery!.params[3]).not.toBe('Sorria@123');
  });

  it('lowercase e trim no email', async () => {
    setLastInsertId(12);
    mockQueryResponse('select id from usuarios where email', []);
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 12, nome: 'Email Test', email: 'upper@test.com', role: 'admin', ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'Email Test', email: '  UPPER@Test.COM  ', role: 'admin' },
    });

    const queries = getExecutedQueries();
    // Verifica na query de verificação de duplicidade
    const checkQuery = queries.find(q => q.sql.includes('SELECT id FROM usuarios WHERE email'));
    expect(checkQuery!.params[0]).toBe('upper@test.com');
    // Verifica no INSERT
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO usuarios'));
    expect(insertQuery!.params[1]).toBe('upper@test.com');
  });

  it('trim no nome', async () => {
    setLastInsertId(13);
    mockQueryResponse('select id from usuarios where email', []);
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 13, nome: 'Trimmed', email: 'trim@test.com', role: 'avaliador', ativo: 1, created_at: '2025-03-20',
    }]);

    await callRoute(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: '  Trimmed  ', email: 'trim@test.com', role: 'avaliador' },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO usuarios'));
    expect(insertQuery!.params[0]).toBe('Trimmed');
  });

  it('nunca retorna campo senha no response', async () => {
    setLastInsertId(14);
    mockQueryResponse('select id from usuarios where email', []);
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', [{
      id: 14, nome: 'No Senha', email: 'nossh@test.com', role: 'atendente', ativo: 1, created_at: '2025-03-20',
    }]);

    const { data } = await callRoute<Record<string, unknown>>(createUsuario, '/api/usuarios', {
      method: 'POST',
      body: { nome: 'No Senha', email: 'nossh@test.com', role: 'atendente' },
    });

    expect(data).not.toHaveProperty('senha');
  });
});

// =============================================================================
// GET /api/usuarios/[id]  (buscar por ID)
// =============================================================================

describe('GET /api/usuarios/[id]', () => {
  it('retorna usuário pelo ID', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ADMIN);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(getUsuario, '/api/usuarios/1', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(USUARIO_ADMIN);
  });

  it('retorna 404 se usuário não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(getUsuario, '/api/usuarios/999', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Usuário não encontrado');
  });

  it('retorna usuário inativo normalmente (sem filtro)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_INATIVO);

    const ctx = createRouteContext({ id: '5' });
    const { status, data } = await callRoute<Record<string, unknown>>(getUsuario, '/api/usuarios/5', {}, ctx);

    expect(status).toBe(200);
    expect(data.ativo).toBe(0);
  });

  it('nunca retorna campo senha no GET por ID', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ADMIN);

    const ctx = createRouteContext({ id: '1' });
    const { data } = await callRoute<Record<string, unknown>>(getUsuario, '/api/usuarios/1', {}, ctx);

    // A query seleciona colunas específicas (sem senha)
    const queries = getExecutedQueries();
    expect(queries[0].sql).not.toContain('senha');
    expect(queries[0].sql).not.toContain('SELECT *');
  });
});

// =============================================================================
// PUT /api/usuarios/[id]  (atualizar)
// =============================================================================

describe('PUT /api/usuarios/[id]', () => {
  it('atualiza nome do usuário', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { nome: 'Maria Atualizada' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.params).toContain('Maria Atualizada');
  });

  it('atualiza role do usuário', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { role: 'avaliador' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    expect(updateQuery!.params).toContain('avaliador');
  });

  it('desativa usuário (ativo = false → 0)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_EXECUTOR);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/4', {
      method: 'PUT',
      body: { ativo: false },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    // ativo deve ser 0 (não false)
    expect(updateQuery!.params).toContain(0);
  });

  it('reativa usuário (ativo = true → 1)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_INATIVO);

    const ctx = createRouteContext({ id: '5' });
    const { status } = await callRoute(updateUsuario, '/api/usuarios/5', {
      method: 'PUT',
      body: { ativo: true },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    expect(updateQuery!.params).toContain(1);
  });

  it('retorna 404 se usuário não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(updateUsuario, '/api/usuarios/999', {
      method: 'PUT',
      body: { nome: 'Nao Existe' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Usuário não encontrado');
  });

  it('atualização parcial — não altera campos não enviados (COALESCE)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_AVALIADOR);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(updateUsuario, '/api/usuarios/3', {
      method: 'PUT',
      body: { nome: 'Novo Nome' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    // email, role, ativo devem ser null → COALESCE mantém valor original
    expect(updateQuery!.params[1]).toBeNull(); // email
    expect(updateQuery!.params[2]).toBeNull(); // role
    expect(updateQuery!.params[3]).toBeNull(); // ativo
  });

  it('trim e lowercase no email durante update', async () => {
    mockQueryResponse('select id, nome, email, role, ativo, created_at from usuarios where id', USUARIO_ATENDENTE);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(updateUsuario, '/api/usuarios/2', {
      method: 'PUT',
      body: { email: '  NOVO@Email.COM  ' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios'));
    expect(updateQuery!.params[1]).toBe('novo@email.com');
  });
});

// =============================================================================
// DELETE /api/usuarios/[id]  (soft delete)
// =============================================================================

describe('DELETE /api/usuarios/[id]', () => {
  it('soft delete — marca como inativo (não exclui do banco)', async () => {
    mockQueryResponse('select id, nome, email, role, ativo from usuarios where id', USUARIO_EXECUTOR);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ message: string }>(deleteUsuario, '/api/usuarios/4', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(200);
    expect(data.message).toBe('Usuário desativado com sucesso');

    // Verifica que usou UPDATE (soft delete), não DELETE
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE usuarios SET ativo = 0'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.params).toContain('4');

    // Verifica que NÃO usou DELETE FROM
    const deleteQuery = queries.find(q => q.sql.includes('DELETE FROM usuarios'));
    expect(deleteQuery).toBeUndefined();
  });

  it('retorna 404 se usuário não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(deleteUsuario, '/api/usuarios/999', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Usuário não encontrado');
  });
});
