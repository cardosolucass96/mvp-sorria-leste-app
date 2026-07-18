import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ClienteDetalhePage from '@/app/clientes/[id]/page';

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUnitFetch = jest.fn();
const actualReactUse = React.use;

jest.mock('next/link', () => {
  const NextLinkMock = ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href as string} {...props}>{children}</a>
  );
  NextLinkMock.displayName = 'NextLinkMock';
  return NextLinkMock;
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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
  ClienteForm: () => null,
  AnexosGallery: () => <div>AnexosGallery</div>,
}));

jest.mock('@/components/ui', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  LoadingState: ({ text }: { text?: string }) => <div>{text || 'Carregando...'}</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  ConfirmDialog: () => null,
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    <button type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Modal: ({
    isOpen,
    title,
    children,
    footer,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => isOpen ? (
    <div>
      <h2>{title}</h2>
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ) : null,
  Tabs: ({
    tabs,
    activeTab,
    onTabChange,
  }: {
    tabs: Array<{ key: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
  }) => (
    <div>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-pressed={activeTab === tab.key}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
  Input: ({
    label,
    name,
    value,
    onChange,
    error,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
  }) => (
    <label>
      <span>{label}</span>
      <input aria-label={label} name={name} value={value} onChange={(e) => onChange(e.target.value)} />
      {error ? <span>{error}</span> : null}
    </label>
  ),
  Textarea: ({
    label,
    name,
    value,
    onChange,
    error,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
  }) => (
    <label>
      <span>{label}</span>
      <textarea aria-label={label} name={name} value={value} onChange={(e) => onChange(e.target.value)} />
      {error ? <span>{error}</span> : null}
    </label>
  ),
}));

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  });
}

