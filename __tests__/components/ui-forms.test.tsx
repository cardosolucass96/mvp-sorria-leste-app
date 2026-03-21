/**
 * Testes de componentes de formulário com @testing-library/react
 * Ambiente: jsdom
 * Sprint 6 Revisão – Input, Select, Textarea, Checkbox, Modal
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ─── Input ──────────────────────────────────────────────────────

import Input from '@/components/ui/Input';

describe('Input', () => {
  test('renderiza com label', () => {
    render(<Input label="Nome" name="nome" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  test('onChange é chamado', async () => {
    const onChange = jest.fn();
    render(<Input label="Nome" name="nome" value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Nome'), 'T');
    expect(onChange).toHaveBeenCalled();
  });

  test('mostra asterisco quando required', () => {
    render(<Input label="Nome" name="nome" value="" onChange={() => {}} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  test('mostra mensagem de erro', () => {
    render(<Input label="CPF" name="cpf" value="" onChange={() => {}} error="CPF inválido" />);
    expect(screen.getByText('CPF inválido')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('aria-invalid quando tem erro', () => {
    render(<Input label="Email" name="email" value="" onChange={() => {}} error="Email inválido" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('mostra hint quando não tem erro', () => {
    render(<Input label="CPF" name="cpf" value="" onChange={() => {}} hint="Apenas números" />);
    expect(screen.getByText('Apenas números')).toBeInTheDocument();
  });

  test('disabled state', () => {
    render(<Input label="X" name="x" value="" onChange={() => {}} disabled />);
    expect(screen.getByLabelText('X')).toBeDisabled();
  });

  test('placeholder aparece', () => {
    render(<Input label="Nome" name="nome" value="" onChange={() => {}} placeholder="Digite..." />);
    expect(screen.getByPlaceholderText('Digite...')).toBeInTheDocument();
  });
});

// ─── Select ──────────────────────────────────────────────────────

import Select from '@/components/ui/Select';

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Opção A' },
    { value: 'b', label: 'Opção B' },
  ];

  test('renderiza label e opções', () => {
    render(<Select label="Tipo" name="tipo" value="" onChange={() => {}} options={options} />);
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Opção A')).toBeInTheDocument();
    expect(screen.getByText('Opção B')).toBeInTheDocument();
  });

  test('placeholder padrão "Selecione..."', () => {
    render(<Select label="X" name="x" value="" onChange={() => {}} options={options} />);
    expect(screen.getByText('Selecione...')).toBeInTheDocument();
  });

  test('onChange é chamado', async () => {
    const onChange = jest.fn();
    render(<Select label="Tipo" name="tipo" value="" onChange={onChange} options={options} />);
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  test('mostra erro', () => {
    render(<Select label="X" name="x" value="" onChange={() => {}} options={options} error="Obrigatório" />);
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });

  test('tem ícone de seta dropdown', () => {
    const { container } = render(<Select label="X" name="x" value="" onChange={() => {}} options={options} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  test('disabled state', () => {
    render(<Select label="X" name="x" value="" onChange={() => {}} options={options} disabled />);
    expect(screen.getByLabelText('X')).toBeDisabled();
  });
});

// ─── Textarea ────────────────────────────────────────────────────

import Textarea from '@/components/ui/Textarea';

describe('Textarea', () => {
  test('renderiza com label', () => {
    render(<Textarea label="Obs" name="obs" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Obs')).toBeInTheDocument();
  });

  test('mostra contador de caracteres com maxLength', () => {
    render(<Textarea label="Obs" name="obs" value="abc" onChange={() => {}} maxLength={100} />);
    expect(screen.getByText(/3.*100/)).toBeInTheDocument();
  });

  test('mostra erro', () => {
    render(<Textarea label="X" name="x" value="" onChange={() => {}} error="Obrigatório" />);
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
  });
});

// ─── Checkbox ────────────────────────────────────────────────────

import Checkbox from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  test('renderiza com label clicável', () => {
    render(<Checkbox label="Ativo" checked={false} onChange={() => {}} />);
    expect(screen.getByLabelText('Ativo')).toBeInTheDocument();
  });

  test('onChange é chamado ao clicar', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Aceitar" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Aceitar'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('checked state', () => {
    render(<Checkbox label="OK" checked={true} onChange={() => {}} />);
    expect(screen.getByLabelText('OK')).toBeChecked();
  });

  test('mostra erro quando fornecido', () => {
    render(<Checkbox label="X" checked={false} onChange={() => {}} error="Obrigatório" />);
    expect(screen.getByText('Obrigatório')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('aria-invalid com erro', () => {
    render(<Checkbox label="X" checked={false} onChange={() => {}} error="Erro" />);
    expect(screen.getByLabelText('X')).toHaveAttribute('aria-invalid', 'true');
  });

  test('mostra hint', () => {
    render(<Checkbox label="X" checked={false} onChange={() => {}} hint="Dica" />);
    expect(screen.getByText('Dica')).toBeInTheDocument();
  });

  test('disabled state', () => {
    render(<Checkbox label="X" checked={false} onChange={() => {}} disabled />);
    expect(screen.getByLabelText('X')).toBeDisabled();
  });

  test('required mostra asterisco', () => {
    render(<Checkbox label="X" checked={false} onChange={() => {}} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});

// ─── Modal ──────────────────────────────────────────────────────

import Modal from '@/components/ui/Modal';

describe('Modal', () => {
  test('não renderiza quando fechado', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Modal">Conteúdo</Modal>);
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument();
  });

  test('renderiza quando aberto', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Teste">Conteúdo aqui</Modal>);
    expect(screen.getByText('Conteúdo aqui')).toBeInTheDocument();
    expect(screen.getByText('Teste')).toBeInTheDocument();
  });

  test('tem role="dialog" e aria-modal', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="X">Y</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  test('fechar com ESC', () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="X">Y</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('botão fechar funciona', async () => {
    const onClose = jest.fn();
    render(<Modal isOpen={true} onClose={onClose} title="X">Y</Modal>);
    const closeBtn = screen.getByLabelText(/fechar/i);
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  test('renderiza footer', () => {
    render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="X"
        footer={<button>Salvar</button>}
      >
        Conteúdo
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });
});

// ─── ConfirmDialog ───────────────────────────────────────────────

import ConfirmDialog from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  test('renderiza título e mensagem', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Confirmar exclusão"
        message="Tem certeza?"
      />
    );
    expect(screen.getByText('Confirmar exclusão')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza?')).toBeInTheDocument();
  });

  test('onConfirm é chamado', async () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={onConfirm}
        title="X"
        message="Y"
      />
    );
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    await userEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  test('cancelar chama onClose', async () => {
    const onClose = jest.fn();
    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={() => {}}
        title="X"
        message="Y"
      />
    );
    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    await userEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
