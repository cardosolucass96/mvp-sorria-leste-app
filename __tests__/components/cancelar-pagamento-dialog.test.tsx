import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CancelarPagamentoDialog from '@/components/domain/CancelarPagamentoDialog';

const mockUnitFetch = jest.fn();

jest.mock('@/lib/hooks/useUnitFetch', () => ({
  useUnitFetch: () => mockUnitFetch,
}));

const pagamento = { atendimentoId: 7, pagamentoId: 11, valorTotal: 120, quantidadeFormas: 2 };

beforeEach(() => {
  mockUnitFetch.mockReset();
});

it('mostra o total do grupo e envia o motivo escolhido sem exigir digitação', async () => {
  mockUnitFetch.mockResolvedValue({ ok: true });
  const onCancelado = jest.fn();
  render(<CancelarPagamentoDialog pagamento={pagamento} onClose={jest.fn()} onCancelado={onCancelado} />);

  expect(screen.getByText(/120,00.*2 formas de pagamento/)).toBeInTheDocument();
  const confirmar = screen.getByRole('button', { name: 'Confirmar cancelamento' });
  expect(confirmar).toBeDisabled();

  fireEvent.click(screen.getByRole('radio', { name: 'Pagamento duplicado' }));
  fireEvent.click(confirmar);

  await waitFor(() => expect(onCancelado).toHaveBeenCalledTimes(1));
  expect(mockUnitFetch).toHaveBeenCalledWith('/api/atendimentos/7/pagamentos/11', {
    method: 'PUT',
    body: JSON.stringify({ motivo: 'Pagamento duplicado' }),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) },
  });
});

it('mantém o motivo e a chave da operação ao tentar novamente após uma falha', async () => {
  mockUnitFetch.mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValueOnce({ ok: true });
  const onCancelado = jest.fn();
  render(<CancelarPagamentoDialog pagamento={pagamento} onClose={jest.fn()} onCancelado={onCancelado} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Outro' }));
  const confirmar = screen.getByRole('button', { name: 'Confirmar cancelamento' });
  expect(confirmar).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Qual foi o motivo?' }), {
    target: { value: '  Lançado no atendimento errado  ' },
  });
  fireEvent.click(confirmar);

  expect(await screen.findByText('Erro de conexão. Tente novamente.')).toBeInTheDocument();
  expect(onCancelado).not.toHaveBeenCalled();
  fireEvent.click(confirmar);

  await waitFor(() => expect(onCancelado).toHaveBeenCalledTimes(1));
  expect(mockUnitFetch).toHaveBeenCalledTimes(2);
  expect(mockUnitFetch.mock.calls[0]).toEqual(mockUnitFetch.mock.calls[1]);
  expect(mockUnitFetch.mock.calls[1][1].body).toBe(JSON.stringify({ motivo: 'Lançado no atendimento errado' }));
});
