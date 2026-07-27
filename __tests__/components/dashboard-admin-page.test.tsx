import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import DashboardAdminPage from '@/app/dashboard/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return {
    ...actual,
    getClinicDateKey: jest.fn(() => '2026-07-14'),
    addDaysToClinicDateKey: jest.fn((_date: string, days: number) => (
      days === -7 ? '2026-07-07' : '2026-07-14'
    )),
  };
});

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

function createDashboardPayload() {
  return {
    resumo_operacional: {
      faturamento_total: 1500,
      atendimentos_criados: 4,
      procedimentos_pagos: 6,
      valor_orcado_nao_pago: 320,
    },
    resumo_analitico: {
      total_clientes: 3,
      ticket_medio: 450,
      taxa_conversao: 50,
      comissoes_total: 120,
      atendimentos_finalizados: 2,
    },
    porStatus: [
      { status: 'triagem', count: 1 },
      { status: 'finalizado', count: 2 },
    ],
    porCanal: [
      { origem: 'fachada', label: 'Fachada', total: 1500, count: 2 },
    ],
    topProcedimentos: [
      { nome: 'Canal', total: 900, count: 3 },
    ],
    faturamentoMensal: [
      { mes: '2026-07', faturamento: 1500, atendimentos: 2 },
    ],
    topVendedores: [
      { nome: 'Ana', total: 120, tipo: 'venda' },
    ],
    topExecutores: [
      { nome: 'Dr. Pedro', total: 80, tipo: 'execucao' },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: 1, nome: 'Admin', role: 'admin', roles: ['admin'] },
    isLoading: false,
    isAdmin: true,
    hasRole: (roles: string | string[]) => {
      const roleList = Array.isArray(roles) ? roles : [roles];
      return roleList.includes('admin');
    },
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DashboardAdminPage', () => {
  it('abre por padrao em hoje e renderiza os cards operacionais', async () => {
    mockUnitFetch.mockImplementation(() => mockJsonResponse(createDashboardPayload()));

    render(<DashboardAdminPage />);

    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith(
        '/api/dashboard/admin?data_inicio=2026-07-14&data_fim=2026-07-14'
      );
    });

    expect(await screen.findByText('Faturamento total recebido')).toBeInTheDocument();
    expect(screen.getByText('Atendimentos criados')).toBeInTheDocument();
    expect(screen.getByText('Procedimentos pagos')).toBeInTheDocument();
    expect(screen.getByText('Orçado não pago')).toBeInTheDocument();
  });

  it('mantem estado vazio funcional quando o payload vem zerado', async () => {
    mockUnitFetch.mockImplementation(() => mockJsonResponse({
      ...createDashboardPayload(),
      resumo_operacional: {
        faturamento_total: 0,
        atendimentos_criados: 0,
        procedimentos_pagos: 0,
        valor_orcado_nao_pago: 0,
      },
      resumo_analitico: {
        total_clientes: 0,
        ticket_medio: 0,
        taxa_conversao: 0,
        comissoes_total: 0,
        atendimentos_finalizados: 0,
      },
      porStatus: [],
      porCanal: [],
      topProcedimentos: [],
      faturamentoMensal: [],
      topVendedores: [],
      topExecutores: [],
    }));

    render(<DashboardAdminPage />);

    expect(await screen.findAllByText('Sem dados no período')).not.toHaveLength(0);
  });

  it('mantem estado de erro funcional quando a API falha', async () => {
    mockUnitFetch.mockImplementation(() => mockJsonResponse(
      { error: 'falhou' },
      { ok: false, status: 500 }
    ));

    render(<DashboardAdminPage />);

    expect(await screen.findByText('Erro ao carregar dashboard')).toBeInTheDocument();
    expect(screen.getByText('Erro ao carregar dados')).toBeInTheDocument();
  });

  it('permite atendente visualizar o mesmo dashboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, nome: 'Atendente', role: 'atendente', roles: ['atendente'] },
      isLoading: false,
      isAdmin: false,
      hasRole: (roles: string | string[]) => {
        const roleList = Array.isArray(roles) ? roles : [roles];
        return roleList.includes('atendente');
      },
    });
    mockUnitFetch.mockImplementation(() => mockJsonResponse(createDashboardPayload()));

    render(<DashboardAdminPage />);

    expect(await screen.findByText('Faturamento total recebido')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('permite avaliador visualizar o mesmo dashboard', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 3, nome: 'Avaliador', role: 'avaliador', roles: ['avaliador'] },
      isLoading: false,
      isAdmin: false,
      hasRole: (roles: string | string[]) => {
        const roleList = Array.isArray(roles) ? roles : [roles];
        return roleList.includes('avaliador');
      },
    });
    mockUnitFetch.mockImplementation(() => mockJsonResponse(createDashboardPayload()));

    render(<DashboardAdminPage />);

    expect(await screen.findByText('Faturamento total recebido')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
