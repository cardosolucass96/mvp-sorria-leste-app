/**
 * Sprint 9 — Testes do Dashboard Admin
 *
 * Cobre: GET /api/dashboard/admin
 *   - Resumo financeiro (faturamento, a receber, vencidas)
 *   - Atendimentos por status
 *   - Faturamento por canal de aquisição
 *   - Top 10 procedimentos
 *   - Faturamento mensal (últimos 6 meses)
 *   - Ticket médio
 *   - Top vendedores e executores
 *   - Taxa de conversão
 *   - Comissões totais
 *   - Filtro de período (data_inicio, data_fim)
 *   - Dashboard sem dados → zeros, não erros
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

import { GET as getAdminDashboard } from '@/app/api/dashboard/admin/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// Interface do retorno
interface AdminDashboard {
  resumo: {
    faturamento: number;
    aReceber: number;
    vencidas: number;
    parcelasVencidas: number;
    totalAtendimentos: number;
    totalClientes: number;
    ticketMedio: number;
    taxaConversao: number;
    comissoesTotal: number;
    atendimentosFinalizados: number;
  };
  porStatus: Array<{ status: string; count: number }>;
  porCanal: Array<{ origem: string; total: number; count: number; label: string }>;
  topProcedimentos: Array<{ nome: string; total: number; count: number }>;
  faturamentoMensal: Array<{ mes: string; faturamento: number; atendimentos: number }>;
  topVendedores: Array<{ nome: string; tipo: string; total: number }>;
  topExecutores: Array<{ nome: string; tipo: string; total: number }>;
}

// =============================================================================
// Estrutura da resposta
// =============================================================================

describe('GET /api/dashboard/admin — estrutura', () => {
  it('retorna todos os blocos do dashboard', async () => {
    const { status, data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data).toHaveProperty('resumo');
    expect(data).toHaveProperty('porStatus');
    expect(data).toHaveProperty('porCanal');
    expect(data).toHaveProperty('topProcedimentos');
    expect(data).toHaveProperty('faturamentoMensal');
    expect(data).toHaveProperty('topVendedores');
    expect(data).toHaveProperty('topExecutores');
  });

  it('resumo contém todas as métricas', async () => {
    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo).toHaveProperty('faturamento');
    expect(data.resumo).toHaveProperty('aReceber');
    expect(data.resumo).toHaveProperty('vencidas');
    expect(data.resumo).toHaveProperty('parcelasVencidas');
    expect(data.resumo).toHaveProperty('totalAtendimentos');
    expect(data.resumo).toHaveProperty('totalClientes');
    expect(data.resumo).toHaveProperty('ticketMedio');
    expect(data.resumo).toHaveProperty('taxaConversao');
    expect(data.resumo).toHaveProperty('comissoesTotal');
    expect(data.resumo).toHaveProperty('atendimentosFinalizados');
  });
});

// =============================================================================
// Dashboard sem dados — zeros em tudo
// =============================================================================

describe('GET /api/dashboard/admin — banco vazio', () => {
  it('retorna zeros no resumo com banco vazio', async () => {
    const { status, data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data.resumo.faturamento).toBe(0);
    expect(data.resumo.aReceber).toBe(0);
    expect(data.resumo.vencidas).toBe(0);
    expect(data.resumo.parcelasVencidas).toBe(0);
    expect(data.resumo.totalAtendimentos).toBe(0);
    expect(data.resumo.totalClientes).toBe(0);
    expect(data.resumo.ticketMedio).toBe(0);
    expect(data.resumo.taxaConversao).toBe(0);
    expect(data.resumo.comissoesTotal).toBe(0);
    expect(data.resumo.atendimentosFinalizados).toBe(0);
  });

  it('retorna arrays vazios para agregações', async () => {
    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.porStatus).toEqual([]);
    expect(data.porCanal).toEqual([]);
    expect(data.topProcedimentos).toEqual([]);
    expect(data.faturamentoMensal).toEqual([]);
    expect(data.topVendedores).toEqual([]);
    expect(data.topExecutores).toEqual([]);
  });
});

// =============================================================================
// Resumo financeiro — faturamento, a receber, vencidas
// =============================================================================

describe('GET /api/dashboard/admin — resumo financeiro', () => {
  it('faturamento = soma dos pagamentos', async () => {
    mockQueryResponse('sum(p.valor)', [{ total: 25000 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.faturamento).toBe(25000);
  });

  it('aReceber = soma de (valor - valor_pago) para não finalizados', async () => {
    mockQueryResponse('sum(i.valor - i.valor_pago)', [{ total: 5000 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.aReceber).toBe(5000);

    // Verifica que exclui finalizados
    const queries = getExecutedQueries();
    const aReceberQuery = queries.find(q =>
      q.sql.includes('i.valor - i.valor_pago') && q.sql.includes("'finalizado'")
    );
    expect(aReceberQuery).toBeDefined();
  });

  it('vencidas = valor total de parcelas vencidas', async () => {
    mockQueryResponse("pago = 0 and data_vencimento", [{ total: 2000, count: 5 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.vencidas).toBe(2000);
    expect(data.resumo.parcelasVencidas).toBe(5);
  });

  it('comissoesTotal = soma de todas as comissões', async () => {
    mockQueryResponse('sum(valor_comissao)', [{ total: 8000 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.comissoesTotal).toBe(8000);
  });
});

// =============================================================================
// Atendimentos por status
// =============================================================================

describe('GET /api/dashboard/admin — atendimentos por status', () => {
  it('retorna contagem agrupada por status', async () => {
    mockQueryResponse('group by status', [
      { status: 'triagem', count: 10 },
      { status: 'avaliacao', count: 8 },
      { status: 'aguardando_pagamento', count: 5 },
      { status: 'em_execucao', count: 12 },
      { status: 'finalizado', count: 30 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.porStatus).toHaveLength(5);
    expect(data.porStatus[0]).toEqual({ status: 'triagem', count: 10 });
    expect(data.porStatus[4]).toEqual({ status: 'finalizado', count: 30 });
  });

  it('query ordena por pipeline pipeline lógica (triagem→avaliacao→...→finalizado)', async () => {
    mockQueryResponse('group by status', []);

    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    const statusQuery = queries.find(q => q.sql.includes('GROUP BY status'));
    expect(statusQuery).toBeDefined();
    expect(statusQuery!.sql).toContain('CASE status');
    expect(statusQuery!.sql).toContain("'triagem' THEN 1");
    expect(statusQuery!.sql).toContain("'finalizado' THEN 5");
  });
});

// =============================================================================
// Faturamento por canal de aquisição
// =============================================================================

describe('GET /api/dashboard/admin — faturamento por canal', () => {
  it('retorna faturamento agrupado por origem do cliente', async () => {
    mockQueryResponse('group by c.origem', [
      { origem: 'fachada', total: 10000, count: 8 },
      { origem: 'indicacao', total: 5000, count: 3 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.porCanal).toHaveLength(2);
    expect(data.porCanal[0].origem).toBe('fachada');
    expect(data.porCanal[0].total).toBe(10000);
    expect(data.porCanal[0].count).toBe(8);
  });

  it('adiciona labels formatados para origens conhecidas', async () => {
    mockQueryResponse('group by c.origem', [
      { origem: 'fachada', total: 10000, count: 8 },
      { origem: 'trafego_meta', total: 7000, count: 5 },
      { origem: 'trafego_google', total: 3000, count: 2 },
      { origem: 'organico', total: 2000, count: 4 },
      { origem: 'indicacao', total: 5000, count: 3 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.porCanal.find(c => c.origem === 'fachada')!.label).toBe('Fachada');
    expect(data.porCanal.find(c => c.origem === 'trafego_meta')!.label).toBe('Tráfego Meta');
    expect(data.porCanal.find(c => c.origem === 'trafego_google')!.label).toBe('Tráfego Google');
    expect(data.porCanal.find(c => c.origem === 'organico')!.label).toBe('Orgânico');
    expect(data.porCanal.find(c => c.origem === 'indicacao')!.label).toBe('Indicação');
  });

  it('origem desconhecida usa o próprio valor como label', async () => {
    mockQueryResponse('group by c.origem', [
      { origem: 'nova_origem', total: 1000, count: 1 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.porCanal[0].label).toBe('nova_origem');
  });
});

// =============================================================================
// Top 10 procedimentos
// =============================================================================

describe('GET /api/dashboard/admin — top procedimentos', () => {
  it('retorna top procedimentos com total e contagem', async () => {
    mockQueryResponse('group by pr.id', [
      { nome: 'Canal', total: 16000, count: 20 },
      { nome: 'Restauração', total: 8000, count: 20 },
      { nome: 'Limpeza', total: 3000, count: 20 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.topProcedimentos).toHaveLength(3);
    expect(data.topProcedimentos[0].nome).toBe('Canal');
    expect(data.topProcedimentos[0].total).toBe(16000);
  });

  it('query limita a 10 procedimentos ordenados por total DESC', async () => {
    mockQueryResponse('group by pr.id', []);

    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    const procQuery = queries.find(q =>
      q.sql.includes('GROUP BY pr.id') && q.sql.includes('LIMIT 10')
    );
    expect(procQuery).toBeDefined();
    expect(procQuery!.sql).toContain('ORDER BY total DESC');
  });
});

// =============================================================================
// Faturamento mensal
// =============================================================================

describe('GET /api/dashboard/admin — faturamento mensal', () => {
  it('retorna faturamento agrupado por mês', async () => {
    mockQueryResponse("strftime('%y-%m', p.created_at)", [
      { mes: '2025-07', faturamento: 20000, atendimentos: 15 },
      { mes: '2025-08', faturamento: 25000, atendimentos: 18 },
      { mes: '2025-09', faturamento: 22000, atendimentos: 16 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.faturamentoMensal).toHaveLength(3);
    expect(data.faturamentoMensal[0].mes).toBe('2025-07');
    expect(data.faturamentoMensal[0].faturamento).toBe(20000);
    expect(data.faturamentoMensal[0].atendimentos).toBe(15);
  });

  it('query busca últimos 6 meses', async () => {
    mockQueryResponse("strftime('%y-%m', p.created_at)", []);

    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    const mensalQuery = queries.find(q =>
      q.sql.includes("-6 months")
    );
    expect(mensalQuery).toBeDefined();
    expect(mensalQuery!.sql).toContain('ORDER BY mes ASC');
  });
});

// =============================================================================
// Ticket médio, taxa de conversão
// =============================================================================

describe('GET /api/dashboard/admin — métricas derivadas', () => {
  it('ticketMedio = média do valor total dos atendimentos finalizados', async () => {
    mockQueryResponse('avg(total_atend)', [{ total: 850 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.ticketMedio).toBe(850);

    // Verifica que filtra atendimentos finalizados
    const queries = getExecutedQueries();
    const ticketQuery = queries.find(q => q.sql.includes('AVG(total_atend)'));
    expect(ticketQuery!.sql).toContain("'finalizado'");
  });

  it('taxaConversao = (finalizados / total) * 100', async () => {
    // Ambas queries usam "from atendimentos a" — a de finalizados adiciona WHERE status = 'finalizado'.
    // O mock substring match retorna o PRIMEIRO match. Precisamos registrar o mais específico primeiro.
    // finalizados: query contém "status = 'finalizado'" — registrar primeiro
    mockQueryResponse("where status = 'finalizado'", [{ count: 40 }]);
    // total: query NÃO contém WHERE status — usa "count(*) as count\n      from atendimentos a\n      where 1=1"
    // Mas ambas contêm "from atendimentos a". O mock faz first-match.
    // Vamos testar que taxa é calculada mesmo que ambas retornem o valor do mock mais específico.
    // O total vem de query "FROM atendimentos a\n      WHERE 1=1" sem filtro status.
    // O finalizados vem de "WHERE status = 'finalizado'".
    // Como o mock retorna o primeiro match, e 'finalizado' match é mais específico, registramos em ordem:
    // Na verdade, a query de totalAtendimentos não contém 'finalizado', então não vai matchear.
    // Vamos usar um mock separável:
    mockQueryResponse("count(*) as count\n      from atendimentos a\n      where 1=1", [{ count: 100 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    // totalAtendimentos usa o mock com "where 1=1", finalizados usa o mock com "status = 'finalizado'"
    expect(data.resumo.totalAtendimentos).toBe(100);
    expect(data.resumo.atendimentosFinalizados).toBe(40);
    expect(data.resumo.taxaConversao).toBe(40.0);
  });

  it('taxaConversao = 0 quando não há atendimentos', async () => {
    // Total: 0
    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.taxaConversao).toBe(0);
  });

  it('totalClientes conta todos os clientes', async () => {
    mockQueryResponse('count(*) as count from clientes', [{ count: 200 }]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.resumo.totalClientes).toBe(200);
  });
});

// =============================================================================
// Top vendedores e executores
// =============================================================================

describe('GET /api/dashboard/admin — rankings', () => {
  it('topVendedores retorna ranking por comissão de venda', async () => {
    mockQueryResponse("c.tipo = 'venda'", [
      { nome: 'Ana Secretária', tipo: 'venda', total: 5000 },
      { nome: 'João Admin', tipo: 'venda', total: 3000 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.topVendedores).toHaveLength(2);
    expect(data.topVendedores[0].nome).toBe('Ana Secretária');
    expect(data.topVendedores[0].total).toBe(5000);
    expect(data.topVendedores[0].tipo).toBe('venda');
  });

  it('topVendedores limita a 5 resultados', async () => {
    mockQueryResponse("c.tipo = 'venda'", []);

    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    const vendedoresQuery = queries.find(q =>
      q.sql.includes("c.tipo = 'venda'") && q.sql.includes('LIMIT 5')
    );
    expect(vendedoresQuery).toBeDefined();
    expect(vendedoresQuery!.sql).toContain('ORDER BY total DESC');
  });

  it('topExecutores retorna ranking por comissão de execução', async () => {
    mockQueryResponse("c.tipo = 'execucao'", [
      { nome: 'Dr. Pedro Dentista', tipo: 'execucao', total: 12000 },
    ]);

    const { data } = await callRoute<AdminDashboard>(
      getAdminDashboard, '/api/dashboard/admin'
    );

    expect(data.topExecutores).toHaveLength(1);
    expect(data.topExecutores[0].nome).toBe('Dr. Pedro Dentista');
    expect(data.topExecutores[0].total).toBe(12000);
  });

  it('topExecutores limita a 5 resultados', async () => {
    mockQueryResponse("c.tipo = 'execucao'", []);

    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    const execQuery = queries.find(q =>
      q.sql.includes("c.tipo = 'execucao'") && q.sql.includes('LIMIT 5')
    );
    expect(execQuery).toBeDefined();
  });
});

// =============================================================================
// Filtro de período (data_inicio, data_fim)
// =============================================================================

describe('GET /api/dashboard/admin — filtro de período', () => {
  it('aplica filtro de data_inicio nas queries de atendimentos', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin', {
      searchParams: { data_inicio: '2025-01-01' },
    });

    const queries = getExecutedQueries();
    // Verifica que queries de atendimentos usam o filtro
    const filteredQueries = queries.filter(q =>
      q.sql.includes('DATE(a.created_at) >= ?') && q.params.includes('2025-01-01')
    );
    expect(filteredQueries.length).toBeGreaterThan(0);
  });

  it('aplica filtro de data_fim nas queries de atendimentos', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin', {
      searchParams: { data_fim: '2025-12-31' },
    });

    const queries = getExecutedQueries();
    const filteredQueries = queries.filter(q =>
      q.sql.includes('DATE(a.created_at) <= ?') && q.params.includes('2025-12-31')
    );
    expect(filteredQueries.length).toBeGreaterThan(0);
  });

  it('aplica filtro de período completo (BETWEEN)', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin', {
      searchParams: { data_inicio: '2025-01-01', data_fim: '2025-06-30' },
    });

    const queries = getExecutedQueries();
    const filteredQueries = queries.filter(q =>
      q.sql.includes('BETWEEN ? AND ?') &&
      q.params.includes('2025-01-01') &&
      q.params.includes('2025-06-30')
    );
    expect(filteredQueries.length).toBeGreaterThan(0);
  });

  it('filtro de período também é aplicado a pagamentos', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin', {
      searchParams: { data_inicio: '2025-01-01', data_fim: '2025-06-30' },
    });

    const queries = getExecutedQueries();
    const pagQuery = queries.find(q =>
      q.sql.includes('DATE(p.created_at) BETWEEN') && q.params.includes('2025-01-01')
    );
    expect(pagQuery).toBeDefined();
  });

  it('sem filtros não adiciona cláusulas de data', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    // Status query não deve ter BETWEEN nem >= nem <=
    const statusQuery = queries.find(q => q.sql.includes('GROUP BY status'));
    expect(statusQuery!.sql).not.toContain('BETWEEN');
    expect(statusQuery!.sql).not.toContain('DATE(a.created_at) >=');
    expect(statusQuery!.sql).not.toContain('DATE(a.created_at) <=');
  });
});

// =============================================================================
// Performance — observações
// =============================================================================

describe('GET /api/dashboard/admin — performance', () => {
  it('executa número razoável de queries (não N+1)', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin');

    const queries = getExecutedQueries();
    // Rota deve executar um número fixo de queries (não proporcional aos dados)
    // São ~14 queries fixas (faturamento, aReceber, vencidas, porStatus, porCanal,
    // topProcedimentos, mensal, totalAtendimentos, totalClientes, ticketMedio,
    // topVendedores, topExecutores, finalizados, comissoesTotal)
    expect(queries.length).toBeLessThanOrEqual(15);
    expect(queries.length).toBeGreaterThanOrEqual(10);
  });
});
