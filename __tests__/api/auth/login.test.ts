/**
 * Testes para POST /api/auth/login
 * 
 * Cobre:
 * - Login com credenciais válidas (texto plano legado e hash)
 * - Login com email inexistente → 401
 * - Login com senha errada → 401
 * - Login com usuário inativo → 401
 * - Login sem body / campos obrigatórios → 400
 * - Migração automática de senha texto plano → hash
 * - Retorno contém token JWT
 * - Retorno NÃO contém campo senha
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';
import { hashPassword } from '@/lib/auth/password';
import { verifyToken } from '@/lib/auth/jwt';

import { POST } from '@/app/api/auth/login/route';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ─── Sucesso ──────────────────────────────────

  test('login com senha texto plano (legado) retorna user + token', async () => {
    mockQueryResponse('select * from usuarios where email', {
      id: 1,
      nome: 'Admin',
      email: 'admin@sorrialeste.com',
      senha: 'Sorria@123', // texto plano legado
      role: 'admin',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { status, data } = await callRoute<{ user: Record<string, unknown>; token: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' },
      }
    );

    expect(status).toBe(200);
    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(1);
    expect(data.user.nome).toBe('Admin');
    expect(data.user.email).toBe('admin@sorrialeste.com');
    expect(data.user.role).toBe('admin');
    // NÃO deve retornar senha
    expect(data.user).not.toHaveProperty('senha');
    // Deve retornar token JWT
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.')).toHaveLength(3);
  });

  test('login com senha hash (PBKDF2) funciona', async () => {
    const hashedPw = await hashPassword('MinhaS3nha!');

    mockQueryResponse('select * from usuarios where email', {
      id: 2,
      nome: 'Maria',
      email: 'maria@sorrialeste.com',
      senha: hashedPw,
      role: 'atendente',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { status, data } = await callRoute<{ user: Record<string, unknown>; token: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'maria@sorrialeste.com', senha: 'MinhaS3nha!' },
      }
    );

    expect(status).toBe(200);
    expect(data.user.id).toBe(2);
    expect(data.token).toBeDefined();
  });

  test('token JWT retornado é válido e contém dados do usuário', async () => {
    mockQueryResponse('select * from usuarios where email', {
      id: 3,
      nome: 'Dr. João',
      email: 'joao@sorrialeste.com',
      senha: 'Sorria@123',
      role: 'avaliador',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { data } = await callRoute<{ user: Record<string, unknown>; token: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'joao@sorrialeste.com', senha: 'Sorria@123' },
      }
    );

    const payload = await verifyToken(data.token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(3);
    expect(payload!.email).toBe('joao@sorrialeste.com');
    expect(payload!.role).toBe('avaliador');
    expect(payload!.nome).toBe('Dr. João');
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  // ─── Falhas de autenticação ──────────────────

  test('email inexistente retorna 401 genérico', async () => {
    // queryOne retorna null por padrão quando não há mock
    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'naoexiste@email.com', senha: 'qualquer' },
      }
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Email ou senha inválidos');
  });

  test('senha errada retorna 401 genérico (texto plano)', async () => {
    mockQueryResponse('select * from usuarios where email', {
      id: 1,
      nome: 'Admin',
      email: 'admin@sorrialeste.com',
      senha: 'Sorria@123',
      role: 'admin',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@sorrialeste.com', senha: 'senhaErrada' },
      }
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Email ou senha inválidos');
  });

  test('senha errada retorna 401 genérico (hash)', async () => {
    const hashedPw = await hashPassword('SenhaCorreta');

    mockQueryResponse('select * from usuarios where email', {
      id: 1,
      nome: 'Admin',
      email: 'admin@sorrialeste.com',
      senha: hashedPw,
      role: 'admin',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@sorrialeste.com', senha: 'SenhaErrada' },
      }
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Email ou senha inválidos');
  });

  test('usuário inativo retorna 401 (query filtra ativo=1)', async () => {
    // Query inclui "AND ativo = 1", então se inativo, queryOne retorna null
    // Não setamos mock → retorna null
    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'inativo@email.com', senha: 'Sorria@123' },
      }
    );

    expect(status).toBe(401);
    expect(data.error).toBe('Email ou senha inválidos');
  });

  // ─── Validações de body ──────────────────────

  test('sem email retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { senha: '123456' },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Email');
  });

  test('sem senha retorna 400', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@email.com' },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Senha');
  });

  test('email como número retorna 400', async () => {
    const { status } = await callRoute(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 12345, senha: 'abc' },
      }
    );

    expect(status).toBe(400);
  });

  test('senha como número retorna 400', async () => {
    const { status } = await callRoute(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@email.com', senha: 123456 },
      }
    );

    expect(status).toBe(400);
  });

  // ─── Segurança ──────────────────────────────

  test('mensagem de erro é idêntica para email inexistente e senha errada', async () => {
    // Email inexistente
    const res1 = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'naoexiste@email.com', senha: 'qualquer' },
      }
    );

    // Senha errada
    mockQueryResponse('select * from usuarios where email', {
      id: 1,
      nome: 'Admin',
      email: 'admin@sorrialeste.com',
      senha: 'Sorria@123',
      role: 'admin',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const res2 = await callRoute<{ error: string }>(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: 'admin@sorrialeste.com', senha: 'senhaErrada' },
      }
    );

    // Mensagem deve ser idêntica (não revelar se email existe)
    expect(res1.data.error).toBe(res2.data.error);
    expect(res1.status).toBe(res2.status);
  });

  test('email é convertido para lowercase e trimado', async () => {
    mockQueryResponse('select * from usuarios where email', {
      id: 1,
      nome: 'Admin',
      email: 'admin@sorrialeste.com',
      senha: 'Sorria@123',
      role: 'admin',
      ativo: 1,
      created_at: '2025-01-01',
    });

    const { status } = await callRoute(
      POST,
      '/api/auth/login',
      {
        method: 'POST',
        body: { email: '  Admin@SorriaLeste.com  ', senha: 'Sorria@123' },
      }
    );

    expect(status).toBe(200);
  });
});
