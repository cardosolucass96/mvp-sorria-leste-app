import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import FinanceiroPage from '@/app/financeiro/page';
import type { FinanceiroResponse } from '@/lib/financeiro/types';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('next/link', () => {
  function MockNextLink({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) {
    return <a href={href} {...props}>{children}</a>;
  }
  MockNextLink.displayName = 'MockNextLink';
  return MockNextLink;
});

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

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('recharts', () => {
  function MockChart({ children }: { children?: React.ReactNode; [key: string]: unknown }) {
    return <div data-testid="mock-chart">{children}</div>;
  }
  MockChart.displayName = 'MockChart';

  function MockElement({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  }
  MockElement.displayName = 'MockElement';

  function MockResponsiveContainer({ children }: { children?: React.ReactNode }) {
    return <div data-testid="responsive-container">{children}</div>;
  }
  MockResponsiveContainer.displayName = 'MockResponsiveContainer';

  return {
    ResponsiveContainer: MockResponsiveContainer,
    LineChart: MockChart,
    BarChart: MockChart,
    CartesianGrid: MockElement,
    XAxis: MockElement,
    YAxis: MockElement,
    Tooltip: MockElement,
    Line: MockElement,
    Bar: MockElement,
    Cell: MockElement,
  };
});

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

function createFinanceiroFixture(): FinanceiroResponse {
  const resultado = {
    data_referencia: '2026-06-07',
    unidade_id: 1,
    unidade_nome: 'Unidade Centro',
    editado_manual: true,
    ajustes_count: 2,
    resumo: {
      faturamento_dia: 1200,
      total_bruto: 1200,
      total_liquido: 1175,
      faturamento_por_metodo: [
        { metodo: 'pix', total: 700, quantidade: 1 },
        { metodo: 'cartao_credito', total: 500, quantidade: 1 },
      ],
      procedimentos_executados: 2,
      total_diarias: 120,
      total_comissao_avaliacao: 30,
      total_comissao_execucao: 0,
      ajustes_manuais: 15,
      total_final: 1040,
      pagamentos_cancelados_dia: { quantidade: 1, valor: 80 },
    },
    graficos: {
      procedimentos_por_quantidade: [],
      ranking_avaliadores: [],
      ranking_executores: [],
    },
    dentistas: [{
      usuario_id: 5,
      nome: 'Dra. Alice',
      included: true,
      manualmente_editado: true,
      ajuste_count: 2,
      valor_diaria: 120,
      comissao_avaliacao: 30,
      comissao_execucao: 0,
      ajustes: [],
      lancamentos_manuais: [],
      total_dia: 150,
      procedimentos_executados: [],
    }],
    avaliacoes_pagas_dia: [],
    lancamentos_manuais_gerais: [],
    pagamentos_recebidos_dia: [{
      id: 'grupo:1',
      pagamento_grupo_id: 1,
      pagamento_representante_id: 501,
      atendimento_id: 1,
      cliente_id: 77,
      cliente_nome: 'Maria',
      cliente_cpf: '12345678901',
      cliente_telefone: '11998765432',
      valor_total: 1200,
      observacoes: 'Pagamento do dia conferido',
      cancelado: false,
      motivo_cancelamento: null,
      created_at: '2026-06-07 09:20:00',
      recebido_por_id: 12,
      recebido_por_nome: 'Paula',
      formas: [
        {
          id: 501,
          valor: 700,
          metodo: 'pix',
          forma_pagamento_id: 1,
          forma_pagamento_grupo_snapshot: 'pix',
          forma_pagamento_subgrupo_snapshot: null,
          valor_taxa: 0,
          valor_liquido: 700,
          observacoes: null,
          cancelado: false,
          motivo_cancelamento: null,
          created_at: '2026-06-07 09:20:00',
        },
        {
          id: 502,
          valor: 500,
          metodo: 'cartao_credito',
          forma_pagamento_id: 2,
          forma_pagamento_grupo_snapshot: 'cartao',
          forma_pagamento_subgrupo_snapshot: 'credito',
          valor_taxa: 25,
          valor_liquido: 475,
          observacoes: null,
          cancelado: false,
          motivo_cancelamento: null,
          created_at: '2026-06-07 09:21:00',
        },
      ],
    }],
  };

  return {
    dia: {
      meta: {
        id: 10,
        unidade_id: 1,
        data_referencia: '2026-06-07',
        status: 'fechado',
        editado_manual: true,
        ajustes_count: 2,
        fechado_por_id: 99,
        fechado_por_nome: 'Gerente',
        fechado_em: '2026-06-07 18:30:00',
        updated_by_id: 99,
        updated_by_nome: 'Gerente',
        updated_at: '2026-06-07 18:30:00',
      },
      resultado,
      recentes: [],
    },
    periodo: {
      data_inicio: '2026-06-07',
      data_fim: '2026-06-08',
      dias: 2,
    },
    dias: [
      {
        data_referencia: '2026-06-07',
        unidade_id: 1,
        unidade_nome: 'Unidade Centro',
        status: 'fechado',
        editado_manual: true,
        ajustes_count: 2,
        fechado_por_nome: 'Gerente',
        fechado_em: '2026-06-07 18:30:00',
        total_bruto: 1200,
        total_liquido: 1175,
        total_final: 1040,
        total_diarias: 120,
        total_comissoes: 30,
        total_comissao_avaliacao: 30,
        total_comissao_execucao: 0,
        ajustes_manuais: 15,
        procedimentos_executados: 2,
        pagamentos: 1,
        pagamentos_cancelados: 1,
        valor_cancelado: 80,
      },
      {
        data_referencia: '2026-06-08',
        unidade_id: 1,
        unidade_nome: 'Unidade Centro',
        status: 'aberto',
        editado_manual: false,
        ajustes_count: 0,
        fechado_por_nome: null,
        fechado_em: null,
        total_bruto: 500,
        total_liquido: 500,
        total_final: 440,
        total_diarias: 50,
        total_comissoes: 10,
        total_comissao_avaliacao: 10,
        total_comissao_execucao: 0,
        ajustes_manuais: 0,
        procedimentos_executados: 1,
        pagamentos: 1,
        pagamentos_cancelados: 0,
        valor_cancelado: 0,
      },
    ],
    receitas_periodo: [
      {
        ...resultado.pagamentos_recebidos_dia[0],
        data_referencia: '2026-06-07',
      },
      {
        ...resultado.pagamentos_recebidos_dia[0],
        id: 'grupo:2',
        pagamento_grupo_id: 2,
        pagamento_representante_id: 503,
        atendimento_id: 2,
        cliente_id: 88,
        cliente_nome: 'João',
        valor_total: 500,
        observacoes: 'Receita do segundo dia',
        created_at: '2026-06-08 10:30:00',
        data_referencia: '2026-06-08',
        formas: [{
          ...resultado.pagamentos_recebidos_dia[0].formas[0],
          id: 503,
          valor: 500,
          valor_liquido: 500,
          created_at: '2026-06-08 10:30:00',
        }],
      },
    ],
    resumo_periodo: {
      unidade_id: 1,
      unidade_nome: 'Unidade Centro',
      editado_manual: true,
      ajustes_count: 2,
      total_bruto: 1700,
      total_liquido: 1675,
      total_final: 1480,
      total_diarias: 170,
      total_comissoes: 40,
      total_comissao_avaliacao: 40,
      total_comissao_execucao: 0,
      ajustes_manuais: 15,
      procedimentos_executados: 3,
      pagamentos: 2,
      pagamentos_cancelados: 1,
      valor_cancelado: 80,
    },
    graficos: {
      faturamento_por_dia: [
        { data_referencia: '2026-06-07', total_bruto: 1200, total_liquido: 1175, total_final: 1040 },
        { data_referencia: '2026-06-08', total_bruto: 500, total_liquido: 500, total_final: 440 },
      ],
      metodos_pagamento: [
        { metodo: 'pix', label: 'PIX', total: 700, quantidade: 1 },
        { metodo: 'cartao_credito', label: 'Cartão Crédito', total: 500, quantidade: 1 },
      ],
      composicao_resultado_dia: {
        total_liquido: 1175,
        total_diarias: 120,
        total_comissoes: 30,
        ajustes_manuais: 15,
        total_final: 1040,
      },
      cancelamentos_por_dia: [
        { data_referencia: '2026-06-07', quantidade: 1, valor: 80 },
        { data_referencia: '2026-06-08', quantidade: 0, valor: 0 },
      ],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: 99, role: 'admin', roles: ['admin'] },
    isLoading: false,
    hasRole: (roles: string | string[]) => {
      const allowed = Array.isArray(roles) ? roles : [roles];
      return allowed.includes('admin');
    },
  });
  mockUnitFetch.mockImplementation(() => mockJsonResponse(createFinanceiroFixture()));
});

