import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import AtendimentoDetalhePage from '@/app/atendimentos/[id]/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();
const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};
const scrollToMock = jest.fn();
const actualReactUse = React.use;

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
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/print', () => ({
  finalizarJanelaDeImpressao: jest.fn(),
}));

jest.mock('@/components/domain', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  StatusPipeline: ({ currentStatus }: { currentStatus: string }) => <div>{currentStatus}</div>,
  AnexosGallery: () => <div data-testid="anexos-gallery">Galeria de anexos</div>,
}));

jest.mock('@/components/ui/SearchableSelect', () => ({
  __esModule: true,
  default: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

jest.mock('@/components/ui', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  LoadingState: ({ text }: { text: string }) => <div>{text}</div>,
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  ConfirmDialog: () => null,
  Modal: ({
    children,
    isOpen,
    bodyRef,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    bodyRef?: React.Ref<HTMLDivElement>;
  }) => (
    isOpen ? (
      <div data-testid="procedimento-modal">
        <div data-testid="procedimento-modal-body" ref={bodyRef}>{children}</div>
      </div>
    ) : null
  ),
  Select: ({
    label,
    value,
    onChange,
    options,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? 'Selecione'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
  Input: ({
    label,
    name,
    value,
    onChange,
    type = 'text',
    placeholder,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  ),
  Textarea: ({
    label,
    name,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  ),
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock('@/components/SeletorDentes', () => ({
  __esModule: true,
  default: () => <div data-testid="seletor-dentes" />,
}));

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

const atendimentoData = {
  id: 10,
  cliente_id: 1,
  cliente_nome: 'Lucas Cardoso',
  cliente_cpf: null,
  cliente_telefone: '(85) 99999-9999',
  cliente_email: 'lucas@example.com',
  unidade_id: 1,
  unidade_nome: 'Unidade Centro',
  unidade_razao_social: 'Sorria Leste',
  unidade_cnpj: null,
  unidade_endereco: null,
  unidade_telefone: null,
  unidade_email: null,
  unidade_responsavel: null,
  unidade_recibo_rodape: null,
  avaliador_id: 3,
  avaliador_nome: 'Dra. Ana Avaliadora',
  liberado_por_nome: null,
  status: 'avaliacao',
  tipo: 'normal',
  categoria_id: 1,
  motivo_saida: null,
  created_at: '2026-07-18 09:00:00',
  liberado_em: null,
  finalizado_at: null,
  itens: [],
  total: 0,
  total_pago: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollToMock,
  });

  jest.spyOn(React, 'use').mockImplementation(<T,>(value: T | Promise<T>) => {
    if (value && typeof (value as Promise<T>).then === 'function') {
      return { id: '10' } as T;
    }
    return actualReactUse(value as React.Usable<T>);
  });

  mockUseAuth.mockReturnValue({
    user: { id: 1, role: 'admin', roles: ['admin'] },
    currentUnidade: 1,
    hasRole: () => true,
  });

  mockUnitFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/atendimentos/10' && !init) {
      return mockJsonResponse(atendimentoData);
    }

    if (url === '/api/atendimentos/10/itens' && init?.method === 'POST') {
      return mockJsonResponse({ id: 99 });
    }

    throw new Error(`Unhandled unitFetch request: ${url}`);
  });

  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/procedimentos') {
      return mockJsonResponse([
        { id: 1, nome: 'Limpeza Dental', valor: 150, por_dente: 0, tem_face: 0, tem_etapas: 0 },
      ]);
    }

    if (url === '/api/usuarios?categoria_id=1') {
      return mockJsonResponse([
        { id: 8, nome: 'Dr. Executor', role: 'executor', roles: ['executor'] },
      ]);
    }

    if (url === '/api/clientes/1/anexos') {
      return mockJsonResponse([]);
    }

    throw new Error(`Unhandled fetch request: ${url}`);
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AtendimentoDetalhePage modal de procedimento', () => {
  it('rola o modal para o alerta quando falta selecionar dente obrigatório', async () => {
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/procedimentos') {
        return mockJsonResponse([
          { id: 1, nome: 'Implante', valor: 1000, por_dente: 1, tem_face: 0, tem_etapas: 0 },
        ]);
      }

      if (url === '/api/usuarios?categoria_id=1') {
        return mockJsonResponse([
          { id: 8, nome: 'Dr. Executor', role: 'executor', roles: ['executor'] },
        ]);
      }

      if (url === '/api/clientes/1/anexos') {
        return mockJsonResponse([]);
      }

      throw new Error(`Unhandled fetch request: ${url}`);
    });

    render(<AtendimentoDetalhePage params={Promise.resolve({ id: '10' })} />);

    await screen.findByRole('heading', { name: 'Atendimento #10' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Adicionar Procedimento' }));
    });

    const modal = await screen.findByTestId('procedimento-modal');

    fireEvent.change(within(modal).getByLabelText('Procedimento *'), {
      target: { value: '1' },
    });

    await act(async () => {
      fireEvent.click(within(modal).getByRole('button', { name: /\+ Adicionar/i }));
    });

    const alertText = await within(modal).findByText('Selecione pelo menos um dente para este procedimento');

    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth',
      });
    });
    expect(alertText.closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('espelha anexos e envia observacoes ao adicionar procedimento', async () => {
    render(<AtendimentoDetalhePage params={Promise.resolve({ id: '10' })} />);

    await screen.findByRole('heading', { name: 'Atendimento #10' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Adicionar Procedimento' }));
    });

    const modal = await screen.findByTestId('procedimento-modal');

    expect(within(modal).getByText('Fotos e anexos da avaliação')).toBeInTheDocument();
    expect(within(modal).getByLabelText('Obs / Laudo (opcional)')).toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText('Procedimento *'), {
      target: { value: '1' },
    });
    fireEvent.change(within(modal).getByLabelText('Obs / Laudo (opcional)'), {
      target: { value: 'Paciente com sensibilidade no lado esquerdo' },
    });

    await act(async () => {
      fireEvent.click(within(modal).getByRole('button', { name: /\+ Adicionar/i }));
    });

    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith(
        '/api/atendimentos/10/itens',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = mockUnitFetch.mock.calls.find(
      ([url, init]: [string, RequestInit | undefined]) =>
        url === '/api/atendimentos/10/itens' && init?.method === 'POST'
    );

    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      procedimento_id: 1,
      observacoes: 'Paciente com sensibilidade no lado esquerdo',
    });
  });
});
