/**
 * Testes para PUT /api/auth/senha
 * 
 * Cobre:
 * - Troca de senha com credenciais válidas
 * - Troca de senha com texto plano legado
 * - Troca de senha com hash existente
 * - Senha atual incorreta → 401
 * - Nova senha < 6 caracteres → 400
 * - Campos obrigatórios ausentes → 400
 * - Usuário não encontrado → 404
 * - Nova senha é salva como hash (não texto plano)
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';
import { hashPassword } from '@/lib/auth/password';

import { PUT } from '@/app/api/auth/senha/route';

describe('PUT /api/auth/senha', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ─── Sucesso ──────────────────────────────────

  test('troca senha com senha atual em texto plano (legado)', async () => {
    mockQueryResponse('select id, senha from usuarios', {
      id: 1,
      senha: 'Sorria@123',
    });

    const { status, data } = await callRoute<{ success: boolean; message: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'Sorria@123',
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('alterada');
  });

  test('troca senha com senha atual em hash', async () => {
    const currentHash = await hashPassword('SenhaAtual123');

    mockQueryResponse('select id, senha from usuarios', {
      id: 2,
      senha: currentHash,
    });

    const { status, data } = await callRoute<{ success: boolean }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 2,
          senha_atual: 'SenhaAtual123',
          nova_senha: 'NovaSenha789',
        },
      }
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('nova senha é salva como hash (não texto plano)', async () => {
    mockQueryResponse('select id, senha from usuarios', {
      id: 1,
      senha: 'Sorria@123',
    });

    await callRoute(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'Sorria@123',
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    // Verificar que o UPDATE foi chamado com hash
    const queries = getExecutedQueries();
    const updateQuery = queries.find((q) => q.sql.toLowerCase().includes('update'));
    expect(updateQuery).toBeDefined();
    // O primeiro parâmetro do UPDATE é a nova senha hashada
    expect(updateQuery!.params[0]).toMatch(/^pbkdf2:/);
  });

  // ─── Falhas ──────────────────────────────────

  test('senha atual incorreta retorna 401', async () => {
    mockQueryResponse('select id, senha from usuarios', {
      id: 1,
      senha: 'Sorria@123',
    });

    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'SenhaErrada',
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    expect(status).toBe(401);
    expect(data.error).toContain('incorreta');
  });

  test('nova senha < 6 caracteres retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'Sorria@123',
          nova_senha: '12345',
        },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('6 caracteres');
  });

  test('usuário não encontrado retorna 404', async () => {
    // Sem mock → queryOne retorna null
    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 999,
          senha_atual: 'Sorria@123',
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    expect(status).toBe(404);
    expect(data.error).toContain('não encontrado');
  });

  // ─── Validações de campos obrigatórios ──────────────

  test('sem usuario_id retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          senha_atual: 'Sorria@123',
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Usuário');
  });

  test('sem senha_atual retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          nova_senha: 'NovaSenha@456',
        },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Senha atual');
  });

  test('sem nova_senha retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'Sorria@123',
        },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Nova senha');
  });

  test('senha_atual como número retorna 400', async () => {
    const { status } = await callRoute(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 123456,
          nova_senha: 'NovaSenha',
        },
      }
    );

    expect(status).toBe(400);
  });

  test('nova_senha como número retorna 400', async () => {
    const { status } = await callRoute(
      PUT,
      '/api/auth/senha',
      {
        method: 'PUT',
        body: {
          usuario_id: 1,
          senha_atual: 'Sorria@123',
          nova_senha: 123456,
        },
      }
    );

    expect(status).toBe(400);
  });
});
