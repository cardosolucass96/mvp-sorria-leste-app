import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AtendimentosPage from '@/app/atendimentos/page';

const mockUnitFetch = jest.fn();

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

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('@/components/domain', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
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

jest.mock('@/components/ui/PageHeader', () => ({
  __esModule: true,
  default: ({
    title,
    actions,
  }: {
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));

jest.mock('@/components/ui/LoadingState', () => ({
  __esModule: true,
  default: () => <div>Carregando...</div>,
}));

jest.mock('@/components/ui/Alert', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));

jest.mock('@/components/ui/Table', () => ({
  __esModule: true,
  default: ({
    caption,
    columns,
    data,
  }: {
    caption: string;
    columns: Array<{ key: string; render?: (item: Record<string, unknown>, index: number) => React.ReactNode }>;
    data: Array<Record<string, unknown>>;
  }) => (
    <div>
      <div>{caption}</div>
      {data.map((item, index) => (
        <div key={String(item.id ?? index)}>
          {columns.map((column) => (
            <div key={column.key}>
              {column.render ? column.render(item, index) : String(item[column.key] ?? '')}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('@/components/ui/Button', () => ({
  __esModule: true,
  default: ({
    children,
    type = 'button',
  }: {
    children: React.ReactNode;
    type?: 'button' | 'submit' | 'reset';
  }) => <button type={type}>{children}</button>,
}));

jest.mock('@/components/ui/Input', () => ({
  __esModule: true,
  default: ({
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
      <span>{label}</span>
      <input
        aria-label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  ),
}));

jest.mock('@/components/ui/Select', () => ({
  __esModule: true,
  default: ({
    label,
    name,
    value,
    onChange,
    options,
    placeholder,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder || 'Selecione...'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

jest.mock('@/components/ui/ElapsedTime', () => ({
  __esModule: true,
  default: ({ inicio }: { inicio: string }) => <span>{inicio}</span>,
}));

function mockJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function getSearchParamsFromUrl(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnitFetch.mockImplementation(() => mockJsonResponse([]));
});

describe('AtendimentosPage', () => {
  test('carrega a tela com o período padrão de hoje ou em fluxo', async () => {
    render(<AtendimentosPage />);

    await waitFor(() => expect(mockUnitFetch).toHaveBeenCalled());

    const firstUrl = String(mockUnitFetch.mock.calls[0][0]);
    const params = getSearchParamsFromUrl(firstUrl);

    expect(params.get('periodo')).toBe('hoje_ou_fluxo');
  });

  test('refaz a busca quando o período muda', async () => {
    render(<AtendimentosPage />);

    await waitFor(() => expect(mockUnitFetch).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Período'), {
      target: { value: '7dias' },
    });

    await waitFor(() => expect(mockUnitFetch.mock.calls.length).toBeGreaterThanOrEqual(2));

    const lastUrl = String(mockUnitFetch.mock.calls[mockUnitFetch.mock.calls.length - 1][0]);
    const params = getSearchParamsFromUrl(lastUrl);

    expect(params.get('periodo')).toBe('7dias');
  });

  test('oculta atendimentos encerrados no kanban e os exibe na lista', async () => {
    mockUnitFetch.mockImplementation(() => mockJsonResponse([
      {
        id: 12,
        cliente_nome: 'Miguel Cavalcante',
        status: 'encerrado',
        created_at: '2026-07-13T10:00:00.000Z',
      },
    ]));

    render(<AtendimentosPage />);

    await waitFor(() => expect(mockUnitFetch).toHaveBeenCalled());

    expect(screen.queryByText('Miguel Cavalcante')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));

    expect(screen.getByText('Miguel Cavalcante')).toBeInTheDocument();
    expect(screen.getByText('encerrado')).toBeInTheDocument();
  });
});
