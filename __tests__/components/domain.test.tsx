/**
 * Testes de componentes de domínio com @testing-library/react
 * Ambiente: jsdom
 * Sprint 6 Revisão – StatusBadge, ClienteForm, PagamentoForm, etc.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// ─── StatusBadge ─────────────────────────────────────────────────

import StatusBadge from '@/components/domain/StatusBadge';

describe('StatusBadge', () => {
  test('renderiza label correto para status atendimento', () => {
    render(<StatusBadge type="atendimento" status="triagem" />);
    expect(screen.getByText(/triagem/i)).toBeInTheDocument();
  });

  test('renderiza label correto para status item', () => {
    render(<StatusBadge type="item" status="pendente" />);
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
  });

  test('renderiza label correto para parcela', () => {
    render(<StatusBadge type="parcela" status="paga" />);
    expect(screen.getByText(/pag/i)).toBeInTheDocument();
  });

  test('lida com status desconhecido sem crashar', () => {
    render(<StatusBadge type="atendimento" status="desconhecido" />);
    expect(screen.getByText(/desconhecido/i)).toBeInTheDocument();
  });
});

// ─── ClienteForm ─────────────────────────────────────────────────

import ClienteForm from '@/components/domain/ClienteForm';

describe('ClienteForm', () => {
  const mockSubmit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  test('renderiza todos os campos', () => {
    render(<ClienteForm onSubmit={mockSubmit} />);
    expect(screen.getByLabelText(/Nome Completo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/CPF/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Origem/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Telefone/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  test('mostra erro quando nome vazio ao submeter', async () => {
    render(<ClienteForm onSubmit={mockSubmit} />);
    
    // Select a valid origin to pass that validation
    fireEvent.change(screen.getByLabelText(/Origem/), { target: { value: 'indicacao' } });
    
    // Submit without nome
    fireEvent.submit(screen.getByRole('button', { name: /Salvar/ }).closest('form')!);
    
    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/)).toBeInTheDocument();
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  test('valida CPF inválido', async () => {
    render(<ClienteForm onSubmit={mockSubmit} />);
    
    const nomeInput = screen.getByLabelText(/Nome Completo/);
    const cpfInput = screen.getByLabelText(/CPF/);
    
    await userEvent.type(nomeInput, 'João Silva');
    await userEvent.type(cpfInput, '111.111.111-11');
    fireEvent.change(screen.getByLabelText(/Origem/), { target: { value: 'indicacao' } });
    
    fireEvent.submit(screen.getByRole('button', { name: /Salvar/ }).closest('form')!);
    
    await waitFor(() => {
      expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  test('loading desabilita campos e botão', () => {
    render(<ClienteForm onSubmit={mockSubmit} loading />);
    expect(screen.getByLabelText(/Nome Completo/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeDisabled();
  });

  test('mostra erro de API quando fornecido', () => {
    render(<ClienteForm onSubmit={mockSubmit} error="Erro do servidor" />);
    expect(screen.getByText('Erro do servidor')).toBeInTheDocument();
  });

  test('preenche com initialData em modo edição', () => {
    render(
      <ClienteForm
        onSubmit={mockSubmit}
        initialData={{ nome: 'Maria', email: 'maria@test.com' }}
      />
    );
    expect(screen.getByLabelText(/Nome Completo/)).toHaveValue('Maria');
    expect(screen.getByLabelText(/Email/)).toHaveValue('maria@test.com');
  });

  test('botão cancelar chama onCancel', async () => {
    const onCancel = jest.fn();
    render(<ClienteForm onSubmit={mockSubmit} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});

// ─── PagamentoForm ───────────────────────────────────────────────

import PagamentoForm from '@/components/domain/PagamentoForm';

describe('PagamentoForm', () => {
  const mockSubmit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    mockSubmit.mockClear();
  });

  test('renderiza campos básicos', () => {
    render(<PagamentoForm onSubmit={mockSubmit} />);
    expect(screen.getByLabelText(/Método de Pagamento/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor/)).toBeInTheDocument();
  });

  test('valida método obrigatório', async () => {
    render(<PagamentoForm onSubmit={mockSubmit} />);
    
    fireEvent.submit(screen.getByRole('button', { name: /Registrar Pagamento/ }).closest('form')!);
    
    await waitFor(() => {
      expect(screen.getByText(/Selecione um método/)).toBeInTheDocument();
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  test('valida valor > 0', async () => {
    render(<PagamentoForm onSubmit={mockSubmit} />);
    
    fireEvent.change(screen.getByLabelText(/Método/), { target: { value: 'pix' } });
    
    fireEvent.submit(screen.getByRole('button', { name: /Registrar/ }).closest('form')!);
    
    await waitFor(() => {
      expect(screen.getByText(/Valor deve ser maior/)).toBeInTheDocument();
    });
  });

  test('valida maxValor', async () => {
    render(<PagamentoForm onSubmit={mockSubmit} maxValor={100} />);
    
    fireEvent.change(screen.getByLabelText(/Método/), { target: { value: 'pix' } });
    const valorInput = screen.getByLabelText(/Valor/);
    fireEvent.change(valorInput, { target: { value: '200' } });
    
    fireEvent.submit(screen.getByRole('button', { name: /Registrar/ }).closest('form')!);
    
    await waitFor(() => {
      expect(screen.getByText(/não pode exceder/)).toBeInTheDocument();
    });
  });

  test('mostra parcelas apenas para cartão de crédito', async () => {
    render(<PagamentoForm onSubmit={mockSubmit} />);
    
    // Initially no parcelas
    expect(screen.queryByLabelText(/Parcelas/)).not.toBeInTheDocument();
    
    // Select cartao_credito
    fireEvent.change(screen.getByLabelText(/Método/), { target: { value: 'cartao_credito' } });
    
    expect(screen.getByLabelText(/Parcelas/)).toBeInTheDocument();
  });
});

// ─── ViewModeToggle ───────────────────────────────────────────────

import ViewModeToggle from '@/components/domain/ViewModeToggle';

describe('ViewModeToggle', () => {
  test('renderiza opções', () => {
    const options = [
      { key: 'list', label: 'Lista' },
      { key: 'kanban', label: 'Kanban' },
    ];
    render(<ViewModeToggle options={options} active="list" onChange={() => {}} />);
    expect(screen.getByText('Lista')).toBeInTheDocument();
    expect(screen.getByText('Kanban')).toBeInTheDocument();
  });
});
