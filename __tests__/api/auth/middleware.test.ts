/**
 * Testes para o módulo de autenticação:
 * - password.ts (hash + verify)
 * - jwt.ts (generate + verify + extract)
 * - middleware.ts (withAuth + withRole)
 */

import { NextRequest, NextResponse } from 'next/server';

import { hashPassword, verifyPassword, needsMigration } from '@/lib/auth/password';
import { generateToken, verifyToken, extractToken } from '@/lib/auth/jwt';
import { withAuth, withRole, AuthenticatedContext } from '@/lib/auth/middleware';

// ===========================================================
// Password Hashing (PBKDF2)
// ===========================================================

describe('hashPassword / verifyPassword', () => {
  test('hash produz formato pbkdf2:iterations:salt:hash', async () => {
    const hash = await hashPassword('teste123');
    expect(hash).toMatch(/^pbkdf2:\d+:[a-f0-9]+:[a-f0-9]+$/);
  });

  test('hash é diferente para cada chamada (salt aleatório)', async () => {
    const hash1 = await hashPassword('mesmasenha');
    const hash2 = await hashPassword('mesmasenha');
    expect(hash1).not.toBe(hash2);
  });

  test('verifyPassword confirma senha correta (hash)', async () => {
    const hash = await hashPassword('MinhaS3nha!');
    const result = await verifyPassword('MinhaS3nha!', hash);
    expect(result).toBe(true);
  });

  test('verifyPassword rejeita senha incorreta (hash)', async () => {
    const hash = await hashPassword('MinhaS3nha!');
    const result = await verifyPassword('SenhaErrada', hash);
    expect(result).toBe(false);
  });

  test('verifyPassword funciona com texto plano legado', async () => {
    const result = await verifyPassword('Sorria@123', 'Sorria@123');
    expect(result).toBe(true);
  });

  test('verifyPassword rejeita texto plano incorreto', async () => {
    const result = await verifyPassword('SenhaErrada', 'Sorria@123');
    expect(result).toBe(false);
  });

  test('verifyPassword rejeita hash malformado', async () => {
    const result = await verifyPassword('test', 'pbkdf2:invalid');
    expect(result).toBe(false);
  });

  test('hash com caracteres especiais funciona', async () => {
    const hash = await hashPassword('Sénhá@#$%¨&*!çÇ');
    const result = await verifyPassword('Sénhá@#$%¨&*!çÇ', hash);
    expect(result).toBe(true);
  });

  test('hash com string vazia funciona', async () => {
    const hash = await hashPassword('');
    const result = await verifyPassword('', hash);
    expect(result).toBe(true);
  });

  test('hash com string muito longa funciona', async () => {
    const longPw = 'a'.repeat(1000);
    const hash = await hashPassword(longPw);
    const result = await verifyPassword(longPw, hash);
    expect(result).toBe(true);
  });
});

describe('needsMigration', () => {
  test('texto plano precisa de migração', () => {
    expect(needsMigration('Sorria@123')).toBe(true);
  });

  test('hash PBKDF2 NÃO precisa de migração', async () => {
    const hash = await hashPassword('teste');
    expect(needsMigration(hash)).toBe(false);
  });

  test('string vazia precisa de migração', () => {
    expect(needsMigration('')).toBe(true);
  });
});

// ===========================================================
// JWT
// ===========================================================

