import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import HomePage from '@/app/page';

const mockUnitFetch = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/lib/utils/usePageTitle', () => jest.fn());

function mockJsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomePage', () => {
  test('admin em modo dentista consulta o dashboard como admin e mostra a soma da fila de avaliacao', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 99, nome: 'Lucas Admin', role: 'admin', roles: ['admin'] },
      effectiveRole: 'executor',
      viewMode: 'dentista',
    });

    mockUnitFetch.mockImplementation(() => mockJsonResponse({
      totalClientes: 0,
      atendimentosHoje: 0,
      aguardandoPagamento: 0,
      finalizadosHoje: 0,
      emExecucao: 0,
      emAvaliacao: 4,
      minhasComissoes: 0,
      meusProcedimentos: 2,
      procedimentosDisponiveis: 1,
      meusAtendimentosAvaliacao: 3,
      atendimentosDisponiveisAvaliacao: 2,
    }));

    render(<HomePage />);

    expect(await screen.findByText('Área do Dentista')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockUnitFetch).toHaveBeenCalledWith('/api/dashboard?usuario_id=99&role=admin');
    });

    const filaCard = screen.getByText('Fila Avaliação').closest('a');
    expect(filaCard).not.toBeNull();
    expect(within(filaCard as HTMLElement).getByText('5')).toBeInTheDocument();

    const meusProcedimentosCard = screen.getAllByText('Meus Procedimentos')[0].closest('a');
    expect(meusProcedimentosCard).not.toBeNull();
    expect(within(meusProcedimentosCard as HTMLElement).getByText('2')).toBeInTheDocument();
  });
});
