/**
 * Testes de segurança — Autorização (RBAC) e IDOR
 *
 * Sprint 10 — Documenta e testa:
 * - O middleware withAuth/withRole funciona corretamente quando aplicado
 * - ⚠ DOCUMENTA que nenhuma rota aplica auth atualmente (gap de segurança MVP)
 * - IDOR: endpoints que aceitam usuario_id do cliente sem verificação
 * - Testa que middleware bloqueia roles não autorizadas por rota
 * - Mapeia permissões esperadas por rota
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth/jwt';
import { withAuth, withRole, AuthenticatedContext } from '@/lib/auth/middleware';
import { callRoute } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  getExecutedQueries,
} from '../helpers/db-mock';

// Rotas a serem testadas (importação real)
import { GET as getDashboard } from '@/app/api/dashboard/route';
import { GET as getDashboardAdmin } from '@/app/api/dashboard/admin/route';
import { GET as getClientes } from '@/app/api/clientes/route';
import { GET as getUsuarios, POST as postUsuarios } from '@/app/api/usuarios/route';
import { GET as getMeusProcedimentos } from '@/app/api/meus-procedimentos/route';
import { PUT as putSenha } from '@/app/api/auth/senha/route';

describe('Segurança — Autorização & IDOR', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ─── withAuth middleware ──────────────────────

  describe('withAuth middleware', () => {
    const handler = jest.fn(async (_req: NextRequest, ctx: AuthenticatedContext) => {
      return NextResponse.json({ user: ctx.user.sub });
    });

    beforeEach(() => handler.mockClear());

    test('sem token → 401', async () => {
      const wrapped = withAuth(handler);
      const req = new NextRequest('http://localhost/api/test');
      const res = await wrapped(req);
      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    test('token de assinatura inválida → 401', async () => {
      const wrapped = withAuth(handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer fake.token.here' },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    test('token válido → passa user no context', async () => {
      const token = await generateToken({ id: 5, email: 'a@b.com', role: 'executor', nome: 'X', unidade_ids: [1], unidade_atual: 1 });
      const wrapped = withAuth(handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBe(5);
    });

    test('token via cookie → funciona', async () => {
      const token = await generateToken({ id: 3, email: 'a@b.com', role: 'admin', nome: 'A', unidade_ids: [1, 2], unidade_atual: 1 });
      const wrapped = withAuth(handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Cookie: `auth-token=${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    });
  });

  // ─── withRole middleware ──────────────────────

  describe('withRole middleware', () => {
    const handler = jest.fn(async () => NextResponse.json({ ok: true }));
    beforeEach(() => handler.mockClear());

    test('admin com role admin permitido', async () => {
      const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'A', unidade_ids: [1, 2], unidade_atual: 1 });
      const wrapped = withRole(['admin'], handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    });

    test('executor tentando acessar rota admin → 403', async () => {
      const token = await generateToken({ id: 2, email: 'b@c.com', role: 'executor', nome: 'E', unidade_ids: [1], unidade_atual: 1 });
      const wrapped = withRole(['admin'], handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('não autorizado');
    });

    test('atendente tentando acessar rota admin → 403', async () => {
      const token = await generateToken({ id: 3, email: 'c@d.com', role: 'atendente', nome: 'At', unidade_ids: [1], unidade_atual: 1 });
      const wrapped = withRole(['admin'], handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(403);
    });

    test('múltiplas roles permitidas funciona', async () => {
      const token = await generateToken({ id: 4, email: 'd@e.com', role: 'atendente', nome: 'At', unidade_ids: [1], unidade_atual: 1 });
      const wrapped = withRole(['admin', 'atendente'], handler);
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    });

    test('sem token → 401 (antes de verificar role)', async () => {
      const wrapped = withRole(['admin'], handler);
      const req = new NextRequest('http://localhost/api/test');
      const res = await wrapped(req);
      expect(res.status).toBe(401);
    });
  });

  // ─── Mapeamento de Permissões Esperadas ───────

  describe('mapeamento de permissões por rota (documentação)', () => {
    /**
     * Este bloco documenta as permissões esperadas para cada rota.
     * Como as rotas NÃO usam withAuth/withRole atualmente, estes testes
     * servem como especificação para implementação futura.
     *
     * ⚠ LIMITAÇÃO MVP: As rotas não aplicam auth — todas são acessíveis publicamente.
     */

    const ROLE_MAP: Record<string, string[]> = {
      'GET /api/clientes': ['admin', 'atendente', 'avaliador', 'executor'],
      'POST /api/clientes': ['admin', 'atendente'],
      'DELETE /api/clientes/[id]': ['admin'],
      'GET /api/usuarios': ['admin'],
      'POST /api/usuarios': ['admin'],
      'PUT /api/usuarios/[id]': ['admin'],
      'DELETE /api/usuarios/[id]': ['admin'],
      'GET /api/procedimentos': ['admin', 'atendente', 'avaliador', 'executor'],
      'POST /api/procedimentos': ['admin'],
      'PUT /api/procedimentos/[id]': ['admin'],
      'DELETE /api/procedimentos/[id]': ['admin'],
      'GET /api/atendimentos': ['admin', 'atendente', 'avaliador', 'executor'],
      'POST /api/atendimentos': ['admin', 'atendente'],
      'GET /api/dashboard': ['admin', 'atendente', 'avaliador', 'executor'],
      'GET /api/dashboard/admin': ['admin', 'atendente', 'avaliador'],
      'POST /api/atendimentos/[id]/finalizar': ['admin', 'atendente'],
      'GET /api/comissoes': ['admin', 'atendente'],
      'GET /api/execucao': ['admin', 'executor'],
    };

    test('mapa de permissões cobre todos os endpoints críticos', () => {
      expect(Object.keys(ROLE_MAP).length).toBeGreaterThanOrEqual(15);
    });

    test('rotas admin-only incluem: usuarios CRUD e procedimentos CRUD', () => {
      const adminOnly = Object.entries(ROLE_MAP)
        .filter(([, roles]) => roles.length === 1 && roles[0] === 'admin')
        .map(([route]) => route);

      expect(adminOnly).toContain('GET /api/usuarios');
      expect(adminOnly).toContain('POST /api/usuarios');
      expect(adminOnly).toContain('DELETE /api/clientes/[id]');
      expect(adminOnly).not.toContain('GET /api/dashboard/admin');
    });

    test.each([
      ['admin', 'executor', ['admin'], false],
      ['admin', 'atendente', ['admin'], false],
      ['admin', 'avaliador', ['admin'], false],
      ['admin', 'admin', ['admin'], true],
      ['atendente+admin', 'admin', ['admin', 'atendente'], true],
      ['atendente+admin', 'atendente', ['admin', 'atendente'], true],
      ['atendente+admin', 'executor', ['admin', 'atendente'], false],
      ['dashboard-view', 'avaliador', ['admin', 'atendente', 'avaliador'], true],
      ['dashboard-view', 'executor', ['admin', 'atendente', 'avaliador'], false],
    ])('withRole(%s) role=%s → %s', async (_desc, role, allowed, shouldPass) => {
      const handler = jest.fn(async () => NextResponse.json({ ok: true }));
      const token = await generateToken({ id: 1, email: 'a@b.com', role, nome: 'Test', unidade_ids: [1, 2], unidade_atual: 1 });
      const wrapped = withRole(
        allowed as Array<'admin' | 'atendente' | 'avaliador' | 'executor'>,
        handler
      );
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(shouldPass ? 200 : 403);
    });
  });

  // ─── IDOR — Insecure Direct Object Reference ──

  describe('IDOR — endpoints aceitam usuario_id do cliente', () => {
    /**
     * ⚠ DOCUMENTAÇÃO DE VULNERABILIDADE MVP
     *
     * Estas rotas aceitam usuario_id como parâmetro do request em vez de
     * extrair do JWT. Um atacante pode enviar o usuario_id de outro usuário
     * e acessar seus dados.
     *
     * A correção seria usar context.user.sub do middleware withAuth.
     * Estes testes demonstram o problema e servem como base para a correção.
     */

    test('PUT /api/auth/senha — pode trocar senha de QUALQUER usuário (IDOR)', async () => {
      // Simula atacante que conhece o ID da vítima
      const { hashPassword } = await import('@/lib/auth/password');
      const hashedPw = await hashPassword('SenhaOriginal');

      // Mock: vítima existe
      mockQueryResponse('select id, senha from usuarios', {
        id: 999, // ID da vítima
        senha: hashedPw,
      });

      const { status } = await callRoute(putSenha, '/api/auth/senha', {
        method: 'PUT',
        body: {
          usuario_id: 999, // atacante fornece ID da vítima
          senha_atual: 'SenhaOriginal',
          nova_senha: 'SenhaDoAtacante!',
        },
      });

      // ⚠ BUG: Aceita sem verificar se o request é do usuário 999
      // Deveria verificar via JWT que o solicitante É o usuário 999
      expect(status).toBe(200);
    });

    test('GET /api/dashboard — agora requer autenticação (withUnit)', async () => {
      // Sem token → 401 (protegido por withUnit)
      const { status } = await callRoute(getDashboard, '/api/dashboard', {
        headers: { Authorization: '' },
        searchParams: { usuario_id: '999', role: 'executor' },
      });

      // ✅ Corrigido: withUnit exige JWT válido
      expect(status).toBe(401);
    });

    test('GET /api/meus-procedimentos — agora requer autenticação (withUnit)', async () => {
      // Sem token → 401 (protegido por withUnit)
      const { status } = await callRoute(getMeusProcedimentos, '/api/meus-procedimentos', {
        headers: { Authorization: '' },
        searchParams: { usuario_id: '999' },
      });

      // ✅ Corrigido: withUnit exige JWT válido
      expect(status).toBe(401);
    });

    test('GET /api/dashboard/admin — agora requer autenticação (withUnit)', async () => {
      // Sem token → 401 (protegido por withUnit)
      const { status } = await callRoute(getDashboardAdmin, '/api/dashboard/admin', {
        headers: { Authorization: '' },
      });

      // ✅ Corrigido: withUnit exige JWT válido
      expect(status).toBe(401);
    });
  });

  // ─── Teste de aplicação de withAuth em handlers ──

  describe('withAuth protege handler real quando aplicado', () => {
    test('handler de GET clientes protegido com withAuth rejeita sem token', async () => {
      const protectedGet = withAuth(async (request: NextRequest) => {
        // Simula o que GET /api/clientes faria com auth
        return getClientes(request);
      });

      const req = new NextRequest('http://localhost/api/clientes');
      const res = await protectedGet(req);
      expect(res.status).toBe(401);
    });

    test('handler de GET clientes protegido com withAuth funciona com token válido', async () => {
      // Route now uses batch: COUNT(*) + SELECT *
      mockQueryResponse('count(*) as total from clientes', [{ total: 1 }]);
      mockQueryResponse('select * from clientes', [
        { id: 1, nome: 'João', cpf: '12345678901', origem: 'fachada' },
      ]);

      const protectedGet = withAuth(async (request: NextRequest) => {
        return getClientes(request);
      });

      const token = await generateToken({ id: 1, email: 'a@b.com', role: 'admin', nome: 'Admin', unidade_ids: [1, 2], unidade_atual: 1 });
      const req = new NextRequest('http://localhost/api/clientes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await protectedGet(req);
      expect(res.status).toBe(200);
    });

    test('dashboard admin protegido com withRole rejeita executor', async () => {
      const protectedDashboard = withRole(['admin'], async (request: NextRequest) => {
        return getDashboardAdmin(request);
      });

      const token = await generateToken({ id: 2, email: 'exec@b.com', role: 'executor', nome: 'Exec', unidade_ids: [1], unidade_atual: 1 });
      const req = new NextRequest('http://localhost/api/dashboard/admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await protectedDashboard(req);
      expect(res.status).toBe(403);
    });

    test('dashboard admin protegido com withRole permite admin', async () => {
      mockQueryResponse('sum(p.valor) as total', { total: 50000 });
      mockQueryResponse('count(*) as count', { count: 5 });

      const protectedDashboard = withRole(['admin'], async (request: NextRequest) => {
        return getDashboardAdmin(request);
      });

      const token = await generateToken({ id: 1, email: 'admin@b.com', role: 'admin', nome: 'Admin', unidade_ids: [1, 2], unidade_atual: 1 });
      const req = new NextRequest('http://localhost/api/dashboard/admin', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await protectedDashboard(req);
      expect(res.status).toBe(200);
    });

    test('POST /api/usuarios protegido com withRole rejeita atendente', async () => {
      const protectedPost = withRole(['admin'], async (request: NextRequest) => {
        return postUsuarios(request);
      });

      const token = await generateToken({ id: 2, email: 'at@b.com', role: 'atendente', nome: 'At', unidade_ids: [1], unidade_atual: 1 });
      const req = new NextRequest('http://localhost/api/usuarios', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nome: 'Novo', email: 'novo@test.com', role: 'executor' }),
      });
      const res = await protectedPost(req);
      expect(res.status).toBe(403);
    });
  });

  // ─── Segurança de resposta ────────────────────

  describe('segurança de dados de resposta', () => {
    test('GET /api/usuarios nunca retorna campo senha', async () => {
      mockQueryResponse('select id, nome, email, role, ativo', [
        { id: 1, nome: 'Admin', email: 'admin@test.com', role: 'admin', ativo: 1, created_at: '2025-01-01' },
      ]);

      const { data } = await callRoute<Array<{ id: number; nome: string; senha?: string }>>(
        getUsuarios, '/api/usuarios',
      );

      // Verifica que nenhum usuário na lista tem campo senha
      const users = Array.isArray(data) ? data : [];
      users.forEach((user) => {
        expect(user).not.toHaveProperty('senha');
      });
    });

    test('login retorna user sem senha mas com todos outros campos', async () => {
      mockQueryResponse('select * from usuarios where email', {
        id: 1, nome: 'Admin', email: 'admin@sorrialeste.com',
        senha: 'Sorria@123', role: 'admin', ativo: 1, created_at: '2025-01-01',
      });

      const { POST } = await import('@/app/api/auth/login/route');
      const { data } = await callRoute<{ user: Record<string, unknown> }>(
        POST, '/api/auth/login',
        { method: 'POST', body: { email: 'admin@sorrialeste.com', senha: 'Sorria@123' } },
      );

      expect(data.user).not.toHaveProperty('senha');
      expect(data.user).toHaveProperty('id');
      expect(data.user).toHaveProperty('nome');
      expect(data.user).toHaveProperty('email');
      expect(data.user).toHaveProperty('role');
    });
  });

  // ─── Hardcoded user IDs ───────────────────────

  describe('hardcoded user IDs (limitação MVP)', () => {
    /**
     * ⚠ DOCUMENTAÇÃO DE LIMITAÇÃO
     *
     * Duas rotas usam `SELECT id FROM usuarios LIMIT 1` para preencher
     * campos que deveriam vir do JWT autenticado.
     *
     * - atendimentos/[id]/route.ts → liberado_por_id
     * - atendimentos/[id]/pagamentos/route.ts → recebido_por_id
     */

    test('atendimentos PUT usa context.user.sub como liberado_por_id ao liberar para execução', async () => {
      // Documenta que a rota agora usa context.user.sub (do JWT) para liberado_por_id
      // A antiga query SELECT LIMIT 1 foi removida em favor da autenticação
      const { PUT: putAtendimento } = await import('@/app/api/atendimentos/[id]/route');

      // Mock: atendimento em aguardando_pagamento
      mockQueryResponse('from atendimentos where id = ? and unidade_id = ?', {
        id: 1, status: 'aguardando_pagamento', cliente_id: 1, avaliador_id: 1,
        valor_total: 1000, valor_pago: 1000, created_at: '2025-01-01',
      });
      // Mock: validação de transição — pelo menos 1 item e cobertura financeira suficiente
      mockQueryResponse('select count(*) as count from itens_atendimento where atendimento_id = ?', { count: 1 });
      mockQueryResponse('and valor_pago + 0.001 < coalesce', { count: 0 });
      // Mock: updated atendimento retornado
      mockQueryResponse('select a.*', {
        id: 1, status: 'em_execucao', cliente_id: 1, avaliador_id: 1,
      });

      // Gerar token válido para passar pelo withUnit middleware
      const token = await generateToken({ id: 1, email: 'admin@b.com', role: 'admin', nome: 'Admin', unidade_ids: [1, 2], unidade_atual: 1 });
      const ctx = { params: Promise.resolve({ id: '1' }) };
      await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: { status: 'em_execucao' },
      }, ctx);

      // Verifica que liberado_por_id = user.sub (1) é usado no UPDATE
      const queries = getExecutedQueries();
      const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
      expect(updateQuery).toBeDefined();
      expect(updateQuery!.sql).toContain('liberado_por_id');
      // user.sub = 1 from the token
      expect(updateQuery!.params).toContain(1);
    });
  });
});
