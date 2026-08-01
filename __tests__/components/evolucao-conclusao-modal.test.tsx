import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import EvolucaoConclusaoModal, {
  EvolucaoConclusaoItem,
} from '@/components/domain/EvolucaoConclusaoModal';

const mockUnitFetch = jest.fn();

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

jest.mock('@/components/ui', () => ({
  Alert: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div role="alert">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  Checkbox: ({
    label,
    checked,
    disabled,
    onChange,
  }: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  ),
  ConfirmDialog: ({
    isOpen,
    message,
    onConfirm,
  }: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }) => isOpen ? (
    <div role="dialog" aria-label="Confirmar conclusão clínica">
      <p>{message}</p>
      <button onClick={onConfirm}>Salvar e concluir</button>
    </div>
  ) : null,
  Modal: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => isOpen ? <div>{children}{footer}</div> : null,
  Spinner: () => <span>Salvando</span>,
  Textarea: ({
    label,
    name,
    value,
    onChange,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <textarea name={name} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
}));

const itens: EvolucaoConclusaoItem[] = [
  {
    id: 10,
    label: 'Restauração — dente 21',
    executor_id: 4,
    executor_nome: 'Dra. Marina',
    status: 'pago',
  },
  {
    id: 11,
    label: 'Profilaxia',
    executor_id: 4,
    executor_nome: 'Dra. Marina',
    status: 'executando',
  },
  {
    id: 12,
    label: 'Extração',
    executor_id: 9,
    executor_nome: 'Dr. Paulo',
    status: 'pago',
  },
  {
    id: 13,
    label: 'Retorno agendado',
    executor_id: 4,
    executor_nome: 'Dra. Marina',
    status: 'pago',
    possui_agendamento_ativo: 1,
  },
];

function renderModal(onSuccess = jest.fn(), onClose = jest.fn()) {
  render(
    <EvolucaoConclusaoModal
      open
      onClose={onClose}
      itens={itens}
      itemIdsIniciais={[10]}
      registradorNome="Ana Atendente"
      registroAssistido
      onSuccess={onSuccess}
    />
  );
  return { onSuccess, onClose };
}

describe('EvolucaoConclusaoModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('separa executor e registrador e oferece apenas itens elegíveis do mesmo executor', () => {
    renderModal();

    expect(screen.getByText(/Executor responsável:/)).toHaveTextContent('Dra. Marina');
    expect(screen.getByText(/Registrado por:/)).toHaveTextContent('Ana Atendente');
    expect(screen.getByLabelText('Restauração — dente 21')).toBeChecked();
    expect(screen.getByLabelText('Restauração — dente 21')).toBeDisabled();
    expect(screen.getByLabelText('Profilaxia')).toBeInTheDocument();
    expect(screen.queryByLabelText('Extração')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Retorno agendado')).not.toBeInTheDocument();
  });

  test('valida a descrição, confirma e envia somente o contrato permitido', async () => {
    const resultado = {
      atendimento_id: 7,
      item_ids: [10, 11],
      executor_id: 4,
      registrado_por_id: 2,
      atendimento_finalizado: true,
      atendimento_voltou_para_pagamento: false,
    };
    mockUnitFetch.mockResolvedValue({
      ok: true,
      json: async () => resultado,
    });
    const { onSuccess } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar prontuário e concluir' }));
    expect(screen.getByText(/A descrição da evolução deve ter no mínimo.*10 caracteres/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Descrição clínica'), {
      target: { value: 'Procedimento realizado sem intercorrências.' },
    });
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Retorno em sete dias.' },
    });
    fireEvent.click(screen.getByLabelText('Profilaxia'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prontuário e concluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e concluir' }));

    await waitFor(() => expect(mockUnitFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockUnitFetch.mock.calls[0][1].body)).toEqual({
      item_ids: [10, 11],
      descricao: 'Procedimento realizado sem intercorrências.',
      observacoes: 'Retorno em sete dias.',
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(resultado));
  });

  test('preserva o conteúdo quando a API rejeita a conclusão', async () => {
    mockUnitFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Procedimento já concluído' }),
    });
    renderModal();

    const descricao = screen.getByLabelText('Descrição clínica');
    fireEvent.change(descricao, { target: { value: 'Evolução clínica preenchida pela recepção.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prontuário e concluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e concluir' }));

    expect(await screen.findByText('Procedimento já concluído')).toBeInTheDocument();
    expect(descricao).toHaveValue('Evolução clínica preenchida pela recepção.');
  });
});
