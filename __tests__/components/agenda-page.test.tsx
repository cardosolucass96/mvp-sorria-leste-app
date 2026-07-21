import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockSearchParamsGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => '');
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
    observacoes: null,
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

function getUnitFetchCallsMatching(
  predicate: (url: string, init: RequestInit | undefined) => boolean
) {
  return mockUnitFetch.mock.calls.filter(([url, init]) => predicate(String(url), init as RequestInit | undefined));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockSearchParamsGet.mockReturnValue(null);
  mockSearchParamsToString.mockReturnValue('');

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
        { id: 15, nome: 'Admin Puro', role: 'admin', roles: ['admin'], ativo: 1 },
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

  test('não recarrega a agenda nem perde foco enquanto digita na busca', async () => {
    mockUnitFetch.mockImplementation((url: string) => {
      if (url.includes('busca=Maria')) {
        return mockJsonResponse({
          items: [makeAgendamento({ cliente_nome: 'Maria Filtrada' })],
          total: 1,
          page: 1,
          pages: 1,
        });
      }

      return mockJsonResponse({
        items: [makeAgendamento({ cliente_nome: 'Cliente Inicial' })],
        total: 1,
        page: 1,
        pages: 1,
      });
    });

    const user = userEvent.setup();
    render(<AgendaPage />);

    expect(await screen.findByText('Cliente Inicial')).toBeInTheDocument();
    const callsDepoisDoLoad = mockUnitFetch.mock.calls.length;
    const buscaInput = screen.getByLabelText('Buscar cliente');

    await user.click(buscaInput);
    await user.type(buscaInput, 'Maria');

    expect(buscaInput).toHaveFocus();
    expect(mockUnitFetch).toHaveBeenCalledTimes(callsDepoisDoLoad);

    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(getSearchParamsFromLastUnitFetch().get('busca')).toBe('Maria');
    });
    expect(await screen.findByText('Maria Filtrada')).toBeInTheDocument();
  });

  test('permite filtrar a agenda por dentista para atendente', async () => {
    render(<AgendaPage />);

    const dentistaSelect = await screen.findByLabelText(/Dentista/i);

    expect(screen.getByRole('option', { name: 'Dra. Ana' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dr. Caio' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Dra. Lívia' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Admin Puro' })).not.toBeInTheDocument();
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

  test('permite editar um agendamento individual e salvar observações, executor e horário', async () => {
    mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/agendamentos/1' && init?.method === 'PUT') {
        return mockJsonResponse({
          ...makeAgendamento(),
          executor_id: 12,
          executor_nome: 'Dr. Caio',
          data_agendada: '2026-07-16T10:30',
          observacoes: 'Levar exames',
        });
      }

      return mockJsonResponse({
        items: [makeAgendamento()],
        total: 1,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar Agendamento')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Executor (opcional)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Data e hora (opcional)'), { target: { value: '2026-07-16T10:30' } });
    fireEvent.change(screen.getByLabelText('Observações (opcional)'), { target: { value: 'Levar exames' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      const putCalls = getUnitFetchCallsMatching((url, init) => url === '/api/agendamentos/1' && init?.method === 'PUT');
      expect(putCalls).toHaveLength(1);
    });

    const putCall = getUnitFetchCallsMatching((url, init) => url === '/api/agendamentos/1' && init?.method === 'PUT')[0];
    const requestBody = JSON.parse(String((putCall[1] as RequestInit).body));

    expect(requestBody).toEqual({
      executor_id: 12,
      data_agendada: '2026-07-16T10:30',
      observacoes: 'Levar exames',
    });
  });

  test('permite editar em lote apenas os agendamentos ativos do grupo', async () => {
    mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
      if ((url === '/api/agendamentos/1' || url === '/api/agendamentos/2') && init?.method === 'PUT') {
        return mockJsonResponse({
          ...makeAgendamento(),
          id: url.endsWith('/2') ? 2 : 1,
          executor_id: 12,
          executor_nome: 'Dr. Caio',
          data_agendada: '2026-07-18T11:00',
        });
      }

      return mockJsonResponse({
        items: [
          makeAgendamento({ id: 1, procedimento_nome: 'Limpeza', data_agendada: '2026-07-15T09:00', status: 'agendado' }),
          makeAgendamento({ id: 2, procedimento_nome: 'Canal', data_agendada: '2026-07-15T09:30', status: 'pendente' }),
          makeAgendamento({ id: 3, procedimento_nome: 'Raio X', data_agendada: '2026-07-15T10:00', status: 'realizado' }),
        ],
        total: 3,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar grupo' }));

    expect(await screen.findByText('Editar grupo de agendamentos')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nova data e hora (opcional)'), { target: { value: '2026-07-18T11:00' } });
    fireEvent.change(screen.getByLabelText('Executor para todas (opcional)'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      const putCalls = getUnitFetchCallsMatching(
        (url, init) => url.startsWith('/api/agendamentos/') && init?.method === 'PUT'
      );
      expect(putCalls).toHaveLength(2);
    });

    const putCalls = getUnitFetchCallsMatching(
      (url, init) => url.startsWith('/api/agendamentos/') && init?.method === 'PUT'
    );

    expect(putCalls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining(['/api/agendamentos/1', '/api/agendamentos/2'])
    );
    expect(putCalls.map(([url]) => String(url))).not.toContain('/api/agendamentos/3');

    for (const [, init] of putCalls) {
      expect(JSON.parse(String((init as RequestInit).body))).toEqual({
        data_agendada: '2026-07-18T11:00',
        executor_id: 12,
      });
    }
  });

  test('sugere procedimentos pendentes sem pré-seleção e envia o vínculo ao escolher uma sugestão', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/usuarios?unidade_id=1') {
        return mockJsonResponse([
          { id: 10, nome: 'Dra. Ana', role: 'executor', roles: ['executor'], ativo: 1 },
          { id: 11, nome: 'Recepção', role: 'atendente', roles: ['atendente'], ativo: 1 },
          { id: 12, nome: 'Dr. Caio', role: 'admin', roles: ['admin', 'avaliador'], ativo: 1 },
        ]);
      }

      if (url === '/api/procedimentos') {
        return mockJsonResponse([
          { id: 201, nome: 'Limpeza Dental', valor: 150 },
          { id: 202, nome: 'Canal', valor: 480 },
        ]);
      }

      if (url.startsWith('/api/clientes?busca=')) {
        return mockJsonResponse({
          clientes: [
            { id: 101, nome: 'Maria Silva', telefone: '85999990000', cpf: null },
          ],
        });
      }

      return mockJsonResponse({ clientes: [] });
    });

    mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/clientes/101/procedimentos-pendentes') {
        return mockJsonResponse([
          {
            item_id: 77,
            atendimento_id: 10,
            procedimento_id: 201,
            procedimento_nome: 'Limpeza Dental',
            status: 'pendente',
            valor: 150,
            valor_final: 150,
            valor_pago: 0,
            valor_pendente: 150,
            etapa_label: null,
            atendimento_status: 'finalizado',
            motivo_saida: 'continuacao',
            atendimento_created_at: '2026-07-10 09:00:00',
            item_created_at: '2026-07-10 09:30:00',
          },
        ]);
      }

      if (url === '/api/agendamentos' && init?.method === 'POST') {
        return mockJsonResponse({ id: 50 }, { status: 201 });
      }

      return mockJsonResponse({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Novo Agendamento/i }));
    fireEvent.change(await screen.findByPlaceholderText('Digite o nome do cliente...'), {
      target: { value: 'Ma' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Maria Silva/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Procedimento' }));

    const criarButton = screen.getByRole('button', { name: 'Criar Agendamento' });
    const sugestao = await screen.findByRole('button', { name: /Limpeza Dental/i });

    expect(criarButton).toBeDisabled();
    expect(sugestao).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Selecionado')).not.toBeInTheDocument();

    fireEvent.click(sugestao);

    expect(sugestao).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Procedimento pendente vinculado ao agendamento')).toBeInTheDocument();
    expect(criarButton).not.toBeDisabled();

    fireEvent.click(criarButton);

    await waitFor(() => {
      const postCalls = getUnitFetchCallsMatching(
        (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });

    const postCall = getUnitFetchCallsMatching(
      (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
    )[0];

    expect(JSON.parse(String((postCall[1] as RequestInit).body))).toEqual({
      cliente_id: 101,
      procedimento_id: 201,
      item_atendimento_origem_id: 77,
      atendimento_origem_id: 10,
      executor_id: null,
      data_agendada: null,
      observacoes: null,
    });
  });

  test('permite trocar para procedimento do catálogo e limpa o vínculo do procedimento pendente', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/usuarios?unidade_id=1') {
        return mockJsonResponse([
          { id: 10, nome: 'Dra. Ana', role: 'executor', roles: ['executor'], ativo: 1 },
          { id: 11, nome: 'Recepção', role: 'atendente', roles: ['atendente'], ativo: 1 },
          { id: 12, nome: 'Dr. Caio', role: 'admin', roles: ['admin', 'avaliador'], ativo: 1 },
        ]);
      }

      if (url === '/api/procedimentos') {
        return mockJsonResponse([
          { id: 201, nome: 'Limpeza Dental', valor: 150 },
          { id: 202, nome: 'Canal', valor: 480 },
        ]);
      }

      if (url.startsWith('/api/clientes?busca=')) {
        return mockJsonResponse({
          clientes: [
            { id: 101, nome: 'Maria Silva', telefone: '85999990000', cpf: null },
          ],
        });
      }

      return mockJsonResponse({ clientes: [] });
    });

    mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/clientes/101/procedimentos-pendentes') {
        return mockJsonResponse([
          {
            item_id: 77,
            atendimento_id: 10,
            procedimento_id: 201,
            procedimento_nome: 'Limpeza Dental',
            status: 'pendente',
            valor: 150,
            valor_final: 150,
            valor_pago: 0,
            valor_pendente: 150,
            etapa_label: null,
            atendimento_status: 'finalizado',
            motivo_saida: 'continuacao',
            atendimento_created_at: '2026-07-10 09:00:00',
            item_created_at: '2026-07-10 09:30:00',
          },
        ]);
      }

      if (url === '/api/agendamentos' && init?.method === 'POST') {
        return mockJsonResponse({ id: 51 }, { status: 201 });
      }

      return mockJsonResponse({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Novo Agendamento/i }));
    fireEvent.change(await screen.findByPlaceholderText('Digite o nome do cliente...'), {
      target: { value: 'Ma' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Maria Silva/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Procedimento' }));

    const sugestao = await screen.findByRole('button', { name: /Limpeza Dental/i });
    fireEvent.click(sugestao);
    expect(await screen.findByText('Procedimento pendente vinculado ao agendamento')).toBeInTheDocument();

    await waitFor(() => {
      const gatilhoCatalogo = screen
        .getAllByRole('button', { name: /Limpeza Dental/i })
        .find((element) => element.getAttribute('aria-haspopup') === 'listbox');

      expect(gatilhoCatalogo).toBeTruthy();
    });

    const gatilhoCatalogo = screen
      .getAllByRole('button', { name: /Limpeza Dental/i })
      .find((element) => element.getAttribute('aria-haspopup') === 'listbox');

    expect(gatilhoCatalogo).toBeTruthy();
    fireEvent.click(gatilhoCatalogo!);
    fireEvent.click(await screen.findByRole('button', { name: 'Canal' }));

    await waitFor(() => {
      expect(screen.queryByText('Procedimento pendente vinculado ao agendamento')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }));

    await waitFor(() => {
      const postCalls = getUnitFetchCallsMatching(
        (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });

    const postCall = getUnitFetchCallsMatching(
      (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
    )[0];

    expect(JSON.parse(String((postCall[1] as RequestInit).body))).toEqual({
      cliente_id: 101,
      procedimento_id: 202,
      executor_id: null,
      data_agendada: null,
      observacoes: null,
    });
  });

  test('consome o deep link de novo agendamento com etapa pré-selecionada', async () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'open') return '1';
      if (key === 'cliente_id') return '101';
      if (key === 'tipo') return 'procedimento';
      if (key === 'procedimento_id') return '201';
      if (key === 'item_origem_id') return '77';
      if (key === 'atendimento_origem_id') return '10';
      if (key === 'etapa_modelo_id') return '7';
      if (key === 'etapa_label') return 'Sessão 1';
      return null;
    });
    mockSearchParamsToString.mockReturnValue(
      'open=1&cliente_id=101&tipo=procedimento&procedimento_id=201&item_origem_id=77&atendimento_origem_id=10&etapa_modelo_id=7&etapa_label=Sess%C3%A3o+1'
    );

    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/usuarios?unidade_id=1') {
        return mockJsonResponse([
          { id: 10, nome: 'Dra. Ana', role: 'executor', roles: ['executor'], ativo: 1 },
          { id: 12, nome: 'Dr. Caio', role: 'admin', roles: ['admin', 'avaliador'], ativo: 1 },
        ]);
      }

      if (url === '/api/procedimentos') {
        return mockJsonResponse([
          { id: 201, nome: 'Canal', valor: 400 },
        ]);
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
    });

    mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/clientes/101/procedimentos-pendentes') {
        return mockJsonResponse([
          {
            item_id: 77,
            atendimento_id: 10,
            procedimento_id: 201,
            procedimento_nome: 'Canal',
            status: 'pendente',
            valor: 400,
            valor_final: 400,
            valor_pago: 0,
            valor_pendente: 400,
            etapa_label: 'Sessão 1',
            atendimento_status: 'finalizado',
            motivo_saida: 'continuacao',
            atendimento_created_at: '2026-07-10 09:00:00',
            item_created_at: '2026-07-10 09:30:00',
          },
        ]);
      }

      if (url === '/api/agendamentos' && init?.method === 'POST') {
        return mockJsonResponse({ id: 88 }, { status: 201 });
      }

      return mockJsonResponse({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    expect(await screen.findByText('Procedimento pendente vinculado ao agendamento · Sessão 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }));

    await waitFor(() => {
      const postCalls = getUnitFetchCallsMatching(
        (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });

    const postCall = getUnitFetchCallsMatching(
      (url, init) => url === '/api/agendamentos' && init?.method === 'POST'
    )[0];

    expect(JSON.parse(String((postCall[1] as RequestInit).body))).toEqual({
      cliente_id: 101,
      procedimento_id: 201,
      item_atendimento_origem_id: 77,
      atendimento_origem_id: 10,
      etapa_modelo_id: 7,
      executor_id: null,
      data_agendada: null,
      observacoes: null,
    });
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });

  test('consome o deep link de edição de agendamento', async () => {
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'edit') return '1';
      return null;
    });
    mockSearchParamsToString.mockReturnValue('edit=1');

    mockUnitFetch.mockImplementation((url: string) => {
      if (url === '/api/agendamentos/1') {
        return mockJsonResponse(makeAgendamento());
      }

      return mockJsonResponse({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      });
    });

    render(<AgendaPage />);

    expect(await screen.findByText('Editar Agendamento')).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/agenda');
  });
});
