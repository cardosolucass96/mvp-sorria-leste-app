import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import FollowupPage from '@/app/followup/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUnitFetch = jest.fn();
const mockSearchParamsGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => '');
const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
    toString: mockSearchParamsToString,
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: mockToast,
    dismiss: jest.fn(),
    toasts: [],
  }),
}));

jest.mock('@/components/domain', () => ({
  FollowupCalendario: ({ selectedDay }: { selectedDay: Date | null }) => (
    <div data-testid="followup-calendario">
      {selectedDay ? 'calendario-ativo' : 'calendario-sem-dia'}
    </div>
  ),
}));

function formatUtcIso(date: Date): string {
  return date.toISOString();
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 10,
    cliente_id: 1,
    unidade_id: 1,
    responsavel_usuario_id: 2,
    criado_por_id: 2,
    concluida_por_id: null,
    excluida_por_id: null,
    tipo: 'retorno',
    titulo: 'Ligar para cliente',
    descricao: 'Cliente pediu retorno à tarde',
    status: 'aberta',
    vencimento_em: formatUtcIso(addMinutes(now, 120)),
    nota_conclusao: null,
    concluida_em: null,
    excluida_em: null,
    created_at: formatUtcIso(addDays(now, -1)),
    updated_at: formatUtcIso(addDays(now, -1)),
    cliente_nome: 'Maria Silva',
    cliente_telefone: '85999990000',
    responsavel_usuario_nome: 'Recepção 1',
    criado_por_nome: 'Recepção 1',
    concluida_por_nome: null,
    ...overrides,
  };
}

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockSearchParamsGet.mockReturnValue(null);
  mockSearchParamsToString.mockReturnValue('');

  mockUseAuth.mockReturnValue({
    user: { id: 2, nome: 'Recepção 1', role: 'atendente', roles: ['atendente'] },
    isLoading: false,
    currentUnidade: 1,
    hasRole: (roles: string | string[]) => {
      const values = Array.isArray(roles) ? roles : [roles];
      return values.includes('atendente');
    },
  });

  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/usuarios')) {
      return mockJsonResponse([{ id: 2, nome: 'Recepção 1', role: 'atendente' }]);
    }
    return mockJsonResponse({ clientes: [] });
  }) as jest.Mock;
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('FollowupPage', () => {
  test('abre a página já filtrando pelo responsável logado', async () => {
    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Tarefa do responsável atual' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    render(<FollowupPage />);

    expect(await screen.findByText('Tarefa do responsável atual')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Responsável')).toHaveValue('2');
    });
    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith('/api/followup?responsavel_usuario_id=2');
    });
  });

  test('agrupa tarefas em atrasadas, hoje, próximos 7 dias, depois e concluídas', async () => {
    const now = new Date();
    const items = [
      makeTask({ id: 1, titulo: 'Tarefa atrasada', tipo: 'cobranca', vencimento_em: formatUtcIso(addMinutes(now, -90)) }),
      makeTask({ id: 2, titulo: 'Contato de hoje', tipo: 'retorno', vencimento_em: formatUtcIso(addMinutes(now, 120)) }),
      makeTask({ id: 3, titulo: 'Contato da semana', tipo: 'orcamento', vencimento_em: formatUtcIso(addDays(now, 3)) }),
      makeTask({ id: 4, titulo: 'Contato futuro', tipo: 'outro', vencimento_em: formatUtcIso(addDays(now, 12)) }),
      makeTask({
        id: 5,
        titulo: 'Tarefa concluída',
        status: 'concluida',
        nota_conclusao: 'Contato feito',
        concluida_em: formatUtcIso(addMinutes(now, -20)),
        concluida_por_id: 2,
        concluida_por_nome: 'Recepção 1',
        vencimento_em: formatUtcIso(addDays(now, -1)),
      }),
    ];

    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items,
        summary: {
          abertas: 4,
          atrasadas: 1,
          vencem_hoje: 1,
          concluidas_hoje: 1,
        },
      })
    );

    render(<FollowupPage />);

    expect(await screen.findByRole('heading', { name: 'Atrasadas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Próximos 7 dias' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Depois' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Concluídas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova tarefa/i })).toBeInTheDocument();

    expect(screen.getByText('Tarefa atrasada')).toBeInTheDocument();
    expect(screen.getByText('Contato de hoje')).toBeInTheDocument();
    expect(screen.getByText('Contato da semana')).toBeInTheDocument();
    expect(screen.getByText('Contato futuro')).toBeInTheDocument();
    expect(screen.getByText('Tarefa concluída')).toBeInTheDocument();
  });

  test('admin pode criar tarefa, mas continua sem CTAs de edição da tarefa', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'admin', roles: ['admin'] },
      isLoading: false,
      currentUnidade: 1,
      hasRole: (roles: string | string[]) => {
        const values = Array.isArray(roles) ? roles : [roles];
        return values.includes('admin');
      },
    });

    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Tarefa aberta' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    render(<FollowupPage />);

    expect(await screen.findByText('Tarefa aberta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nova tarefa/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Concluir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir cliente/i })).toBeInTheDocument();
  });

  test('admin responsável pela tarefa vê botão de concluir sem editar ou excluir', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 2, role: 'admin', roles: ['admin'] },
      isLoading: false,
      currentUnidade: 1,
      hasRole: (roles: string | string[]) => {
        const values = Array.isArray(roles) ? roles : [roles];
        return values.includes('admin');
      },
    });

    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Tarefa do admin responsável' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    render(<FollowupPage />);

    expect(await screen.findByText('Tarefa do admin responsável')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Concluir/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir/i })).not.toBeInTheDocument();
  });

  test('usuária com roles admin e atendente consegue concluir tarefa', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'admin', roles: ['admin', 'atendente'] },
      isLoading: false,
      currentUnidade: 1,
      hasRole: (roles: string | string[]) => {
        const values = Array.isArray(roles) ? roles : [roles];
        return values.some((value) => ['admin', 'atendente'].includes(value));
      },
    });

    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Tarefa aberta' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    render(<FollowupPage />);

    expect(await screen.findByText('Tarefa aberta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Concluir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir/i })).toBeInTheDocument();
  });

  test('alterna para calendário e persiste o modo em localStorage', async () => {
    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Calendário' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    const user = userEvent.setup();
    render(<FollowupPage />);

    const calendarButton = await screen.findByRole('button', { name: /Calendário/i });
    await user.click(calendarButton);

    await waitFor(() => {
      expect(localStorage.getItem('followup-view-mode')).toBe('calendario');
    });
    expect(screen.getByTestId('followup-calendario')).toBeInTheDocument();
  });

  test('abre a modal de tarefa mesmo quando a listagem de responsáveis falha', async () => {
    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeTask({ id: 1, titulo: 'Tarefa aberta' })],
        summary: {
          abertas: 1,
          atrasadas: 0,
          vencem_hoje: 1,
          concluidas_hoje: 0,
        },
      })
    );

    global.fetch = jest.fn(() =>
      mockJsonResponse({ error: 'Erro ao buscar usuários' }, { ok: false, status: 500 })
    ) as jest.Mock;

    const user = userEvent.setup();
    render(<FollowupPage />);

    const novaTarefaButton = await screen.findByRole('button', { name: /Nova tarefa/i });
    await user.click(novaTarefaButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: /Responsável/i })).toBeInTheDocument();
  });

  test('pré-preenche o tipo orçamento ao abrir via query string', async () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'open') return '1';
      if (key === 'cliente_id') return '101';
      if (key === 'tipo') return 'orcamento';
      return null;
    });
    mockSearchParamsToString.mockReturnValue('open=1&cliente_id=101&tipo=orcamento');

    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [],
        summary: {
          abertas: 0,
          atrasadas: 0,
          vencem_hoje: 0,
          concluidas_hoje: 0,
        },
      })
    );

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/usuarios')) {
        return mockJsonResponse([{ id: 2, nome: 'Recepção 1' }]);
      }
      if (url === '/api/clientes/101') {
        return mockJsonResponse({
          id: 101,
          nome: 'Maria Silva',
          telefone: '85999990000',
          cpf: null,
        });
      }
      return mockJsonResponse({ clientes: [] });
    }) as jest.Mock;

    render(<FollowupPage />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Maria Silva')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /Tipo/i })).toHaveValue('orcamento');
    expect(mockReplace).toHaveBeenCalledWith('/followup');
  });
});