describe('FinanceiroPage', () => {
  test('renderiza filtros, cards, gráficos e descritivos financeiros', async () => {
    render(<FinanceiroPage />);

    expect(await screen.findByText('Financeiro')).toBeInTheDocument();
    expect(await screen.findByLabelText('Data início')).toBeInTheDocument();
    expect(screen.getByLabelText('Data fim')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dia')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeInTheDocument();

    expect(screen.getByText('Total bruto')).toBeInTheDocument();
    expect(screen.getByText('Total líquido')).toBeInTheDocument();
    expect(screen.getByText('Resultado final')).toBeInTheDocument();
    expect(screen.getByText('Diárias')).toBeInTheDocument();
    expect(screen.getAllByText('Comissões').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ajustes').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*1\.675,00/).length).toBeGreaterThan(0);

    expect(screen.getByText('Evolução do período')).toBeInTheDocument();
    expect(screen.getByText('Recebimento por método')).toBeInTheDocument();
    expect(screen.getByText('Composição do resultado')).toBeInTheDocument();
    expect(screen.getByText('Cancelamentos por dia')).toBeInTheDocument();
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(4);

    expect(screen.getByText('Resumo dia a dia')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receitas recebidas no período' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Maria' })[0]).toHaveAttribute('href', '/clientes/77');
    expect(screen.getAllByText('Paula').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pagamento do dia conferido').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'João' })).toHaveAttribute('href', '/clientes/88');
    expect(screen.getByText('Receita do segundo dia')).toBeInTheDocument();

    expect(mockUnitFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/financeiro\?/));
    const requestUrl = mockUnitFetch.mock.calls.at(-1)?.[0] as string;
    const params = new URLSearchParams(requestUrl.split('?')[1]);
    expect(params.has('data')).toBe(false);
    expect(params.get('data_inicio')).toBeTruthy();
    expect(params.get('data_fim')).toBeTruthy();
  });

  test('refaz a consulta quando altera o período', async () => {
    render(<FinanceiroPage />);

    const input = await screen.findByLabelText('Data início');
    fireEvent.change(input, { target: { value: '2026-06-01' } });

    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith(expect.stringContaining('data_inicio=2026-06-01'));
    });
  });

  test('resumo dia a dia não funciona como filtro de data', async () => {
    render(<FinanceiroPage />);

    expect(await screen.findByText('Resumo dia a dia')).toBeInTheDocument();
    const resumoTable = screen.getByRole('table', { name: 'Resumo financeiro dia a dia' });
    const requestsBeforeClick = mockUnitFetch.mock.calls.length;
    fireEvent.click(within(resumoTable).getByText('08/06/2026'));

    expect(screen.queryByLabelText('Dia')).not.toBeInTheDocument();
    expect(mockUnitFetch).toHaveBeenCalledTimes(requestsBeforeClick);
  });

  test('bloqueia usuário não admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 55, role: 'atendente', roles: ['atendente'] },
      isLoading: false,
      hasRole: (roles: string | string[]) => {
        const allowed = Array.isArray(roles) ? roles : [roles];
        return allowed.includes('atendente');
      },
    });

    render(<FinanceiroPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
    expect(mockUnitFetch).not.toHaveBeenCalled();
  });
});
