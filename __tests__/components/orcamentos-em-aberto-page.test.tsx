import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import OrcamentosEmAbertoPage from '@/app/orcamentos-em-aberto/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();

let atendimentoStatus = 'em_execucao';
let prepararPagamentoOk = true;
let prepararPagamentoErro = 'Falha ao preparar atendimento';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

function buildOrcamentosResponse(status = atendimentoStatus) {
  return {
    summary: {
      valor_total_aberto: 800,
      orcamentos_abertos: 1,
      procedimentos_abertos: 2,
      sem_agendamento: 1,
      agendamento_sem_data: 0,
      agendado_com_data: 1,
    },
    items: [
      {
        atendimento_id: 77,
        atendimento_status: status,
        cliente_id: 101,
        cliente_nome: 'Maria Silva',
        cliente_telefone: '85999990000',
        orcamento_em: '2026-07-11 09:00:00',
        valor_total_aberto: 800,
        procedimentos: [
          {
            key: 'grupo:grupo-restauracao:etapa:item',
            item_id: 10,
            item_ids: [10, 11],
            procedimento_id: 201,
            procedimento_nome: 'Restauração',
            etapa_modelo_id: null,
            etapa_label: null,
            por_dente: true,
            group_id: 'grupo-restauracao',
            dentes_labels: ['11(V,D)', '12M'],
            quantidade_dentes: 2,
            valor_total: 400,
            valor_pago: 0,
            saldo_aberto: 400,
            situacao_agendamento: 'sem_agendamento',
            agendamento_id: null,
            agendamento_status: null,
            data_agendada: null,
            agendamentos_ativos: 0,
            resumo_agendamento: null,
            referencia_em: '2026-07-11 09:05:00',
          },
          {
            key: 'item:11:etapa:item',
            item_id: 12,
            item_ids: [12],
            procedimento_id: 202,
            procedimento_nome: 'Canal',
            etapa_modelo_id: 7,
            etapa_label: 'Sessão 1',
            por_dente: false,
            group_id: null,
            dentes_labels: [],
            quantidade_dentes: 0,
            valor_total: 400,
            valor_pago: 0,
            saldo_aberto: 400,
            situacao_agendamento: 'agendado_com_data',
            agendamento_id: 301,
            agendamento_status: 'agendado',
            data_agendada: '2026-07-20 10:00:00',
            agendamentos_ativos: 1,
            resumo_agendamento: null,
            referencia_em: '2026-07-11 09:10:00',
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  atendimentoStatus = 'em_execucao';
  prepararPagamentoOk = true;
  prepararPagamentoErro = 'Falha ao preparar atendimento';

  mockUseAuth.mockReturnValue({
    user: { id: 2, role: 'atendente', roles: ['atendente'] },
    isLoading: false,
    hasRole: (roles: string | string[]) => {
      const values = Array.isArray(roles) ? roles : [roles];
      return values.includes('atendente');
    },
  });

  mockUnitFetch.mockImplementation((url: string, init?: { method?: string }) => {
    if (url === '/api/orcamentos-em-aberto') {
      return mockJsonResponse(buildOrcamentosResponse());
    }

    if (url === '/api/atendimentos/77' && init?.method === 'PUT') {
      if (!prepararPagamentoOk) {
        return mockJsonResponse({ error: prepararPagamentoErro }, { ok: false, status: 400 });
      }

      return mockJsonResponse({ id: 77, status: 'aguardando_pagamento' });
    }

    return mockJsonResponse({ error: `Unhandled request: ${url}` }, { ok: false, status: 500 });
  });
});

describe('OrcamentosEmAbertoPage', () => {
  test('renderiza grupos com procedimentos agrupados por dente e dispara ações rápidas corretas', async () => {
    const user = userEvent.setup();
    render(<OrcamentosEmAbertoPage />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Restauração')).toBeInTheDocument();
    expect(screen.getByText('Canal — Sessão 1')).toBeInTheDocument();
    expect(screen.getByText('Dentes: 11(V,D), 12M')).toBeInTheDocument();
    expect(screen.getByText('Procedimentos')).toBeInTheDocument();
    expect(screen.getByText('Orçamentos em Aberto')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Abrir followup/i }));
    expect(mockPush).toHaveBeenCalledWith('/followup?open=1&cliente_id=101&tipo=orcamento');

    await user.click(screen.getByRole('button', { name: /Novo agendamento/i }));
    const novoAgendamentoUrl = String(mockPush.mock.calls[mockPush.mock.calls.length - 1][0]);
    expect(novoAgendamentoUrl).toContain('/agenda?');
    expect(novoAgendamentoUrl).toContain('open=1');
    expect(novoAgendamentoUrl).toContain('cliente_id=101');
    expect(novoAgendamentoUrl).toContain('procedimento_id=201');
    expect(novoAgendamentoUrl).toContain('item_origem_id=10');
    expect(novoAgendamentoUrl).toContain('atendimento_origem_id=77');

    await user.click(screen.getByRole('button', { name: /Editar agendamento/i }));
    expect(mockPush).toHaveBeenLastCalledWith('/agenda?edit=301');
  });

  test('prepara atendimento em execução e abre a tela de pagamento', async () => {
    const user = userEvent.setup();
    render(<OrcamentosEmAbertoPage />);

    await screen.findByText('Maria Silva');
    await user.click(screen.getByRole('button', { name: /Ir para pagamento/i }));

    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith(
        '/api/atendimentos/77',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ status: 'aguardando_pagamento' }),
        })
      );
    });
    expect(mockPush).toHaveBeenCalledWith('/atendimentos/77/pagamento');
  });

  test('abre pagamento direto quando atendimento já aguarda pagamento', async () => {
    atendimentoStatus = 'aguardando_pagamento';
    const user = userEvent.setup();
    render(<OrcamentosEmAbertoPage />);

    await screen.findByText('Maria Silva');
    await user.click(screen.getByRole('button', { name: /Ir para pagamento/i }));

    expect(mockUnitFetch).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/atendimentos/77/pagamento');
  });

  test('exibe erro quando não consegue preparar pagamento', async () => {
    prepararPagamentoOk = false;
    prepararPagamentoErro = 'Transição bloqueada';
    const user = userEvent.setup();
    render(<OrcamentosEmAbertoPage />);

    await screen.findByText('Maria Silva');
    await user.click(screen.getByRole('button', { name: /Ir para pagamento/i }));

    expect(await screen.findByText('Transição bloqueada')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalledWith('/atendimentos/77/pagamento');
  });
});
