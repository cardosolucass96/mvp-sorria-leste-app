/**
 * Testes de isolamento multi-unidade
 *
 * Cobre:
 *   - Atendimentos filtrados por unidade_id
 *   - Agendamentos filtrados por unidade_id
 *   - Admin pode alternar unidade via header X-Unidade-Id
 *   - Non-admin não acessa unidade à qual não pertence
 *   - Clientes são compartilhados entre unidades (sem filtro de unidade)
 *   - Saldo do cliente é compartilhado entre unidades
 */

import { callRoute } from '../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
} from '../helpers/db-mock';
import {
  CLIENTE_BASICO,
  TODOS_CLIENTES,
  UNIDADE_BARRA,
  UNIDADE_VILA,
} from '../helpers/seed';

// ============================================================
// JWT mock — admin com ambas unidades
// ============================================================

const adminPayload = {
  sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin',
  unidade_ids: [1, 2], unidade_atual: 1,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
};

const atendentePayload = {
  sub: 2, email: 'atendente@test.com', role: 'atendente', nome: 'Maria',
  unidade_ids: [1], unidade_atual: 1,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
};

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as listAtendimentos, POST as createAtendimento } from '@/app/api/atendimentos/route';
import { GET as listAgendamentos } from '@/app/api/agendamentos/route';
import { GET as listClientes } from '@/app/api/clientes/route';
import { GET as getSaldo } from '@/app/api/clientes/[id]/saldo/route';

const { verifyToken } = jest.requireMock('@/lib/auth/jwt');

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  verifyToken.mockResolvedValue(adminPayload);
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Atendimentos — isolamento por unidade
// =============================================================================

describe('Atendimentos: isolamento por unidade', () => {
  const atendimentoUni1 = {
    id: 1, cliente_id: 1, status: 'triagem', unidade_id: 1,
    cliente_nome: 'Lucas', cliente_cpf: null, cliente_telefone: null,
    avaliador_nome: null, procedimentos_resumo: null, executores_resumo: null,
  };
  const atendimentoUni2 = {
    id: 2, cliente_id: 2, status: 'triagem', unidade_id: 2,
    cliente_nome: 'Ana', cliente_cpf: null, cliente_telefone: null,
    avaliador_nome: null, procedimentos_resumo: null, executores_resumo: null,
  };

  it('GET retorna apenas atendimentos da unidade selecionada (header X-Unidade-Id)', async () => {
    // Mock: quando query filtra por unidade 1, retorna somente o atendimento da unidade 1
    mockQueryResponse('from atendimentos a', [atendimentoUni1]);

    const { status, data } = await callRoute<typeof atendimentoUni1[]>(
      listAtendimentos, '/api/atendimentos',
      { headers: { 'X-Unidade-Id': '1' } }
    );

    expect(status).toBe(200);

    // Verifica que a query inclui filtro de unidade
    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM atendimentos'));
    expect(selectQ).toBeDefined();
    expect(selectQ!.sql).toContain('a.unidade_id = ?');
    expect(selectQ!.params).toContain(1);
  });

  it('admin alterna para unidade 2 via header', async () => {
    mockQueryResponse('from atendimentos a', [atendimentoUni2]);

    const { status } = await callRoute(
      listAtendimentos, '/api/atendimentos',
      { headers: { 'X-Unidade-Id': '2' } }
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM atendimentos'));
    expect(selectQ!.params).toContain(2);
  });

  it('POST cria atendimento na unidade do header', async () => {
    // Mock: cliente existe, sem atendimento aberto, avaliador válido
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('select id, role from usuarios where id', { id: 3, role: 'avaliador' });
    setLastInsertId(10);
    mockQueryResponse('from atendimentos a\n', {
      id: 10, cliente_id: 1, status: 'triagem', unidade_id: 2,
      cliente_nome: 'Lucas', cliente_cpf: null, cliente_telefone: null,
      avaliador_nome: 'Dr. João', procedimentos_resumo: null, executores_resumo: null,
    });

    const { status } = await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, avaliador_id: 3 },
      headers: { 'X-Unidade-Id': '2' },
    });

    expect(status).toBe(201);

    // INSERT deve ter unidade_id = 2
    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertQ).toBeDefined();
    expect(insertQ!.params).toContain(2);
  });
});

