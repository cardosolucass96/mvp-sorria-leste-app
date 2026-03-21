/**
 * Sprint 9 — Testes do Dashboard (rota por role)
 *
 * Cobre: GET /api/dashboard?usuario_id=X&role=Y
 *   - Stats gerais (totalClientes, atendimentosHoje, aguardandoPagamento, etc.)
 *   - Stats de executor (meusProcedimentos, procedimentosDisponiveis)
 *   - Stats de avaliador (meusAtendimentosAvaliacao, atendimentosDisponiveisAvaliacao)
 *   - Comissões mensais do usuário
 *   - Dashboard sem dados → zeros, não erros
 *   - Sem usuario_id → retorna apenas stats gerais
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

import { GET as getDashboard } from '@/app/api/dashboard/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// Interface do retorno
interface DashboardStats {
  totalClientes: number;
  atendimentosHoje: number;
  aguardandoPagamento: number;
  finalizadosHoje: number;
  emExecucao: number;
  emAvaliacao: number;
  parcelasVencidas: number;
  minhasComissoes: number;
  meusProcedimentos: number;
  procedimentosDisponiveis: number;
  meusAtendimentosAvaliacao: number;
  atendimentosDisponiveisAvaliacao: number;
}

// =============================================================================
// Stats gerais (sem usuario_id)
// =============================================================================

describe('GET /api/dashboard — stats gerais', () => {
  it('retorna todas as propriedades do dashboard', async () => {
    mockQueryResponse('count(*) as count from clientes', [{ count: 50 }]);
    mockQueryResponse("count(*) as count from atendimentos", [{ count: 0 }]);

    const { status, data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');

    expect(status).toBe(200);
    expect(data).toHaveProperty('totalClientes');
    expect(data).toHaveProperty('atendimentosHoje');
    expect(data).toHaveProperty('aguardandoPagamento');
    expect(data).toHaveProperty('finalizadosHoje');
    expect(data).toHaveProperty('emExecucao');
    expect(data).toHaveProperty('emAvaliacao');
    expect(data).toHaveProperty('parcelasVencidas');
    expect(data).toHaveProperty('minhasComissoes');
    expect(data).toHaveProperty('meusProcedimentos');
    expect(data).toHaveProperty('procedimentosDisponiveis');
    expect(data).toHaveProperty('meusAtendimentosAvaliacao');
    expect(data).toHaveProperty('atendimentosDisponiveisAvaliacao');
  });

  it('totalClientes retorna contagem do banco', async () => {
    mockQueryResponse('count(*) as count from clientes', [{ count: 42 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.totalClientes).toBe(42);
  });

  it('atendimentosHoje conta apenas do dia atual', async () => {
    mockQueryResponse("date(created_at) = date('now'", [{ count: 5 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.atendimentosHoje).toBe(5);
  });

  it('aguardandoPagamento conta status correto', async () => {
    mockQueryResponse("status = 'aguardando_pagamento'", [{ count: 8 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.aguardandoPagamento).toBe(8);
  });

  it('finalizadosHoje conta finalizados do dia', async () => {
    mockQueryResponse("status = 'finalizado' and date(finalizado_at)", [{ count: 3 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.finalizadosHoje).toBe(3);
  });

  it('emExecucao conta status em_execucao', async () => {
    mockQueryResponse("status = 'em_execucao'", [{ count: 12 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.emExecucao).toBe(12);
  });

  it('emAvaliacao conta triagem + avaliacao', async () => {
    mockQueryResponse("status in ('triagem', 'avaliacao')", [{ count: 7 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.emAvaliacao).toBe(7);

    // Verifica que a query inclui ambos os status
    const queries = getExecutedQueries();
    const avaliacaoQuery = queries.find(q =>
      q.sql.toLowerCase().includes("'triagem'") && q.sql.toLowerCase().includes("'avaliacao'")
    );
    expect(avaliacaoQuery).toBeDefined();
  });

  it('parcelasVencidas conta parcelas não pagas com vencimento passado', async () => {
    mockQueryResponse("pago = 0 and date(data_vencimento)", [{ count: 4 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');
    expect(data.parcelasVencidas).toBe(4);
  });

  it('sem usuario_id, stats pessoais são zero', async () => {
    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');

    expect(data.minhasComissoes).toBe(0);
    expect(data.meusProcedimentos).toBe(0);
    expect(data.procedimentosDisponiveis).toBe(0);
    expect(data.meusAtendimentosAvaliacao).toBe(0);
    expect(data.atendimentosDisponiveisAvaliacao).toBe(0);
  });

  it('banco vazio retorna zeros, não erros', async () => {
    // Nenhum mock registrado → todas queries retornam []
    const { status, data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard');

    expect(status).toBe(200);
    expect(data.totalClientes).toBe(0);
    expect(data.atendimentosHoje).toBe(0);
    expect(data.aguardandoPagamento).toBe(0);
    expect(data.finalizadosHoje).toBe(0);
    expect(data.emExecucao).toBe(0);
    expect(data.emAvaliacao).toBe(0);
    expect(data.parcelasVencidas).toBe(0);
  });
});

// =============================================================================
// Stats por role — Executor
// =============================================================================

describe('GET /api/dashboard — role executor', () => {
  it('meusProcedimentos conta itens do executor em atendimento em_execucao', async () => {
    mockQueryResponse("i.executor_id = ?", [{ count: 6 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '4', role: 'executor' },
    });

    expect(data.meusProcedimentos).toBe(6);

    // Verifica que filtra por status correto
    const queries = getExecutedQueries();
    const meusQuery = queries.find(q =>
      q.sql.includes('executor_id = ?') && q.sql.includes("'em_execucao'")
    );
    expect(meusQuery).toBeDefined();
    expect(meusQuery!.params).toContain(4);
  });

  it('procedimentosDisponiveis conta itens sem executor', async () => {
    mockQueryResponse('executor_id is null', [{ count: 3 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '4', role: 'executor' },
    });

    expect(data.procedimentosDisponiveis).toBe(3);
  });

  it('executor NÃO busca stats de avaliador', async () => {
    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '4', role: 'executor' },
    });

    expect(data.meusAtendimentosAvaliacao).toBe(0);
    expect(data.atendimentosDisponiveisAvaliacao).toBe(0);

    // Queries de avaliador não devem estar presentes
    const queries = getExecutedQueries();
    const avaliacaoQuery = queries.find(q =>
      q.sql.includes('avaliador_id = ?')
    );
    expect(avaliacaoQuery).toBeUndefined();
  });
});

// =============================================================================
// Stats por role — Avaliador
// =============================================================================

describe('GET /api/dashboard — role avaliador', () => {
  it('meusAtendimentosAvaliacao conta atendimentos do avaliador', async () => {
    mockQueryResponse("avaliador_id = ?", [{ count: 4 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '3', role: 'avaliador' },
    });

    expect(data.meusAtendimentosAvaliacao).toBe(4);

    const queries = getExecutedQueries();
    const meusQuery = queries.find(q =>
      q.sql.includes('avaliador_id = ?') && q.sql.includes("'triagem'")
    );
    expect(meusQuery).toBeDefined();
    expect(meusQuery!.params).toContain(3);
  });

  it('atendimentosDisponiveisAvaliacao conta sem avaliador', async () => {
    mockQueryResponse('avaliador_id is null', [{ count: 2 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '3', role: 'avaliador' },
    });

    expect(data.atendimentosDisponiveisAvaliacao).toBe(2);
  });

  it('avaliador NÃO busca stats de executor', async () => {
    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '3', role: 'avaliador' },
    });

    expect(data.meusProcedimentos).toBe(0);
    expect(data.procedimentosDisponiveis).toBe(0);
  });
});

// =============================================================================
// Stats por role — Admin (ambas)
// =============================================================================

describe('GET /api/dashboard — role admin', () => {
  it('admin recebe stats de executor E avaliador', async () => {
    mockQueryResponse("i.executor_id = ?", [{ count: 10 }]);
    mockQueryResponse('executor_id is null', [{ count: 5 }]);
    mockQueryResponse("avaliador_id = ?", [{ count: 3 }]);
    mockQueryResponse('avaliador_id is null', [{ count: 1 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '1', role: 'admin' },
    });

    expect(data.meusProcedimentos).toBe(10);
    expect(data.procedimentosDisponiveis).toBe(5);
    expect(data.meusAtendimentosAvaliacao).toBe(3);
    expect(data.atendimentosDisponiveisAvaliacao).toBe(1);
  });
});

// =============================================================================
// Comissões mensais do usuário
// =============================================================================

describe('GET /api/dashboard — comissões do usuário', () => {
  it('minhasComissoes retorna soma do mês corrente', async () => {
    mockQueryResponse("sum(valor_comissao)", [{ total: 1500 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '3', role: 'avaliador' },
    });

    expect(data.minhasComissoes).toBe(1500);

    // Verifica que filtra por mês corrente
    const queries = getExecutedQueries();
    const comissaoQuery = queries.find(q =>
      q.sql.includes('comissoes') && q.sql.includes("strftime('%Y-%m'")
    );
    expect(comissaoQuery).toBeDefined();
    expect(comissaoQuery!.params).toContain(3);
  });

  it('minhasComissoes = 0 quando sem comissões', async () => {
    // Mock retorna null/0
    mockQueryResponse("sum(valor_comissao)", [{ total: 0 }]);

    const { data } = await callRoute<DashboardStats>(getDashboard, '/api/dashboard', {
      searchParams: { usuario_id: '3', role: 'avaliador' },
    });

    expect(data.minhasComissoes).toBe(0);
  });
});
