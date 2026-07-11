import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AgendaPage from '@/app/agenda/page';
import {
  endOfAgendaMonth,
  endOfAgendaWeek,
  formatAgendaRangeEnd,
  formatAgendaRangeStart,
  startOfAgendaMonth,
  startOfAgendaWeek,
} from '@/lib/utils/agendaCalendar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();
const mockAgendaCalendario = jest.fn();
const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

jest.mock('next/link', () => {
  function MockNextLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return <a href={href} {...props}>{children}</a>;
  }

  return MockNextLink;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
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

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('@/components/domain', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  ProntuarioDrawer: () => null,
  AgendaCalendario: (props: {
    agendamentos: Array<{ id: number }>;
    view: 'mes' | 'semana';
    onViewChange: (view: 'mes' | 'semana') => void;
    onSelectDay: (date: Date | null) => void;
  }) => {
    mockAgendaCalendario(props);
    return (
      <div data-testid="agenda-calendario">
        <div data-testid="agenda-calendario-view">{props.view}</div>
        <button type="button" onClick={() => props.onViewChange('mes')}>Mês</button>
        <button type="button" onClick={() => props.onViewChange('semana')}>Semana</button>
        <button type="button" onClick={() => props.onSelectDay(new Date('2026-07-15T00:00:00'))}>Selecionar dia</button>
        {props.agendamentos.map((agendamento) => agendamento.id).join(',')}
      </div>
    );
  },
  ViewModeToggle: ({
    options,
    active,
    onChange,
  }: {
    options: Array<{ key: string; label: string }>;
    active: string;
    onChange: (key: string) => void;
  }) => (
    <div aria-label="Modo de visualização">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={active === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

function makeAgendamento(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    cliente_id: 101,
    procedimento_id: 201,
    executor_id: 10,
    executor_nome: 'Dra. Ana',
    data_agendada: '2026-07-15T09:00',
    status: 'agendado',
    tipo: 'procedimento',
    created_at: '2026-07-10 10:00:00',
    cliente_nome: 'Maria Silva',
    cliente_telefone: '85999990000',
    procedimento_nome: 'Limpeza',
    etapa_modelo_nome: null,
    pago: 0,
    atendimento_status: null,
    atendimento_id: null,
    ...overrides,
  };
}

function getLastUnitFetchUrl(): string {
  const lastCall = mockUnitFetch.mock.calls[mockUnitFetch.mock.calls.length - 1];
  return String(lastCall?.[0] ?? '');
}

function getSearchParamsFromLastUnitFetch(): URLSearchParams {
  const url = getLastUnitFetchUrl();
  const query = url.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();

  mockUseAuth.mockReturnValue({
    user: { id: 2, nome: 'Recepção', role: 'atendente', roles: ['atendente'] },
    isLoading: false,
    currentUnidade: 1,
    hasRole: (roles: string | string[]) => {
      const values = Array.isArray(roles) ? roles : [roles];
      return values.includes('atendente');
    },
  });

  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/usuarios?unidade_id=1') {
      return mockJsonResponse([
        { id: 10, nome: 'Dra. Ana', role: 'executor', roles: ['executor'], ativo: 1 },
        { id: 11, nome: 'Recepção', role: 'atendente', roles: ['atendente'], ativo: 1 },
        { id: 12, nome: 'Dr. Caio', role: 'admin', roles: ['admin', 'avaliador'], ativo: 1 },
        { id: 13, nome: 'Dra. Lívia', role: 'atendente', roles: ['ortodontista'], ativo: 1 },
        { id: 14, nome: 'Dr. Igor', role: 'executor', roles: ['executor'], ativo: 0 },
      ]);
    }

    if (url === '/api/procedimentos') {
      return mockJsonResponse([]);
    }

    return mockJsonResponse({ clientes: [] });
  }) as jest.Mock;

  mockUnitFetch.mockImplementation(() =>
    mockJsonResponse({
      items: [],
      total: 0,
      page: 1,
      pages: 1,
    })
  );
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('AgendaPage', () => {
  test('renderiza agendamentos da lista quando a API retorna formato paginado', async () => {
    mockUnitFetch.mockImplementation(() =>
      mockJsonResponse({
        items: [makeAgendamento()],
        total: 1,
        page: 1,
        pages: 1,
      })
    );

    render(<AgendaPage />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('1 cliente(s) · 1 agendamento(s)')).toBeInTheDocument();
  });

  test('permite filtrar a agenda por dentista para atendente', async () => {
    render(<AgendaPage />);

    const dentistaSelect = await screen.findByLabelText(/Dentista/i);

    expect(screen.getByRole('option', { name: 'Dra. Ana' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dr. Caio' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dra. Lívia' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Recepção' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Dr. Igor' })).not.toBeInTheDocument();

    fireEvent.change(dentistaSelect, { target: { value: '10' } });

    await waitFor(() => {
      expect(
        mockUnitFetch.mock.calls.some(([url]) => String(url).includes('executor_id=10'))
      ).toBe(true);
    });
  });

  test('mantém os cards operacionais na lateral quando seleciona um dia no calendário', async () => {
    localStorage.setItem('agenda-view-mode', 'calendario');

    mockUnitFetch.mockImplementation((url: string) => {
      if (url.includes('page=')) {
        return mockJsonResponse({
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        });
      }

      return mockJsonResponse([
        makeAgendamento({ id: 7, cliente_nome: 'Carlos Lima', data_agendada: '2026-07-15T14:00' }),
      ]);
    });

    render(<AgendaPage />);

    expect(await screen.findByTestId('agenda-calendario')).toHaveTextContent('7');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar dia' }));

    expect(await screen.findByText('Carlos Lima')).toBeInTheDocument();
    expect(screen.getByText(/15 de julho de 2026/i)).toBeInTheDocument();
  });

  test('persiste o submodo semanal do calendário', async () => {
    localStorage.setItem('agenda-view-mode', 'calendario');
    localStorage.setItem('agenda-calendar-subview', 'semana');

    mockUnitFetch.mockImplementation((url: string) => {
      if (url.includes('page=')) {
        return mockJsonResponse({
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        });
      }

      return mockJsonResponse([makeAgendamento({ id: 9 })]);
    });

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agenda-calendario-view')).toHaveTextContent('semana');
    });

    expect(localStorage.getItem('agenda-calendar-subview')).toBe('semana');
    expect(mockAgendaCalendario).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'semana' })
    );
  });

  test('altera o range consultado ao trocar de mês para semana no calendário', async () => {
    localStorage.setItem('agenda-view-mode', 'calendario');

    mockUnitFetch.mockImplementation((url: string) => {
      if (url.includes('page=')) {
        return mockJsonResponse({
          items: [],
          total: 0,
          page: 1,
          pages: 1,
        });
      }

      return mockJsonResponse([makeAgendamento({ id: 15 })]);
    });

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agenda-calendario')).toBeInTheDocument();
    });

    const initialParams = getSearchParamsFromLastUnitFetch();
    const today = new Date();
    expect(initialParams.get('data_inicio')).toBe(formatAgendaRangeStart(startOfAgendaMonth(today)));
    expect(initialParams.get('data_fim')).toBe(formatAgendaRangeEnd(endOfAgendaMonth(today)));

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    await waitFor(() => {
      const params = getSearchParamsFromLastUnitFetch();
      expect(params.get('data_inicio')).toBe(formatAgendaRangeStart(startOfAgendaWeek(today)));
      expect(params.get('data_fim')).toBe(formatAgendaRangeEnd(endOfAgendaWeek(today)));
    });
  });

  test('mantém o filtro por dentista também no modo semanal', async () => {
    localStorage.setItem('agenda-view-mode', 'calendario');
    localStorage.setItem('agenda-calendar-subview', 'semana');

    mockUnitFetch.mockImplementation((url: string) => {
      if (url.includes('executor_id=10')) {
        return mockJsonResponse([
          makeAgendamento({ id: 10, executor_id: 10, executor_nome: 'Dra. Ana', cliente_nome: 'Paciente Filtrado' }),
        ]);
      }

      return mockJsonResponse([
        makeAgendamento({ id: 8, executor_id: 12, executor_nome: 'Dr. Caio', cliente_nome: 'Paciente Geral' }),
      ]);
    });

    render(<AgendaPage />);

    const dentistaSelect = await screen.findByLabelText(/Dentista/i);
    fireEvent.change(dentistaSelect, { target: { value: '10' } });

    await waitFor(() => {
      const params = getSearchParamsFromLastUnitFetch();
      expect(params.get('executor_id')).toBe('10');
      expect(params.get('page')).toBeNull();
      expect(params.get('data_inicio')).toBe(formatAgendaRangeStart(startOfAgendaWeek(new Date())));
    });

    await waitFor(() => {
      expect(mockAgendaCalendario).toHaveBeenCalledWith(
        expect.objectContaining({
          view: 'semana',
          agendamentos: expect.arrayContaining([expect.objectContaining({ id: 10, cliente_nome: 'Paciente Filtrado' })]),
        })
      );
    });
  });
});
