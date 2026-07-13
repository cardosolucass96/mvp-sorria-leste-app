/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import PagamentoPage from '@/app/atendimentos/[id]/pagamento/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockApiFetch = jest.fn();
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
    return React.createElement('a', { href, ...props }, children);
  }

  return MockNextLink;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUnidade: 1,
  }),
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

jest.mock('@/components/ui/Alert', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', { role: 'alert' }, children),
}));

jest.mock('@/components/ui/LoadingState', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => React.createElement('div', null, text),
}));

jest.mock('@/components/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
  Button: ({
    children,
    onClick,
    type = 'button',
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }) => React.createElement('button', { type, onClick }, children),
  Card: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  CardContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  CardDescription: ({ children }: { children: React.ReactNode }) => React.createElement('p', null, children),
  CardFooter: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  CardHeader: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  CardTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
  Checkbox: ({
    label,
    name,
    checked,
    onChange,
  }: {
    label: string;
    name: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
  }) => React.createElement(
    'label',
    null,
    React.createElement('input', {
      type: 'checkbox',
      name,
      checked,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.checked),
    }),
    label
  ),
  Divider: () => React.createElement('hr'),
  Input: ({
    label,
    name,
    value,
    onChange,
    type = 'text',
  }: {
    label: string;
    name: string;
    value?: string;
    onChange?: (value: string) => void;
    type?: string;
  }) => React.createElement(
    'label',
    null,
    label,
    React.createElement('input', {
      name,
      type,
      value: value ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value),
    })
  ),
  Select: ({
    label,
    name,
    options,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    name: string;
    options: Array<{ value: string; label: string } | { label: string; options: Array<{ value: string; label: string }> }>;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => React.createElement(
    'label',
    null,
    label,
    React.createElement(
      'select',
      {
        name,
        value: value ?? '',
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value),
      },
      placeholder ? React.createElement('option', { value: '' }, placeholder) : null,
      ...options.flatMap((option) => (
        'options' in option
          ? option.options.map((groupOption) => React.createElement('option', { key: groupOption.value, value: groupOption.value }, groupOption.label))
          : React.createElement('option', { key: option.value, value: option.value }, option.label)
      ))
    )
  ),
  Textarea: ({
    label,
    name,
    value,
    onChange,
  }: {
    label: string;
    name: string;
    value?: string;
    onChange?: (value: string) => void;
  }) => React.createElement(
    'label',
    null,
    label,
    React.createElement('textarea', {
      name,
      value: value ?? '',
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
    })
  ),
}));

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

describe('PagamentoPage runtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(React, 'use').mockImplementation(<T,>(value: T | Promise<T>) => {
      if (value && typeof (value as Promise<T>).then === 'function') {
        return { id: '14' } as T;
      }
      return actualReactUse(value as React.Usable<T>);
    });

    mockUnitFetch.mockImplementation((url: string) => {
      if (url === '/api/atendimentos/14') {
        return mockJsonResponse({
          id: 14,
          cliente_id: 2,
          cliente_nome: 'Maria Souza',
          status: 'aguardando_pagamento',
          motivo_saida: null,
          total: 450,
          total_pago: 0,
          itens: [
            {
              id: 101,
              procedimento_id: 9,
              procedimento_nome: 'Limpeza',
              valor: 450,
              valor_original: 450,
              valor_final: null,
              valor_pago: 0,
              desconto_valor: 0,
              desconto_motivo: null,
              status: 'pendente',
              executor_id: null,
              dente_unico: null,
              etapas: [],
              financeiro_status: 'nao_pago',
              saldo: 450,
              destino_status: 'agendar',
              destino_data_agendada: null,
              destino_executor_id: null,
            },
          ],
        });
      }

      if (url === '/api/atendimentos/14/pagamentos?grouped=1') {
        return mockJsonResponse([]);
      }

      if (url === '/api/formas-pagamento') {
        return mockJsonResponse([
          {
            id: 1,
            unidade_id: 1,
            grupo: 'PIX',
            subgrupo: '',
            metodo_base: 'pix',
            ativo: 1,
            taxa_percentual: 0.5,
            taxa_fixa: 0,
            vigente_de: '2025-01-01 00:00:00',
            vigente_ate: null,
            created_at: '2025-01-01 00:00:00',
            updated_at: '2025-01-01 00:00:00',
          },
        ]);
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    mockApiFetch.mockResolvedValue(mockJsonResponse([
      { id: 7, nome: 'Dra. Ana Executor', role: 'executor', roles: ['executor'], ativo: 1 },
    ]));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('carrega a tela sem quebrar a ordem dos hooks após sair do loading', async () => {
    render(React.createElement(PagamentoPage, { params: Promise.resolve({ id: '14' }) }));

    expect(screen.getByText('Carregando pagamento...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    });

    expect(screen.getByText('Pagamentos registrados')).toBeInTheDocument();
    expect(screen.queryByText('Carregando pagamento...')).not.toBeInTheDocument();
  });
});
