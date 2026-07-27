import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    roles: ['admin'],
    nome: 'Admin Teste',
    unidade_ids: [1, 2],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { verifyToken } from '@/lib/auth/jwt';
import { GET as getAdminDashboard } from '@/app/api/dashboard/admin/route';

interface AdminDashboardResponse {
  resumo_operacional: {
    faturamento_total: number;
    atendimentos_criados: number;
    procedimentos_pagos: number;
    valor_orcado_nao_pago: number;
  };
  resumo_analitico: {
    total_clientes: number;
    ticket_medio: number;
    taxa_conversao: number;
    comissoes_total: number;
    atendimentos_finalizados: number;
  };
  porStatus: Array<{ status: string; count: number }>;
  porCanal: Array<{ origem: string; total: number; count: number; label: string }>;
  topProcedimentos: Array<{ nome: string; total: number; count: number }>;
  faturamentoMensal: Array<{ mes: string; faturamento: number; atendimentos: number }>;
  topVendedores: Array<{ nome: string; tipo: string; total: number }>;
  topExecutores: Array<{ nome: string; tipo: string; total: number }>;
}

function findExecutedQuery(marker: string) {
  const query = getExecutedQueries().find((entry) =>
    entry.sql.toLowerCase().includes(marker.toLowerCase())
  );
  expect(query).toBeDefined();
  return query!;
}

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  jest.clearAllMocks();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/dashboard/admin — contrato operacional', () => {
  it('retorna o novo bloco resumo_operacional e o resumo_analitico', async () => {
    const { status, data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data).toHaveProperty('resumo_operacional');
    expect(data).toHaveProperty('resumo_analitico');
    expect(data).toHaveProperty('porStatus');
    expect(data).toHaveProperty('porCanal');
    expect(data).toHaveProperty('topProcedimentos');
    expect(data).toHaveProperty('faturamentoMensal');
    expect(data).toHaveProperty('topVendedores');
    expect(data).toHaveProperty('topExecutores');
  });

  it('retorna zero nos cards principais quando o dia nao tem dados', async () => {
    const { status, data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data.resumo_operacional).toEqual({
      faturamento_total: 0,
      atendimentos_criados: 0,
      procedimentos_pagos: 0,
      valor_orcado_nao_pago: 0,
    });
    expect(data.resumo_analitico).toEqual({
      total_clientes: 0,
      ticket_medio: 0,
      taxa_conversao: 0,
      comissoes_total: 0,
      atendimentos_finalizados: 0,
    });
    expect(data.porStatus).toEqual([]);
    expect(data.porCanal).toEqual([]);
    expect(data.topProcedimentos).toEqual([]);
    expect(data.faturamentoMensal).toEqual([]);
    expect(data.topVendedores).toEqual([]);
    expect(data.topExecutores).toEqual([]);
  });

  it('conta atendimento criado no periodo em atendimentos_criados', async () => {
    mockQueryResponse('resumo_operacional:atendimentos_criados', [{ count: 3 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.resumo_operacional.atendimentos_criados).toBe(3);
  });

  it('conta item quitado no periodo em procedimentos_pagos mesmo sem execucao', async () => {
    mockQueryResponse('resumo_operacional:procedimentos_pagos', [{ count: 7 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.resumo_operacional.procedimentos_pagos).toBe(7);

    const procedimentosPagosQuery = findExecutedQuery('resumo_operacional:procedimentos_pagos');
    expect(procedimentosPagosQuery.sql).toContain('WITH alocacoes_ativas');
    expect(procedimentosPagosQuery.sql).toContain('primeira_quitacao');
    expect(procedimentosPagosQuery.sql).toContain('COALESCE(i.valor_pago, 0) + 0.001 >= COALESCE(i.valor_final, i.valor)');
  });

  it('nao inclui pagamento cancelado no faturamento_total', async () => {
    mockQueryResponse('resumo_operacional:faturamento_total', [{ total: 15000 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.resumo_operacional.faturamento_total).toBe(15000);

    const faturamentoQuery = findExecutedQuery('resumo_operacional:faturamento_total');
    expect(faturamentoQuery.sql).toContain('COALESCE(p.cancelado, 0) = 0');
  });

  it('soma saldo aberto do orcamento gerado no periodo em valor_orcado_nao_pago', async () => {
    mockQueryResponse('resumo_operacional:valor_orcado_nao_pago', [{ total: 8450 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.resumo_operacional.valor_orcado_nao_pago).toBe(8450);

    const orcadoQuery = findExecutedQuery('resumo_operacional:valor_orcado_nao_pago');
    expect(orcadoQuery.sql).toContain("COALESCE(a.tipo, 'normal') != 'sessao'");
    expect(orcadoQuery.sql).toContain("COALESCE(a.motivo_saida, '') != 'continuacao'");
    expect(orcadoQuery.sql).toContain('COALESCE(i.adicionado_em_execucao, 0) = 0');
  });

  it('nao inclui item quitado no mesmo dia em valor_orcado_nao_pago', async () => {
    mockQueryResponse('resumo_operacional:valor_orcado_nao_pago', [{ total: 0 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.resumo_operacional.valor_orcado_nao_pago).toBe(0);

    const orcadoQuery = findExecutedQuery('resumo_operacional:valor_orcado_nao_pago');
    expect(orcadoQuery.sql).toContain('COALESCE(i.valor_pago, 0) + 0.001 < COALESCE(i.valor_final, i.valor)');
  });

  it('aplica o filtro de periodo corretamente para criacao, quitacao e orcamento aberto', async () => {
    await callRoute(getAdminDashboard, '/api/dashboard/admin', {
      searchParams: {
        data_inicio: '2025-01-01',
        data_fim: '2025-01-31',
      },
    });

    const atendimentoQuery = findExecutedQuery('resumo_operacional:atendimentos_criados');
    expect(atendimentoQuery.params).toContain('2025-01-01T03:00:00.000Z');
    expect(atendimentoQuery.params).toContain('2025-02-01T02:59:59.999Z');

    const quitacaoQuery = findExecutedQuery('resumo_operacional:procedimentos_pagos');
    expect(quitacaoQuery.params).toContain('2025-01-01T03:00:00.000Z');
    expect(quitacaoQuery.params).toContain('2025-02-01T02:59:59.999Z');

    const orcadoQuery = findExecutedQuery('resumo_operacional:valor_orcado_nao_pago');
    expect(orcadoQuery.params).toContain('2025-01-01T03:00:00.000Z');
    expect(orcadoQuery.params).toContain('2025-02-01T02:59:59.999Z');
  });

  it('troca a unidade atual nas queries quando o header da unidade muda', async () => {
    mockQueryResponse('resumo_operacional:faturamento_total', [{ total: 900 }]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin',
      {
        headers: {
          'X-Unidade-Id': '2',
        },
      }
    );

    expect(data.resumo_operacional.faturamento_total).toBe(900);

    const faturamentoQuery = findExecutedQuery('resumo_operacional:faturamento_total');
    expect(faturamentoQuery.params[0]).toBe(2);
  });

  it('formata labels conhecidas no bloco porCanal', async () => {
    mockQueryResponse('complementar:por_canal', [
      { origem: 'fachada', total: 1000, count: 1 },
      { origem: 'trafego_meta', total: 700, count: 1 },
      { origem: 'nova_origem', total: 300, count: 1 },
    ]);

    const { data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(data.porCanal.find((item) => item.origem === 'fachada')?.label).toBe('Fachada');
    expect(data.porCanal.find((item) => item.origem === 'trafego_meta')?.label).toBe('Tráfego Meta');
    expect(data.porCanal.find((item) => item.origem === 'nova_origem')?.label).toBe('nova_origem');
  });

  it('permite atendente acessar o dashboard administrativo', async () => {
    const verifyTokenMock = verifyToken as jest.MockedFunction<typeof verifyToken>;
    verifyTokenMock.mockResolvedValueOnce({
      sub: 2,
      email: 'atendente@test.com',
      role: 'atendente',
      roles: ['atendente'],
      nome: 'Atendente Teste',
      unidade_ids: [1],
      unidade_atual: 1,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const { status, data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data).toHaveProperty('resumo_operacional');
  });

  it('permite avaliador acessar o dashboard administrativo', async () => {
    const verifyTokenMock = verifyToken as jest.MockedFunction<typeof verifyToken>;
    verifyTokenMock.mockResolvedValueOnce({
      sub: 3,
      email: 'avaliador@test.com',
      role: 'avaliador',
      roles: ['avaliador'],
      nome: 'Avaliador Teste',
      unidade_ids: [1],
      unidade_atual: 1,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const { status, data } = await callRoute<AdminDashboardResponse>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(status).toBe(200);
    expect(data).toHaveProperty('resumo_operacional');
  });

  it('rejeita usuario sem perfil admin, atendente ou avaliador', async () => {
    const verifyTokenMock = verifyToken as jest.MockedFunction<typeof verifyToken>;
    verifyTokenMock.mockResolvedValueOnce({
      sub: 99,
      email: 'executor@test.com',
      role: 'executor',
      roles: ['executor'],
      nome: 'Executor Teste',
      unidade_ids: [1],
      unidade_atual: 1,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    });

    const { status, data } = await callRoute<{ error: string }>(
      getAdminDashboard,
      '/api/dashboard/admin'
    );

    expect(status).toBe(403);
    expect(data.error).toBe('Acesso não autorizado para este perfil');
  });
});
