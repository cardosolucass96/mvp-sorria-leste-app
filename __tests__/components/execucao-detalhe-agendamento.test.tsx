import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ExecucaoProcedimentoPage from '@/app/execucao/[id]/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockToastWarning = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '10' }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 4, nome: 'Dra. Marina', role: 'executor', roles: ['executor'] },
  }),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: {
      success: jest.fn(),
      error: jest.fn(),
      warning: mockToastWarning,
      info: jest.fn(),
    },
  }),
}));

jest.mock('@/components/domain', () => ({
  EvolucaoConclusaoModal: ({ open }: { open: boolean }) => (
    open ? <div data-testid="evolucao-modal">Nova evolução clínica</div> : null
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  ProntuarioDrawer: () => null,
}));

jest.mock('@/components/ui', () => ({
  Alert: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div role="alert">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  ),
  LoadingState: ({ text }: { text: string }) => <div>{text}</div>,
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => (
    isOpen ? <div>{children}</div> : null
  ),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  ConfirmDialog: () => null,
}));

function mockJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function itemEmExecucao(possuiAgendamentoAtivo: number) {
  return {
    id: 10,
    atendimento_id: 50,
    procedimento_id: 20,
    executor_id: 4,
    criado_por_id: 3,
    valor: 250,
    valor_final: 250,
    valor_pago: 250,
    adicionado_em_execucao: 0,
    dentes: null,
    quantidade: 1,
    por_dente: 0,
    status: 'executando',
    created_at: '2026-07-30T12:00:00.000Z',
    concluido_at: null,
    procedimento_nome: 'Limpeza',
    executor_nome: 'Dra. Marina',
    criado_por_nome: 'Dr. Paulo',
    cliente_nome: 'Maria Silva',
    cliente_id: 7,
    etapas: [],
    etapa_label: null,
    tem_etapas: 0,
    possui_agendamento_ativo: possuiAgendamentoAtivo,
    itens_elegiveis_evolucao: [
      {
        id: 10,
        atendimento_id: 50,
        procedimento_nome: 'Limpeza',
        etapa_label: null,
        status: 'executando',
        concluido_at: null,
        possui_agendamento_ativo: possuiAgendamentoAtivo,
      },
    ],
  };
}

function prepararRespostas(possuiAgendamentoAtivo: number) {
  mockUnitFetch.mockImplementation((url: string) => {
    if (url.endsWith('/anexos')) return mockJsonResponse([]);
    if (url.endsWith('/prontuario')) return mockJsonResponse({ prontuario: null });
    return mockJsonResponse(itemEmExecucao(possuiAgendamentoAtivo));
  });
  global.fetch = jest.fn(() => mockJsonResponse([])) as jest.Mock;
}

describe('Execução de procedimento com agendamento ativo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('bloqueia a conclusão antes de abrir o modal', async () => {
    prepararRespostas(1);

    render(<ExecucaoProcedimentoPage />);

    expect(await screen.findByText('Agendado para outra sessão')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar Evolução e Concluir' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('evolucao-modal')).not.toBeInTheDocument();
  });

  test('mantém a evolução disponível quando não existe agendamento ativo', async () => {
    prepararRespostas(0);

    render(<ExecucaoProcedimentoPage />);

    const concluir = await screen.findByRole('button', { name: 'Criar Evolução e Concluir' });
    fireEvent.click(concluir);

    await waitFor(() => expect(screen.getByTestId('evolucao-modal')).toBeInTheDocument());
    expect(mockToastWarning).not.toHaveBeenCalled();
  });
});
