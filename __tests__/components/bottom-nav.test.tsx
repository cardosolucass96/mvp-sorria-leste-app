import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import BottomNav from '@/components/layout/BottomNav';

const mockUsePathname = jest.fn();
const mockUseAuth = jest.fn();
const mockUseCategoriasFila = jest.fn();

jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/hooks/useCategoriasFila', () => ({
  useCategoriasFila: () => mockUseCategoriasFila(),
}));

jest.mock('@/components/ui/_shadcn/sheet', () => {
  const React = require('react');
  const SheetContext = React.createContext(false);

  return {
    Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
      <SheetContext.Provider value={open}>{children}</SheetContext.Provider>
    ),
    SheetContent: ({ children }: { children: React.ReactNode }) => {
      const open = React.useContext(SheetContext);
      return open ? <div>{children}</div> : null;
    },
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePathname.mockReturnValue('/');
});

describe('BottomNav', () => {
  test('mostra atalhos de filas dinâmicas no menu Mais do mobile', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 10, nome: 'Dra. Ana', role: 'executor', roles: ['executor', 'ortodontista'] },
      effectiveRole: 'executor',
      hasRole: (roles: string | string[]) => {
        const roleList = Array.isArray(roles) ? roles : [roles];
        return roleList.some((role) => ['executor', 'ortodontista'].includes(role));
      },
    });

    mockUseCategoriasFila.mockReturnValue([
      {
        id: 1,
        nome: 'Ortodontia',
        slug: 'orto',
        cor: 'info',
        icone: 'Smile',
        ativo: 1,
        ordem: 1,
        pula_avaliacao: 1,
        created_at: '2026-07-16T00:00:00.000Z',
        roles: ['ortodontista'],
      },
    ]);

    render(<BottomNav />);

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));

    expect(screen.getByRole('link', { name: /Fila Ortodontia/i })).toHaveAttribute('href', '/fila/orto');
  });
});