describe('ClienteDetalhePage - termos digitais', () => {
  let termosDigitaisMock: Array<Record<string, unknown>>;
  let termosMock: Array<Record<string, unknown>>;

  beforeEach(() => {
    jest.clearAllMocks();
    termosDigitaisMock = [];
    termosMock = [
      { id: 99, slug: 'termo-consentimento', titulo: 'Termo de Consentimento', permite_autentique: 1 },
    ];

    jest.spyOn(React, 'use').mockImplementation(<T,>(value: T | Promise<T>) => {
      if (value && typeof (value as Promise<T>).then === 'function') {
        return { id: '10' } as T;
      }
      return actualReactUse(value as React.Usable<T>);
    });

    mockUseAuth.mockReturnValue({
      user: { id: 1, nome: 'Admin', role: 'admin', roles: ['admin'] },
    });

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/clientes/10')) {
        return jsonResponse({
          id: 10,
          nome: 'Maria Teste',
          cpf: '12345678910',
          telefone: '85999999999',
          email: 'maria@example.com',
          data_nascimento: '1990-01-20',
          endereco: 'Rua Exemplo, 10',
          origem: 'indicacao',
          sexo: 'feminino',
          plano_odontologico: 'Clin',
          observacoes: null,
          created_at: '2026-07-10T12:00:00.000Z',
        });
      }

      if (url.endsWith('/api/clientes/10/ficha')) {
        return jsonResponse({
          atendimentos: [],
          procedimentos: [],
          pagamentos: [],
          pagamentos_alocacoes: [],
          historico: [],
          prontuarios: [],
          movimentacoes: [],
        });
      }

      if (url.endsWith('/api/clientes/10/termos')) {
        return jsonResponse(termosMock);
      }

      if (url.endsWith('/api/clientes/10/termos-digitais')) {
        return jsonResponse(termosDigitaisMock);
      }

      if (url.endsWith('/api/clientes/10/vinculos')) {
        return jsonResponse([]);
      }

      if (url.endsWith('/api/clientes/10/saldo')) {
        return jsonResponse({ saldo: 0, saldo_calculado: 0 });
      }

      if (url.endsWith('/api/clientes/10/anexos')) {
        return jsonResponse([]);
      }

      throw new Error(`fetch não mockado: ${url}`);
    }) as jest.Mock;

    mockUnitFetch.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.startsWith('/api/agendamentos')) {
        return jsonResponse([]);
      }

      if (input.startsWith('/api/followup')) {
        return jsonResponse({ items: [] });
      }

      if (input.endsWith('/render')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const profissional = body.placeholders?.profissional_nome || '';
        return jsonResponse({
          html: `<p><strong class="termo-variable">Maria Teste</strong></p><p><strong class="termo-variable">${profissional}</strong></p>`,
          titulo: 'Termo de Consentimento',
          slug: 'termo-consentimento',
          placeholdersNaoEncontrados: [],
          draft: {
            campos: [
              { key: 'cliente_nome', label: 'Nome do paciente', tipo: 'text', value: 'Maria Teste', required: true, source: 'cliente' },
              { key: 'profissional_nome', label: 'Nome do profissional', tipo: 'text', value: profissional, required: true, source: 'manual' },
            ],
            pendentes: profissional ? [] : ['profissional_nome'],
            placeholdersUsados: ['cliente_nome', 'profissional_nome'],
          },
        });
      }

      if (input.endsWith('/autentique')) {
        termosDigitaisMock = [{
          id: 1,
          cliente_id: 10,
          unidade_id: 1,
          termo_id: 99,
          termo_slug: 'termo-consentimento',
          termo_titulo: 'Termo de Consentimento',
          signatario_nome: 'Maria Teste',
          signatario_cpf: '12345678910',
          signatario_email: 'maria@example.com',
          signatario_telefone: '85999999999',
          placeholders_json: '{"profissional_nome":"Dra. Helena"}',
          html_renderizado: '<p>ok</p>',
          autentique_document_id: 'doc-1',
          autentique_signature_public_id: 'signature-1',
          autentique_short_link: 'https://assina.ae/assinatura-1',
          status: 'criado',
          pdf_assinado_url: null,
          viewed_at: null,
          signed_at: null,
          rejected_at: null,
          finished_at: null,
          created_by: 1,
          created_at: '2026-07-18T12:00:00.000Z',
          updated_at: '2026-07-18T12:00:00.000Z',
        }];

        return jsonResponse({
          documentoId: 'doc-1',
          signaturePublicId: 'signature-1',
          shortLink: 'https://assina.ae/assinatura-1',
          status: 'criado',
        }, { status: 201 });
      }

      throw new Error(`unitFetch não mockado: ${input}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('alterna para digital, revisa os campos e mostra o link gerado', async () => {
    render(<ClienteDetalhePage params={Promise.resolve({ id: '10' })} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gerar termo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gerar termo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Digital no Autentique' }));

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'termo-consentimento' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Nome do paciente')).toHaveValue('Maria Teste');
      expect(screen.getByLabelText('Nome do profissional')).toBeInTheDocument();
    });

    expect(screen.queryByText('Campo obrigatório.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar link no Autentique' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar link no Autentique' }));

    await waitFor(() => {
      expect(screen.getByText(/Preencha os campos obrigatórios antes de gerar o link:/)).toBeInTheDocument();
      expect(screen.getByText('Campo obrigatório.')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Nome do profissional'), {
      target: { value: 'Dra. Helena' },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gerar link no Autentique' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gerar link no Autentique' }));

    await waitFor(() => {
      expect(screen.getByText('Link de assinatura criado')).toBeInTheDocument();
      expect(screen.getByText('https://assina.ae/assinatura-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Anexos' }));

    await waitFor(() => {
      expect(screen.getAllByText('Termo de Consentimento').length).toBeGreaterThan(0);
      expect(screen.getByText('Aguardando assinatura')).toBeInTheDocument();
    });
  });

  it('indica quando o termo selecionado é somente para impressão', async () => {
    termosMock = [
      { id: 101, slug: 'referencia-implante', titulo: 'Referência implante', permite_autentique: 0 },
    ];

    render(<ClienteDetalhePage params={Promise.resolve({ id: '10' })} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Gerar termo' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gerar termo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Digital no Autentique' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'referencia-implante' },
    });

    await waitFor(() => {
      expect(screen.getByText('Este termo é somente para impressão')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disponível só para impressão' })).toBeDisabled();
    });
  });
});
