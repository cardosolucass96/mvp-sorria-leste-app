import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ProntuarioDrawer from '@/components/domain/ProntuarioDrawer';

const mockApiFetch = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: (roles: string[]) => roles.includes('executor'),
  }),
}));

jest.mock('@/lib/utils/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/components/ui/_shadcn/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('@/components/ui/Tabs', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/ui/Button', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

jest.mock('@/components/ui/Spinner', () => ({
  __esModule: true,
  default: () => <span>Carregando</span>,
}));

jest.mock('@/components/ui/Alert', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));

jest.mock('@/components/domain', () => ({
  AnexosGallery: ({
    anexos,
  }: {
    anexos: Array<{ nome: string; url: string }>;
  }) => (
    <div>
      {anexos.map((anexo) => (
        <div
          key={anexo.url}
          role="img"
          aria-label={anexo.nome}
          data-src={anexo.url}
        />
      ))}
    </div>
  ),
}));

jest.mock('@/components/domain/prontuario/AbaDados', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaAtendimentos', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaProcedimentos', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaPagamentos', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaProntuario', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaHistorico', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/domain/prontuario/AbaVinculos', () => ({
  __esModule: true,
  default: () => null,
}));

function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

describe('ProntuarioDrawer', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/clientes/42') {
        return jsonResponse({ id: 42, nome: 'Paulo Sergio' });
      }
      if (url === '/api/clientes/42/ficha') {
        return jsonResponse({
          atendimentos: [],
          procedimentos: [],
          pagamentos: [],
          historico: [],
          prontuarios: [],
          movimentacoes: [],
        });
      }
      if (url === '/api/clientes/42/anexos') {
        return jsonResponse([
          {
            id: 7,
            nome_arquivo: 'WhatsApp Image 2026-07-18 at 09.45.11.jpeg',
            tipo_arquivo: 'image/jpeg',
            caminho: 'clientes/42/WhatsApp Image 2026-07-18 at 09.45.11.jpeg',
            tamanho: 140_595,
            descricao: null,
            created_at: '2026-07-18 09:46:00',
          },
        ]);
      }
      throw new Error(`URL inesperada: ${url}`);
    });
  });

  it('usa o proxy de arquivos existente e preserva os segmentos do caminho', async () => {
    render(
      <ProntuarioDrawer
        clienteId={42}
        open
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('img', {
          name: 'WhatsApp Image 2026-07-18 at 09.45.11.jpeg',
        }),
      ).toHaveAttribute(
        'data-src',
        '/api/arquivos/clientes/42/WhatsApp%20Image%202026-07-18%20at%2009.45.11.jpeg',
      );
    });
  });
});
