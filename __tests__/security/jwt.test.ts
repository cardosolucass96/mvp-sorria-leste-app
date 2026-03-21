/**
 * Testes de segurança — JWT (JSON Web Tokens)
 *
 * Sprint 10 — Foco em ataques e edge cases de segurança:
 * - Token expirado
 * - Token com claims manipuladas (role escalation)
 * - Token com assinatura trocada
 * - Algoritmo diferente (alg confusion)
 * - Token vazio / nulo / malformado
 * - Extração de token de múltiplas fontes
 * - Cookie HttpOnly no login
 * - Segurança do segredo JWT
 */

import { NextRequest } from 'next/server';
import { generateToken, verifyToken, extractToken, JwtPayload } from '@/lib/auth/jwt';
import { callRoute } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';

import { POST as loginPost } from '@/app/api/auth/login/route';

/** Helper: codifica em base64url */
function base64urlEncode(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Helper: decodifica base64url */
function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return atob(base64);
}

/** Helper: cria token JWT fraudulento sem assinatura válida */
function forgeToken(payload: Partial<JwtPayload>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    nome: 'Admin',
    iat: now,
    exp: now + 86400,
    ...payload,
  };
  const payloadStr = base64urlEncode(JSON.stringify(fullPayload));
  // Assinatura falsa
  const fakeSignature = base64urlEncode('fake-signature-data');
  return `${header}.${payloadStr}.${fakeSignature}`;
}

