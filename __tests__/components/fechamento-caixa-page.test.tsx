import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import FechamentoCaixaPage from '@/app/fechamento-caixa/page';
import type { FechamentoCaixaResponse } from '@/lib/fechamento-caixa/types';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();
const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

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

jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  return {
    ...actual,
    useToast: () => ({
      toast: mockToast,
      dismiss: jest.fn(),
      toasts: [],
    }),
  };
});

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

function createResponseFixture(): FechamentoCaixaResponse {
  const base = {
    data_referencia: '2026-06-07',
    unidade_id: 1,
    unidade_nome: 'Unidade Centro',
    editado_manual: true,
    ajustes_count: 2,
    resumo: {
      faturamento_dia: 1200,
      faturamento_por_metodo: [{ metodo: 'pix', total: 1200, quantidade: 2 }],
      procedimentos_executados: 1,
      total_diarias: 120,
      total_comissao_avaliacao: 30,
      total_comissao_execucao: 0,
      ajustes_manuais: 15,
      total_final: 1065,
      pagamentos_cancelados_dia: { quantidade: 1, valor: 80 },
    },
    graficos: {
      procedimentos_por_quantidade: [{ nome: 'Limpeza', quantidade: 1, valor_total: 250 }],
      ranking_avaliadores: [{ usuario_id: 5, nome: 'Dra. Alice', valor_gerado: 250, quantidade: 1 }],
      ranking_executores: [{ usuario_id: 5, nome: 'Dra. Alice', valor_gerado: 250, quantidade: 1 }],
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
      ajustes: [{
        tipo: 'diaria_override' as const,
        label: 'Diária ajustada manualmente',
        motivo: 'Cobriu um turno extra',
        antes: 100,
        depois: 120,
      }],
      lancamentos_manuais: [],
      total_dia: 150,
      procedimentos_executados: [{
        key: 'item:1',
        item_id: 1,
        atendimento_id: 1,
        cliente_nome: 'Maria',
        procedimento_nome: 'Limpeza',
        procedimento_label: 'Limpeza',
        valor: 250,
        concluido_at: '2026-06-07 10:30:00',
        included: true,
        manualmente_editado: true,
        ajustes: [{
          tipo: 'procedimento_valor_override' as const,
          label: 'Valor do procedimento ajustado manualmente',
          motivo: 'Conferido na revisão',
          antes: 230,
          depois: 250,
        }],
        ranking_avaliadores: [{ usuario_id: 5, nome: 'Dra. Alice', valor_gerado: 250, valor_comissao: 30, origem: 'avaliacao' as const }],
        ranking_executores: [{ usuario_id: 5, nome: 'Dra. Alice', valor_gerado: 250 }],
      }],
    }],
    lancamentos_manuais_gerais: [],
    pagamentos_recebidos_dia: [{
      id: 'grupo:1',
      pagamento_grupo_id: 1,
      pagamento_representante_id: 501,
      atendimento_id: 1,
      cliente_id: 77,
      cliente_nome: 'Maria',
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
          observacoes: 'Entrada principal',
          cancelado: false,
          motivo_cancelamento: null,
          created_at: '2026-06-07 09:20:00',
        },
        {
          id: 502,
          valor: 500,
          metodo: 'cartao_credito',
          observacoes: null,
          cancelado: false,
          motivo_cancelamento: null,
          created_at: '2026-06-07 09:21:00',
        },
      ],
    },
    {
      id: 'grupo:2',
      pagamento_grupo_id: 2,
      pagamento_representante_id: 503,
      atendimento_id: 2,
      cliente_id: 88,
      cliente_nome: 'João',
      valor_total: 300,
      observacoes: null,
      cancelado: true,
      motivo_cancelamento: 'Cliente desistiu da forma parcelada',
      created_at: '2026-06-07 11:10:00',
      recebido_por_id: 13,
      recebido_por_nome: 'Carla',
      formas: [
        {
          id: 503,
          valor: 300,
          metodo: 'crediario',
          observacoes: 'Parcelado em acordo interno',
          cancelado: true,
          motivo_cancelamento: 'Cliente desistiu da forma parcelada',
          created_at: '2026-06-07 11:10:00',
        },
      ],
    }],
  };

  return {
    fechamento: {
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
    draft: {
      profissionais: {},
      procedimentos: {},
      lancamentos_manuais: [],
    },
    base,
    resultado: base,
    recentes: [{
      id: 10,
      data_referencia: '2026-06-07',
      status: 'fechado',
      editado_manual: true,
      ajustes_count: 2,
      fechado_por_nome: 'Gerente',
      fechado_em: '2026-06-07 18:30:00',
    }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockUseAuth.mockReturnValue({
    user: { id: 99, role: 'admin', roles: ['admin'] },
    isLoading: false,
    isAdmin: true,
    hasRole: (roles: string | string[]) => {
      const allowed = Array.isArray(roles) ? roles : [roles];
      return allowed.includes('admin');
    },
  });

  mockUnitFetch.mockImplementation(() => mockJsonResponse(createResponseFixture()));
});

describe('FechamentoCaixaPage', () => {
  test('carrega fechamento fechado, mostra alertas de revisão e trava ações de edição', async () => {
    render(<FechamentoCaixaPage />);

    expect(await screen.findByText('Fechamento de Caixa')).toBeInTheDocument();
    expect(screen.getByText(/Este fechamento contém 2 ajuste\(s\) manual\(is\)\./i)).toBeInTheDocument();
    expect(screen.getByText(/Fechado por Gerente em/i)).toBeInTheDocument();
    expect(screen.getAllByText('Editado manualmente').length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: /Salvar revisão/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fechar caixa/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Reabrir$/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Imprimir PDF/i })).not.toBeDisabled();

    expect(mockUnitFetch).toHaveBeenCalledTimes(1);
    expect(mockUnitFetch.mock.calls[0][0]).toMatch(/^\/api\/fechamento-caixa\?data=\d{4}-\d{2}-\d{2}$/);
  });

  test('mostra o filtro de um único dia e os blocos principais do resumo', async () => {
    render(<FechamentoCaixaPage />);

    expect(await screen.findByLabelText('Dia')).toBeInTheDocument();
    expect(screen.getByText('Histórico recente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pagamentos recebidos no dia' })).toBeInTheDocument();
    expect(screen.getByText('Entradas por método')).toBeInTheDocument();
    expect(screen.getByText('Cancelamentos do dia')).toBeInTheDocument();
    expect(screen.getByText('Detalhamento por dentista')).toBeInTheDocument();
    expect(screen.getByText('Comissão avaliação + acréscimos')).toBeInTheDocument();
    expect(screen.getByText('Procedimentos executados no dia com comissão de avaliação ou acréscimo')).toBeInTheDocument();
    expect(screen.getByText('Paula')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do dia conferido')).toBeInTheDocument();
    expect(screen.queryByText('Boas práticas')).not.toBeInTheDocument();
    expect(screen.queryByText('Comissão execução')).not.toBeInTheDocument();

    expect((await screen.findAllByText('Dra. Alice')).length).toBeGreaterThan(0);
  });

  test('permite acesso para atendente sem redirecionar', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 55, role: 'atendente', roles: ['atendente'] },
      isLoading: false,
      isAdmin: false,
      hasRole: (roles: string | string[]) => {
        const allowed = Array.isArray(roles) ? roles : [roles];
        return allowed.includes('atendente');
      },
    });

    render(<FechamentoCaixaPage />);

    expect(await screen.findByText('Fechamento de Caixa')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockUnitFetch).toHaveBeenCalledTimes(1);
  });

  test('inclui descritivo completo dos pagamentos no HTML do PDF', async () => {
    jest.useFakeTimers();

    const documentWrite = jest.fn();
    const documentClose = jest.fn();
    const focus = jest.fn();
    const print = jest.fn();
    const openSpy = jest.spyOn(window, 'open').mockReturnValue({
      document: {
        write: documentWrite,
        close: documentClose,
      },
      focus,
      print,
    } as unknown as Window);

    try {
      render(<FechamentoCaixaPage />);

      expect(await screen.findByText('Fechamento de Caixa')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Imprimir PDF/i }));

      expect(openSpy).toHaveBeenCalledWith('', '_blank');
      expect(documentWrite).toHaveBeenCalledTimes(1);
      expect(documentClose).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledTimes(1);

      const html = documentWrite.mock.calls[0][0] as string;
      expect(html).toContain('Pagamentos recebidos no dia');
      expect(html).toContain('Descritivo');
      expect(html).toContain('Pagamento do dia conferido');
      expect(html).toContain('PIX: Entrada principal');
      expect(html).toContain('Motivo do cancelamento: Cliente desistiu da forma parcelada');
      expect(html).toContain('Crediário: Parcelado em acordo interno');

      act(() => {
        jest.runAllTimers();
      });

      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      openSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