describe('generateToken / verifyToken', () => {
  const mockUser = { id: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin' };

  test('gera token no formato JWT (3 partes separadas por ponto)', async () => {
    const token = await generateToken(mockUser);
    expect(token.split('.')).toHaveLength(3);
  });

  test('token gerado é verificável e contém dados corretos', async () => {
    const token = await generateToken(mockUser);
    const payload = await verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(1);
    expect(payload!.email).toBe('admin@test.com');
    expect(payload!.role).toBe('admin');
    expect(payload!.nome).toBe('Admin');
  });

  test('token tem iat e exp válidos', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await generateToken(mockUser);
    const payload = await verifyToken(token);

    expect(payload!.iat).toBeGreaterThanOrEqual(before);
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
    // Expira em ~24h
    expect(payload!.exp - payload!.iat).toBe(24 * 3600);
  });

  test('token com assinatura modificada é rejeitado', async () => {
    const token = await generateToken(mockUser);
    const parts = token.split('.');
    // Modificar um char da assinatura
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}X`;

    const payload = await verifyToken(tampered);
    expect(payload).toBeNull();
  });

  test('token com payload modificado é rejeitado', async () => {
    const token = await generateToken(mockUser);
    const parts = token.split('.');
    // Modificar o payload
    const tampered = `${parts[0]}.aW52YWxpZA.${parts[2]}`;

    const payload = await verifyToken(tampered);
    expect(payload).toBeNull();
  });

  test('token malformado retorna null', async () => {
    expect(await verifyToken('')).toBeNull();
    expect(await verifyToken('abc')).toBeNull();
    expect(await verifyToken('a.b')).toBeNull();
    expect(await verifyToken('not-a-jwt-at-all')).toBeNull();
  });

  test('tokens diferentes para o mesmo usuário', async () => {
    const t1 = await generateToken(mockUser);
    const t2 = await generateToken(mockUser);
    // Podem ser iguais se gerados no mesmo segundo, mas geralmente diferem
    // O importante é que ambos são válidos
    expect(await verifyToken(t1)).not.toBeNull();
    expect(await verifyToken(t2)).not.toBeNull();
  });
});

describe('extractToken', () => {
  test('extrai token do header Authorization Bearer', () => {
    const request = new Request('http://localhost', {
      headers: { Authorization: 'Bearer meu-token-jwt' },
    });
    expect(extractToken(request)).toBe('meu-token-jwt');
  });

  test('extrai token do cookie auth-token', () => {
    const request = new Request('http://localhost', {
      headers: { Cookie: 'auth-token=meu-token-jwt; other=value' },
    });
    expect(extractToken(request)).toBe('meu-token-jwt');
  });

  test('prioriza header Authorization sobre cookie', () => {
    const request = new Request('http://localhost', {
      headers: {
        Authorization: 'Bearer token-do-header',
        Cookie: 'auth-token=token-do-cookie',
      },
    });
    expect(extractToken(request)).toBe('token-do-header');
  });

  test('retorna null quando não há token', () => {
    const request = new Request('http://localhost');
    expect(extractToken(request)).toBeNull();
  });

  test('retorna null quando Authorization não é Bearer', () => {
    const request = new Request('http://localhost', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(extractToken(request)).toBeNull();
  });

  test('retorna null quando cookie não tem auth-token', () => {
    const request = new Request('http://localhost', {
      headers: { Cookie: 'session=abc; theme=dark' },
    });
    expect(extractToken(request)).toBeNull();
  });
});

// ===========================================================
// Middleware (withAuth / withRole)
// ===========================================================

describe('withAuth', () => {
  const mockHandler = jest.fn(async (_req: NextRequest, ctx: AuthenticatedContext) => {
    return NextResponse.json({ userId: ctx.user.sub, role: ctx.user.role });
  });

  beforeEach(() => {
    mockHandler.mockClear();
  });

  test('rejeita request sem token → 401', async () => {
    const handler = withAuth(mockHandler);
    const request = new NextRequest('http://localhost/api/test');

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Token');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('rejeita token inválido → 401', async () => {
    const handler = withAuth(mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    const response = await handler(request);
    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('aceita token válido e passa user no context', async () => {
    const token = await generateToken({ id: 5, email: 'test@test.com', role: 'executor', nome: 'Test' });
    const handler = withAuth(mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.userId).toBe(5);
    expect(data.role).toBe('executor');
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('aceita token via cookie', async () => {
    const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'A' });
    const handler = withAuth(mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Cookie: `auth-token=${token}` },
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
  });

  test('preserva routeContext (params) ao chamar o handler', async () => {
    const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'A' });
    
    const handler = withAuth(async (_req, ctx) => {
      return NextResponse.json({ hasParams: !!ctx.params });
    });

    const request = new NextRequest('http://localhost/api/test/1', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await handler(request, { params: Promise.resolve({ id: '1' }) });
    const data = await response.json();
    expect(data.hasParams).toBe(true);
  });
});

describe('withRole', () => {
  const mockHandler = jest.fn(async () => NextResponse.json({ ok: true }));

  beforeEach(() => {
    mockHandler.mockClear();
  });

  test('permite role autorizada', async () => {
    const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'A' });
    const handler = withRole(['admin'], mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  test('permite quando role está na lista', async () => {
    const token = await generateToken({ id: 1, email: 'a@b.com', role: 'atendente', nome: 'B' });
    const handler = withRole(['admin', 'atendente'], mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await handler(request);
    expect(response.status).toBe(200);
  });

  test('rejeita role não autorizada → 403', async () => {
    const token = await generateToken({ id: 1, email: 'a@b.com', role: 'executor', nome: 'C' });
    const handler = withRole(['admin', 'atendente'], mockHandler);
    const request = new NextRequest('http://localhost/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const response = await handler(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain('não autorizado');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('rejeita sem token (401 antes de verificar role)', async () => {
    const handler = withRole(['admin'], mockHandler);
    const request = new NextRequest('http://localhost/api/test');

    const response = await handler(request);
    expect(response.status).toBe(401);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('rejeita cada role individualmente', async () => {
    const roles: Array<{ role: string; allowed: string[]; shouldPass: boolean }> = [
      { role: 'executor', allowed: ['admin'], shouldPass: false },
      { role: 'atendente', allowed: ['avaliador', 'executor'], shouldPass: false },
      { role: 'avaliador', allowed: ['admin', 'atendente'], shouldPass: false },
      { role: 'admin', allowed: ['admin'], shouldPass: true },
    ];

    for (const { role, allowed, shouldPass } of roles) {
      const token = await generateToken({ id: 1, email: 'a@b.com', role, nome: 'X' });
      const handler = withRole(allowed as Array<'admin' | 'atendente' | 'avaliador' | 'executor'>, mockHandler);
      const request = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const response = await handler(request);
      if (shouldPass) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(403);
      }
    }
  });
});