describe('Segurança — JWT', () => {
  // ─── Tokens Expirados ─────────────────────────

  describe('expiração de token', () => {
    test('token com exp no passado é rejeitado', async () => {
      // Criar token forjado com exp expirado
      const token = forgeToken({ exp: Math.floor(Date.now() / 1000) - 3600 });
      const payload = await verifyToken(token);
      // Pode rejeitar por assinatura OU por expiração — ambos retornam null
      expect(payload).toBeNull();
    });

    test('token válido é aceito antes da expiração', async () => {
      const user = { id: 1, email: 'test@test.com', role: 'admin', nome: 'Test' };
      const token = await generateToken(user);
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('token expira em exatamente 24 horas', async () => {
      const user = { id: 1, email: 'test@test.com', role: 'admin', nome: 'Test' };
      const token = await generateToken(user);
      const payload = await verifyToken(token);

      const diffHours = (payload!.exp - payload!.iat) / 3600;
      expect(diffHours).toBe(24);
    });
  });

  // ─── Manipulação de Token ─────────────────────

  describe('token manipulation (ataques)', () => {
    test('modificar role no payload invalida o token', async () => {
      const user = { id: 1, email: 'executor@test.com', role: 'executor', nome: 'Exec' };
      const token = await generateToken(user);
      const [header, , signature] = token.split('.');

      // Decodificar payload, alterar role para admin
      const payload = JSON.parse(base64urlDecode(token.split('.')[1]));
      payload.role = 'admin';
      const tamperedPayload = base64urlEncode(JSON.stringify(payload));

      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
      const result = await verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    test('modificar sub (user id) no payload invalida o token', async () => {
      const user = { id: 99, email: 'normal@test.com', role: 'executor', nome: 'Normal' };
      const token = await generateToken(user);
      const [header, , signature] = token.split('.');

      const payload = JSON.parse(base64urlDecode(token.split('.')[1]));
      payload.sub = 1; // tentar se passar por admin
      const tamperedPayload = base64urlEncode(JSON.stringify(payload));

      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
      const result = await verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    test('trocar assinatura entre tokens de usuários diferentes invalida', async () => {
      const tokenUser1 = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'Admin' });
      const tokenUser2 = await generateToken({ id: 2, email: 'c@d.com', role: 'executor', nome: 'Exec' });

      const [header1, payload1] = tokenUser1.split('.');
      const [, , signature2] = tokenUser2.split('.');

      // Combinar payload do admin com assinatura do executor
      const tamperedToken = `${header1}.${payload1}.${signature2}`;
      const result = await verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    test('modificar expiração para o futuro invalida (assinatura quebra)', async () => {
      const user = { id: 1, email: 'a@b.com', role: 'admin', nome: 'Admin' };
      const token = await generateToken(user);
      const [header, , signature] = token.split('.');

      const payload = JSON.parse(base64urlDecode(token.split('.')[1]));
      payload.exp = Math.floor(Date.now() / 1000) + 999999; // futuro distante
      const tamperedPayload = base64urlEncode(JSON.stringify(payload));

      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
      const result = await verifyToken(tamperedToken);
      expect(result).toBeNull();
    });

    test('token com alg: none é rejeitado', async () => {
      const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const payload = base64urlEncode(JSON.stringify({
        sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      }));
      const noneToken = `${header}.${payload}.`;

      const result = await verifyToken(noneToken);
      expect(result).toBeNull();
    });
  });

  // ─── Tokens Malformados ───────────────────────

  describe('tokens malformados', () => {
    test('string vazia retorna null', async () => {
      expect(await verifyToken('')).toBeNull();
    });

    test('string aleatória retorna null', async () => {
      expect(await verifyToken('not-a-jwt')).toBeNull();
    });

    test('token com 1 parte retorna null', async () => {
      expect(await verifyToken('parte1')).toBeNull();
    });

    test('token com 2 partes retorna null', async () => {
      expect(await verifyToken('parte1.parte2')).toBeNull();
    });

    test('token com 4 partes retorna null', async () => {
      expect(await verifyToken('a.b.c.d')).toBeNull();
    });

    test('token com payload non-JSON retorna null', async () => {
      const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const invalidPayload = base64urlEncode('not-json');
      const fakeToken = `${header}.${invalidPayload}.fakesignature`;
      expect(await verifyToken(fakeToken)).toBeNull();
    });

    test('token com header non-JSON não quebra', async () => {
      const invalidHeader = base64urlEncode('not-json');
      const payload = base64urlEncode(JSON.stringify({ sub: 1 }));
      const fakeToken = `${invalidHeader}.${payload}.fakesignature`;
      expect(await verifyToken(fakeToken)).toBeNull();
    });

    test('token forjado com assinatura falsa é rejeitado', async () => {
      const forged = forgeToken({ sub: 1, role: 'admin' });
      expect(await verifyToken(forged)).toBeNull();
    });
  });

  // ─── Extração de Token ────────────────────────

  describe('extração de token', () => {
    test('extrai de Authorization: Bearer <token>', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer meu-token' },
      });
      expect(extractToken(req)).toBe('meu-token');
    });

    test('NÃO extrai de Authorization sem Bearer', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Basic abc123' },
      });
      expect(extractToken(req)).toBeNull();
    });

    test('extrai de Cookie auth-token=<token>', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Cookie: 'auth-token=meu-token; session=abc' },
      });
      expect(extractToken(req)).toBe('meu-token');
    });

    test('cookie garble: auth-token-extra não é extraído indevidamente', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Cookie: 'auth-token-extra=wrong; auth-token=correct' },
      });
      // O regex deve pegar o auth-token correto
      const token = extractToken(req);
      expect(token).toBe('correct');
    });

    test('sem Authorization e sem Cookie → null', () => {
      const req = new NextRequest('http://localhost/api/test');
      expect(extractToken(req)).toBeNull();
    });

    test('Authorization Bearer vazio → retorna null ou string vazia', () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer ' },
      });
      const token = extractToken(req);
      // Pode retornar null (header trimmed) ou "" (empty string)
      // De qualquer forma, verifyToken vai rejeitar
      if (token !== null) {
        expect(token).toBe('');
      } else {
        expect(token).toBeNull();
      }
    });
  });

  // ─── Login retorna Token + Cookie ─────────────

  describe('login retorna JWT + cookie HttpOnly', () => {
    beforeEach(() => {
      setupCloudflareContextMock();
      resetMockDb();
    });

    afterEach(() => {
      teardownCloudflareContextMock();
    });

    test('resposta do login contém token JWT no body', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { status, data } = await callRoute<{ token: string }>(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      expect(status).toBe(200);
      expect(data.token).toBeDefined();
      expect(data.token.split('.')).toHaveLength(3);
    });

    test('resposta do login seta cookie auth-token', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { headers } = await callRoute(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      const setCookie = headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('auth-token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Path=/');
    });

    test('cookie tem SameSite=Lax', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { headers } = await callRoute(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      const setCookie = headers.get('set-cookie');
      // Next.js pode serializar como 'lax' (minúsculo)
      expect(setCookie!.toLowerCase()).toContain('samesite=lax');
    });

    test('cookie tem Max-Age de 24h (86400)', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { headers } = await callRoute(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      const setCookie = headers.get('set-cookie');
      expect(setCookie).toContain('Max-Age=86400');
    });

    test('token do body e do cookie são o mesmo', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { data, headers } = await callRoute<{ token: string }>(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      const setCookie = headers.get('set-cookie') || '';
      const cookieMatch = setCookie.match(/auth-token=([^;]+)/);
      expect(cookieMatch).toBeDefined();
      expect(cookieMatch![1]).toBe(data.token);
    });

    test('token JWT contém claims corretas do usuário', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 42, nome: 'Dr. João', email: 'joao@sorrialeste.com',
        senha: 'Sorria@123', role: 'avaliador', ativo: 1, created_at: '2025-01-01',
      });

      const { data } = await callRoute<{ token: string }>(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'joao@sorrialeste.com', senha: 'Sorria@123' } },
      );

      const payload = await verifyToken(data.token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(42);
      expect(payload!.email).toBe('joao@sorrialeste.com');
      expect(payload!.role).toBe('avaliador');
      expect(payload!.nome).toBe('Dr. João');
    });

    test('resposta do login NÃO contém campo senha', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { data } = await callRoute<{ user: Record<string, unknown> }>(
        loginPost, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      expect(data.user).not.toHaveProperty('senha');
    });
  });

  // ─── Payload do Token ─────────────────────────

  describe('payload e claims do token', () => {
    test('token contém sub, email, role, nome, iat, exp', async () => {
      const user = { id: 10, email: 'test@test.com', role: 'atendente', nome: 'Teste' };
      const token = await generateToken(user);
      const payload = await verifyToken(token);

      expect(payload).toHaveProperty('sub', 10);
      expect(payload).toHaveProperty('email', 'test@test.com');
      expect(payload).toHaveProperty('role', 'atendente');
      expect(payload).toHaveProperty('nome', 'Teste');
      expect(payload).toHaveProperty('iat');
      expect(payload).toHaveProperty('exp');
    });

    test('sub é numérico (number, não string)', async () => {
      const token = await generateToken({ id: 42, email: 'a@b.com', role: 'admin', nome: 'A' });
      const payload = await verifyToken(token);
      expect(typeof payload!.sub).toBe('number');
    });

    test('iat e exp são unix timestamps em segundos', async () => {
      const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'A' });
      const payload = await verifyToken(token);

      // Should be around current time in seconds (not milliseconds)
      const now = Math.floor(Date.now() / 1000);
      expect(payload!.iat).toBeGreaterThanOrEqual(now - 5);
      expect(payload!.iat).toBeLessThanOrEqual(now + 5);
      expect(payload!.exp).toBeGreaterThan(now);
    });
  });
});
