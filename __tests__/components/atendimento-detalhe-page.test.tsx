import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AtendimentoDetalhePage from '@/app/atendimentos/[id]/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();
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

jest.mock('@/components/domain', () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  StatusPipeline: ({ currentStatus }: { currentStatus: string }) => <div data-testid="status-pipeline">{currentStatus}</div>,
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
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => isOpen ? <div>{children}</div> : null,
  Select: () => null,
  Input: () => null,
  Textarea: () => null,
  useToast: () => ({
    toast: {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
    },
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

function makeAtendimento(status: string) {
  return {
    id: 10,
    cliente_id: 1,
    cliente_nome: 'Lucas Cardoso',
    cliente_cpf: null,
    cliente_telefone: '(85) 99655-6359',
    cliente_email: 'lucas.cardoso@grupovorp.com',
    avaliador_id: null,
    avaliador_nome: null,
    liberado_por_nome: null,
    status,
    tipo: 'normal',
    categoria_id: 1,
    created_at: '2026-06-04 20:00:00',
    liberado_em: null,
    finalizado_at: null,
    itens: [
      {
        id: 101,
        procedimento_nome: 'Restauração Estética',
        etapa_label: null,
        executor_id: null,
        executor_nome: null,
        criado_por_nome: 'Lucas Cardoso',
        valor: 300,
        valor_pago: status === 'aguardando_pagamento' ? 300 : 0,
        status: status === 'em_execucao' ? 'pago' : 'pendente',
        group_id: null,
        dentes: null,
        dente_unico: '21',
        progresso_etapas: null,
      },
    ],
    total: 300,
    total_pago: status === 'aguardando_pagamento' ? 300 : 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  jest.spyOn(React, 'use').mockImplementation(<T,>(value: T | Promise<T>) => {
    if (value && typeof (value as Promise<T>).then === 'function') {
      return { id: '10' } as T;
    }
    return actualReactUse(value as React.Usable<T>);
  });

  mockUseAuth.mockReturnValue({
    user: { id: 1, role: 'admin', roles: ['admin'] },
    hasRole: (roles: string | string[]) => {
      const values = Array.isArray(roles) ? roles : [roles];
      return values.includes('admin');
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderPage(status: string) {
  mockUnitFetch.mockImplementation((url: string) => {
    if (url === '/api/atendimentos/10') {
      return mockJsonResponse(makeAtendimento(status));
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  render(<AtendimentoDetalhePage params={Promise.resolve({ id: '10' })} />);
  await screen.findByRole('heading', { name: 'Atendimento #10' });
}

describe('AtendimentoDetalhePage rollback seguro', () => {
  test('em avaliacao exibe botão "Voltar para Triagem"', async () => {
    await renderPage('avaliacao');
    expect(screen.getByRole('button', { name: 'Voltar para Triagem' })).toBeInTheDocument();
  });

  test('em aguardando_pagamento exibe botão "Voltar para Avaliação"', async () => {
    await renderPage('aguardando_pagamento');
    expect(screen.getByRole('button', { name: 'Voltar para Avaliação' })).toBeInTheDocument();
  });

  test('em em_execucao exibe botão "Voltar para Aguardando Pagamento"', async () => {
    await renderPage('em_execucao');
    expect(screen.getByRole('button', { name: 'Voltar para Aguardando Pagamento' })).toBeInTheDocument();
  });

  test.each(['triagem', 'finalizado', 'encerrado'])(
    'em %s não exibe botão de rollback',
    async (status) => {
      await renderPage(status);
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Voltar para/i })).not.toBeInTheDocument();
      });
    }
  );
});

describe('AtendimentoDetalhePage fluxo de pagamento', () => {
  test('mantém o CTA crítico apontando para a etapa de pagamento/destino no código-fonte', () => {
    const pagePath = path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx');
    const source = fs.readFileSync(pagePath, 'utf-8');

    expect(source).toContain("confirmLabel: 'Definir destinos'");
    expect(source).toContain("router.push(`/atendimentos/${id}/pagamento`)");
    expect(source).not.toContain("await handleMudarStatus('em_execucao');");
  });
});
