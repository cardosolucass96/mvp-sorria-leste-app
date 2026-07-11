import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AtendimentoDetalhePage from '@/app/atendimentos/[id]/page';

const mockPush = jest.fn();
const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();
const mockFinalizarJanelaDeImpressao = jest.fn();
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
  finalizarJanelaDeImpressao: (...args: unknown[]) => mockFinalizarJanelaDeImpressao(...args),
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

function makePrintWindow() {
  return {
    document: {
      write: jest.fn(),
      close: jest.fn(),
      readyState: 'loading',
    },
    addEventListener: jest.fn(),
    setTimeout: jest.fn(),
    focus: jest.fn(),
    print: jest.fn(),
  } as unknown as Window;
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
        criado_por_id: 1,
        criado_por_nome: 'Lucas Cardoso',
        valor: 300,
        valor_original: 300,
        valor_final: null,
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

function makeAtendimentoAgrupado(status = 'triagem') {
  return {
    ...makeAtendimento(status),
    itens: [
      {
        id: 101,
        procedimento_nome: 'Restauração Estética',
        etapa_label: null,
        executor_id: null,
        executor_nome: null,
        criado_por_id: 1,
        criado_por_nome: 'Lucas Cardoso',
        valor: 300,
        valor_original: 300,
        valor_final: null,
        valor_pago: 0,
        status: 'pendente',
        group_id: 'grupo-restauracao',
        dentes: null,
        dente_unico: '21',
        progresso_etapas: null,
      },
      {
        id: 102,
        procedimento_nome: 'Restauração Estética',
        etapa_label: null,
        executor_id: null,
        executor_nome: null,
        criado_por_id: 1,
        criado_por_nome: 'Lucas Cardoso',
        valor: 320,
        valor_original: 320,
        valor_final: null,
        valor_pago: 0,
        status: 'pendente',
        group_id: 'grupo-restauracao',
        dentes: null,
        dente_unico: '22',
        progresso_etapas: null,
      },
    ],
    total: 620,
    total_pago: 0,
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
    currentUnidade: 1,
    hasRole: (roles: string | string[]) => {
      const values = Array.isArray(roles) ? roles : [roles];
      return values.includes('admin');
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderPage(status: string, atendimentoData = makeAtendimento(status)) {
  mockUnitFetch.mockImplementation((url: string) => {
    if (url === '/api/atendimentos/10') {
      return mockJsonResponse(atendimentoData);
    }
    if (url === '/api/usuarios?role=avaliador&unidade_id=1') {
      return mockJsonResponse([
        { id: 3, nome: 'Dr. João Avaliador', role: 'avaliador', roles: ['avaliador'] },
      ]);
    }
    if (url === '/api/usuarios?unidade_id=1') {
      return mockJsonResponse([
        { id: 1, nome: 'Lucas Cardoso', role: 'admin', roles: ['admin'], ativo: 1 },
        { id: 2, nome: 'Ana Atendente', role: 'atendente', roles: ['atendente'], ativo: 1 },
        { id: 3, nome: 'Dr. João Avaliador', role: 'avaliador', roles: ['avaliador'], ativo: 1 },
      ]);
    }
    throw new Error(`Unhandled request: ${url}`);
  });

  render(<AtendimentoDetalhePage params={Promise.resolve({ id: '10' })} />);
  await screen.findByRole('heading', { name: 'Atendimento #10' });

  if (status === 'triagem') {
    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith('/api/usuarios?unidade_id=1');
    });
    await act(async () => {});
  }
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

describe('AtendimentoDetalhePage impressão', () => {
  test('em finalizado exibe botão "Imprimir recibos"', async () => {
    await renderPage('finalizado');

    expect(screen.getByRole('button', { name: 'Imprimir recibos' })).toBeInTheDocument();
  });

  test('imprime recibos somente com a seção de pagamentos', async () => {
    await renderPage('finalizado', {
      ...makeAtendimento('finalizado'),
      total_pago: 300,
      finalizado_at: '2026-06-05 15:00:00',
    });

    const printWindow = makePrintWindow();
    jest.spyOn(window, 'open').mockReturnValue(printWindow);

    mockUnitFetch.mockImplementation((url: string) => {
      if (url === '/api/atendimentos/10/pagamentos?grouped=1') {
        return mockJsonResponse([
          {
            id: 'grupo:1',
            valor_total: 300,
            observacoes: 'Entrada do tratamento',
            cancelado: 0,
            motivo_cancelamento: null,
            created_at: '2026-06-05 15:10:00',
            recebido_por_nome: 'Ana Atendente',
            formas: [
              {
                id: 77,
                valor: 300,
                metodo: 'pix',
                observacoes: 'Entrada do tratamento',
                cancelado: 0,
                motivo_cancelamento: null,
                created_at: '2026-06-05 15:10:00',
              },
            ],
          },
        ]);
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Imprimir recibos' }));
    });

    await waitFor(() => {
      expect(printWindow.document.write).toHaveBeenCalled();
    });

    const html = (printWindow.document.write as jest.Mock).mock.calls[0][0] as string;

    expect(html).toContain('Recibos de Pagamento');
    expect(html).toContain('<h2>Pagamentos</h2>');
    expect(html).not.toContain('<h2>Procedimentos realizados</h2>');
    expect(html).toContain('PIX');
    expect(html).toContain('Ana Atendente');
    expect(mockFinalizarJanelaDeImpressao).toHaveBeenCalledWith(printWindow);
  });
});

describe('AtendimentoDetalhePage triagem editável', () => {
  test('em triagem renderiza seletor de avaliador, limpar avaliador e ações do item', async () => {
    await renderPage('triagem');

    expect(await screen.findByRole('combobox', { name: 'Avaliador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar avaliador' })).toBeDisabled();
    expect(screen.getByLabelText(/Editar valor de Restauração Estética/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendedor do item 101' })).toBeInTheDocument();
    expect(screen.getByTitle('Clique para trocar executor')).toBeInTheDocument();
    expect(screen.getByTitle('Remover')).toBeInTheDocument();
  });

  test('fora da triagem o avaliador continua somente leitura', async () => {
    await renderPage('avaliacao');

    expect(screen.queryByRole('combobox', { name: 'Avaliador' })).not.toBeInTheDocument();
    expect(screen.getByText('Não definido')).toBeInTheDocument();
  });

  test('em itens agrupados a edição de valor aparece apenas após expandir as sublinhas', async () => {
    await renderPage('triagem', makeAtendimentoAgrupado());

    expect(screen.queryByLabelText(/Editar valor de Restauração Estética/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Restauração Estética'));

    expect(screen.getAllByLabelText(/Editar valor de Restauração Estética/i)).toHaveLength(2);
  });

  test('em triagem permite abrir o seletor de vendedor do item', async () => {
    await renderPage('triagem');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vendedor do item 101' }));
    });

    expect(screen.getByRole('combobox', { name: 'Vendedor do item 101' })).toBeInTheDocument();
  });

  test('em triagem permite abrir o seletor de vendedor do grupo', async () => {
    await renderPage('triagem', makeAtendimentoAgrupado());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Vendedor do grupo grupo-restauracao' }));
    });

    expect(screen.getByRole('combobox', { name: 'Vendedor do grupo grupo-restauracao' })).toBeInTheDocument();
  });

  test('admin em modo dentista continua vendo controles administrativos da triagem', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'admin', roles: ['admin'] },
      currentUnidade: 1,
      hasRole: (roles: string | string[]) => {
        const values = Array.isArray(roles) ? roles : [roles];
        return values.some((role) => ['avaliador', 'executor', 'ortodontista'].includes(role));
      },
    });

    await renderPage('triagem');

    expect(await screen.findByRole('combobox', { name: 'Avaliador' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Editar valor de Restauração Estética/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendedor do item 101' })).toBeInTheDocument();
  });
});

describe('AtendimentoDetalhePage avaliação com editor compartilhado', () => {
  test('em avaliacao renderiza editor de valor, vendedor, executor e remoção do item simples', async () => {
    await renderPage('avaliacao');

    expect(screen.getByLabelText(/Editar valor de Restauração Estética/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendedor do item 101' })).toBeInTheDocument();
    expect(screen.getByTitle('Clique para trocar executor')).toBeInTheDocument();
    expect(screen.getByTitle('Remover')).toBeInTheDocument();
  });

  test('em avaliacao itens agrupados mantêm vendedor no cabeçalho e valor apenas nas sublinhas', async () => {
    await renderPage('avaliacao', makeAtendimentoAgrupado('avaliacao'));

    expect(screen.getByRole('button', { name: 'Vendedor do grupo grupo-restauracao' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Editar valor de Restauração Estética/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Restauração Estética'));

    expect(screen.getAllByLabelText(/Editar valor de Restauração Estética/i)).toHaveLength(2);
  });

  test('admin em modo dentista continua vendo o editor compartilhado em avaliacao', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, role: 'admin', roles: ['admin'] },
      currentUnidade: 1,
      hasRole: (roles: string | string[]) => {
        const values = Array.isArray(roles) ? roles : [roles];
        return values.some((role) => ['avaliador', 'executor', 'ortodontista'].includes(role));
      },
    });

    await renderPage('avaliacao');

    expect(screen.getByLabelText(/Editar valor de Restauração Estética/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendedor do item 101' })).toBeInTheDocument();
    expect(screen.getByTitle('Clique para trocar executor')).toBeInTheDocument();
  });
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
