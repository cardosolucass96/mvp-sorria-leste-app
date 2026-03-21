/**
 * Testes de componentes UI com @testing-library/react
 * Ambiente: jsdom
 * Sprint 6 Revisão – Componentes primitivos
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ─── Button ──────────────────────────────────────────────────────

import Button from '@/components/ui/Button';

describe('Button', () => {
  test('renderiza com texto', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  test('variante primary é padrão', () => {
    render(<Button>OK</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary');
  });

  test('variante danger', () => {
    render(<Button variant="danger">Excluir</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-error');
  });

  test('click handler funciona', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Clique</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('disabled impede click', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick} disabled>Desabilitado</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('loading mostra aria-busy', () => {
    render(<Button loading>Carregando</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
  });

  test('type="submit" funciona', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  test('type padrão é button', () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

// ─── Badge ───────────────────────────────────────────────────────

import Badge from '@/components/ui/Badge';

describe('Badge', () => {
  test('renderiza texto', () => {
    render(<Badge>Ativo</Badge>);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  test('variante green aplica classe success', () => {
    render(<Badge color="green">OK</Badge>);
    expect(screen.getByText('OK').className).toContain('success');
  });

  test('variante red aplica classe error', () => {
    render(<Badge color="red">Erro</Badge>);
    expect(screen.getByText('Erro').className).toContain('error');
  });
});

// ─── Alert ───────────────────────────────────────────────────────

import Alert from '@/components/ui/Alert';

describe('Alert', () => {
  test('renderiza mensagem', () => {
    render(<Alert type="info">Informação</Alert>);
    expect(screen.getByText('Informação')).toBeInTheDocument();
  });

  test('tipo error tem role=alert', () => {
    render(<Alert type="error">Erro</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('tipo info renderiza', () => {
    render(<Alert type="info">Info</Alert>);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  test('dismissível pode fechar', async () => {
    render(<Alert type="warning" dismissible>Aviso</Alert>);
    const closeBtn = screen.getByLabelText(/fechar/i);
    await userEvent.click(closeBtn);
    expect(screen.queryByText('Aviso')).not.toBeInTheDocument();
  });
});

// ─── Card ────────────────────────────────────────────────────────

import Card from '@/components/ui/Card';

describe('Card', () => {
  test('renderiza children', () => {
    render(<Card>Conteúdo do card</Card>);
    expect(screen.getByText('Conteúdo do card')).toBeInTheDocument();
  });

  test('aceita className', () => {
    const { container } = render(<Card className="custom">Teste</Card>);
    expect(container.firstChild).toHaveClass('custom');
  });
});

// ─── EmptyState ──────────────────────────────────────────────────

import EmptyState from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  test('renderiza título e descrição', () => {
    render(<EmptyState icon="📭" title="Nada aqui" description="Sem dados ainda" />);
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
    expect(screen.getByText('Sem dados ainda')).toBeInTheDocument();
  });

  test('botão de ação renderiza e funciona', async () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        icon="➕"
        title="Vazio"
        description="Clique para criar"
        actionLabel="Criar"
        onAction={onAction}
      />
    );
    const btn = screen.getByRole('button', { name: 'Criar' });
    await userEvent.click(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

// ─── PageHeader ──────────────────────────────────────────────────

import PageHeader from '@/components/ui/PageHeader';

// Mock next/link 
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

describe('PageHeader', () => {
  test('renderiza título', () => {
    render(<PageHeader title="Clientes" />);
    expect(screen.getByRole('heading', { level: 1, name: /Clientes/ })).toBeInTheDocument();
  });

  test('renderiza ícone e descrição', () => {
    render(<PageHeader title="Teste" icon="🦷" description="Uma descrição" />);
    expect(screen.getByText('🦷')).toBeInTheDocument();
    expect(screen.getByText('Uma descrição')).toBeInTheDocument();
  });

  test('renderiza botão voltar quando backHref é fornecido', () => {
    render(<PageHeader title="Detalhe" backHref="/clientes" />);
    const link = screen.getByText(/Voltar/);
    expect(link.closest('a')).toHaveAttribute('href', '/clientes');
  });

  test('renderiza ações', () => {
    render(
      <PageHeader
        title="Lista"
        actions={<button>Nova ação</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Nova ação' })).toBeInTheDocument();
  });
});

// ─── StatCard ────────────────────────────────────────────────────

import StatCard from '@/components/ui/StatCard';

describe('StatCard', () => {
  test('renderiza label e valor', () => {
    render(<StatCard icon="💰" label="Total" value="R$ 5.000,00" />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('R$ 5.000,00')).toBeInTheDocument();
  });
});

// ─── Spinner ─────────────────────────────────────────────────────

import Spinner from '@/components/ui/Spinner';

describe('Spinner', () => {
  test('renderiza SVG com animate-spin', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  test('tem aria-hidden (decorativo por padrão)', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

// ─── Divider ─────────────────────────────────────────────────────

import Divider from '@/components/ui/Divider';

describe('Divider', () => {
  test('renderiza separador horizontal', () => {
    render(<Divider />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  test('renderiza com label', () => {
    render(<Divider label="ou" />);
    expect(screen.getByText('ou')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  test('renderiza vertical', () => {
    render(<Divider orientation="vertical" />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
  });
});