// =============================================================================
// Agendamentos — isolamento por unidade
// =============================================================================

describe('Agendamentos: isolamento por unidade', () => {
  it('GET filtra agendamentos pela unidade do header', async () => {
    mockQueryResponse('from agendamentos a', []);

    const { status } = await callRoute(
      listAgendamentos, '/api/agendamentos',
      { headers: { 'X-Unidade-Id': '2' } }
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQ).toBeDefined();
    expect(selectQ!.sql).toContain('a.unidade_id = ?');
    expect(selectQ!.params).toContain(2);
  });
});

// =============================================================================
// Non-admin: acesso restrito à unidade vinculada
// =============================================================================

describe('Non-admin: acesso à unidade', () => {
  beforeEach(() => {
    verifyToken.mockResolvedValue(atendentePayload);
  });

  it('atendente acessa unidade própria (unidade 1) normalmente', async () => {
    mockQueryResponse('from atendimentos a', []);

    const { status } = await callRoute(
      listAtendimentos, '/api/atendimentos',
      { headers: { 'X-Unidade-Id': '1' } }
    );

    expect(status).toBe(200);
  });

  it('atendente que tenta usar unidade 2 recai no fallback (unidade_atual)', async () => {
    // Atendente só pertence à unidade 1.
    // getUnidadeFromRequest: header=2 → parsed=2 → role != admin && !unidade_ids.includes(2) → fallback unidade_atual (1)
    mockQueryResponse('from atendimentos a', []);

    const { status } = await callRoute(
      listAtendimentos, '/api/atendimentos',
      { headers: { 'X-Unidade-Id': '2' } }
    );

    expect(status).toBe(200);

    // A query deve usar unidade_atual=1, NÃO 2
    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM atendimentos'));
    expect(selectQ!.params).toContain(1);
    expect(selectQ!.params).not.toContain(2);
  });

  it('atendente sem header usa unidade_atual do JWT', async () => {
    mockQueryResponse('from atendimentos a', []);

    const { status } = await callRoute(
      listAtendimentos, '/api/atendimentos'
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const selectQ = queries.find(q => q.sql.includes('FROM atendimentos'));
    expect(selectQ!.params).toContain(1);
  });
});

// =============================================================================
// Clientes — compartilhados (sem filtro de unidade)
// =============================================================================

describe('Clientes: compartilhados entre unidades', () => {
  it('GET /api/clientes NÃO filtra por unidade', async () => {
    mockQueryResponse('count(*) as total from clientes', { total: 3 });
    mockQueryResponse('from clientes', TODOS_CLIENTES);

    const { status } = await callRoute(
      listClientes, '/api/clientes'
    );

    expect(status).toBe(200);

    // Nenhuma query de clientes deve conter filtro de unidade
    const queries = getExecutedQueries();
    const clientQueries = queries.filter(q => q.sql.toLowerCase().includes('clientes'));
    for (const q of clientQueries) {
      expect(q.sql).not.toContain('unidade_id');
    }
  });
});

// =============================================================================
// Saldo — compartilhado (sem filtro de unidade)
// =============================================================================

describe('Saldo do cliente: compartilhado entre unidades', () => {
  it('GET /api/clientes/[id]/saldo NÃO filtra por unidade', async () => {
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('from saldo_clientes where cliente_id', { saldo: 250.0, updated_at: '2025-03-01' });
    mockQueryResponse('from movimentacoes_saldo', []);
    mockQueryResponse('from itens_atendimento', { saldo_calculado: 0 });

    // Simula request vindo da unidade 2
    const { status, data } = await callRoute<{ saldo: number }>(
      getSaldo, '/api/clientes/1/saldo',
      { headers: { 'X-Unidade-Id': '2' } },
      { params: Promise.resolve({ id: '1' }) }
    );

    expect(status).toBe(200);
    expect(data.saldo).toBe(250.0);

    // Queries de saldo não devem filtrar por unidade
    const queries = getExecutedQueries();
    const saldoQueries = queries.filter(q =>
      q.sql.toLowerCase().includes('saldo_clientes') ||
      q.sql.toLowerCase().includes('movimentacoes_saldo')
    );
    for (const q of saldoQueries) {
      expect(q.sql).not.toContain('unidade_id');
    }
  });
});
