import 'server-only';
import { serviceResult } from '@/shared/result';
import { nowUtcIso } from '@/lib/time';
import { obterValorEfetivoItem } from '../public';
import * as repository from './saldo-repository';
import type { CreditarSaldoInput, DebitarSaldoInput, EstornarSaldoInput, TransferirSaldoInput, EstornarProcedimentoInput } from '../contracts/saldo';

export async function consultarSaldo(clienteId: number | string) {
  if (!await repository.buscarClienteSaldo(clienteId)) return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  const saldoRow = await repository.buscarSaldoDetalhado(clienteId);
  const movimentacoes = await repository.buscarMovimentacoesSaldo(clienteId);
  const calculado = await repository.buscarValorPagoDisponivel(clienteId);
  return serviceResult({ saldo: saldoRow?.saldo ?? 0, saldo_calculado: calculado?.saldo_calculado ?? 0, updated_at: saldoRow?.updated_at ?? null, movimentacoes });
}
export async function consultarMovimentacoesSaldo(clienteId: number) {
  if (!await repository.buscarClienteSaldo(clienteId)) return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  return serviceResult(await repository.buscarMovimentacoesSaldo(clienteId));
}

export async function creditarSaldo(clienteId: number, body: unknown) {
  const cliente = await repository.buscarClienteSaldo(clienteId);
  if (!cliente) {
    return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  }

  const { valor, pagamento_id, observacoes } = body as CreditarSaldoInput;

  if (!valor || typeof valor !== 'number' || valor <= 0) {
    return serviceResult({ error: 'Valor deve ser maior que zero' }, { status: 400 });
  }

  const saldoAtual = await repository.buscarSaldo(clienteId);
  const saldoAnterior = saldoAtual?.saldo ?? 0;
  const saldoNovo = saldoAnterior + valor;
  const timestamp = nowUtcIso();

  await repository.persistirCreditarSaldo({ clienteId, valor, saldoAnterior, saldoNovo, pagamento_id, observacoes, timestamp });

  return serviceResult({ saldo: saldoNovo }, { status: 201 });
}

export async function debitarSaldo(clienteId: number, body: unknown) {
  const cliente = await repository.buscarClienteSaldo(clienteId);
  if (!cliente) {
    return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  }

  const { item_atendimento_id, atendimento_id, observacoes } = body as DebitarSaldoInput;

  if (!item_atendimento_id || !atendimento_id) {
    return serviceResult({ error: 'item_atendimento_id e atendimento_id são obrigatórios' }, { status: 400 });
  }

  // Buscar o item e calcular valor restante
  const item = await repository.buscarItemSaldo(item_atendimento_id, atendimento_id);

  if (!item) {
    return serviceResult({ error: 'Item de atendimento não encontrado' }, { status: 404 });
  }

  const valorEfetivo = obterValorEfetivoItem(item);
  const valorRestante = valorEfetivo - item.valor_pago;
  if (valorRestante <= 0) {
    return serviceResult({ error: 'Item já está totalmente pago' }, { status: 400 });
  }

  // Verificar saldo suficiente
  const saldoAtual = await repository.buscarSaldo(clienteId);
  const saldoAnterior = saldoAtual?.saldo ?? 0;

  if (saldoAnterior < valorRestante) {
    return serviceResult(
      { error: 'Saldo insuficiente', saldo: saldoAnterior, valor_necessario: valorRestante },
      { status: 400 }
    );
  }

  const saldoNovo = saldoAnterior - valorRestante;
  const timestamp = nowUtcIso();

  await repository.persistirDebitarSaldo({ clienteId, saldoNovo, saldoAnterior, valorRestante, valorEfetivo, item_atendimento_id, atendimento_id, observacoes, timestamp });

  const itemAtualizado = await repository.buscarItemSaldoAtualizado(item_atendimento_id);

  return serviceResult({ saldo: saldoNovo, item: itemAtualizado });
}

export async function estornarSaldo(clienteId: number, body: unknown) {
  const cliente = await repository.buscarClienteSaldo(clienteId);
  if (!cliente) {
    return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  }

  const { valor, observacoes } = body as EstornarSaldoInput;

  if (!valor || typeof valor !== 'number' || valor <= 0) {
    return serviceResult({ error: 'Valor deve ser maior que zero' }, { status: 400 });
  }

  const saldoAtual = await repository.buscarSaldo(clienteId);
  const saldoAnterior = saldoAtual?.saldo ?? 0;

  if (valor > saldoAnterior) {
    return serviceResult(
      { error: 'Valor de estorno maior que o saldo disponível', saldo: saldoAnterior },
      { status: 400 }
    );
  }

  const saldoNovo = saldoAnterior - valor;
  const timestamp = nowUtcIso();

  await repository.persistirEstornarSaldo({ clienteId, valor, saldoAnterior, saldoNovo, observacoes, timestamp });

  return serviceResult({ saldo: saldoNovo });
}

export async function transferirSaldo(clienteOrigemId: number, body: unknown) {
  const clienteOrigem = await repository.buscarClienteSaldo(clienteOrigemId);
  if (!clienteOrigem) {
    return serviceResult({ error: 'Cliente de origem não encontrado' }, { status: 404 });
  }

  const { cliente_destino_id, valor, observacoes } = body as TransferirSaldoInput;

  if (!cliente_destino_id) {
    return serviceResult({ error: 'cliente_destino_id é obrigatório' }, { status: 400 });
  }

  if (!valor || typeof valor !== 'number' || valor <= 0) {
    return serviceResult({ error: 'Valor deve ser maior que zero' }, { status: 400 });
  }

  if (clienteOrigemId === cliente_destino_id) {
    return serviceResult({ error: 'Cliente de origem e destino devem ser diferentes' }, { status: 400 });
  }

  const clienteDestino = await repository.buscarClienteSaldo(cliente_destino_id);
  if (!clienteDestino) {
    return serviceResult({ error: 'Cliente de destino não encontrado' }, { status: 404 });
  }

  // Verificar saldo de origem
  const saldoOrigem = await repository.buscarSaldo(clienteOrigemId);
  const saldoOrigemAnterior = saldoOrigem?.saldo ?? 0;

  if (valor > saldoOrigemAnterior) {
    return serviceResult(
      { error: 'Saldo insuficiente', saldo: saldoOrigemAnterior },
      { status: 400 }
    );
  }

  // Buscar saldo de destino
  const saldoDestino = await repository.buscarSaldo(cliente_destino_id);
  const saldoDestinoAnterior = saldoDestino?.saldo ?? 0;

  const saldoOrigemNovo = saldoOrigemAnterior - valor;
  const saldoDestinoNovo = saldoDestinoAnterior + valor;
  const timestamp = nowUtcIso();

  await repository.persistirTransferirSaldo({ clienteOrigemId, cliente_destino_id, valor, saldoOrigemAnterior, saldoOrigemNovo, saldoDestinoAnterior, saldoDestinoNovo, observacoes, timestamp });

  return serviceResult({
    saldo_origem: saldoOrigemNovo,
    saldo_destino: saldoDestinoNovo,
  });
}

export async function estornarProcedimento(clienteId: number, body: unknown) {
  const cliente = await repository.buscarClienteSaldo(clienteId);
  if (!cliente) {
    return serviceResult({ error: 'Cliente não encontrado' }, { status: 404 });
  }

  const { item_atendimento_id } = body as EstornarProcedimentoInput;

  if (!item_atendimento_id) {
    return serviceResult({ error: 'item_atendimento_id é obrigatório' }, { status: 400 });
  }

  const item = await repository.buscarItemEstorno(item_atendimento_id);

  if (!item) {
    return serviceResult({ error: 'Procedimento não encontrado' }, { status: 404 });
  }

  if (item.atendimento_cliente_id !== clienteId) {
    return serviceResult({ error: 'Procedimento não pertence a este cliente' }, { status: 403 });
  }

  if (item.valor_pago <= 0) {
    return serviceResult({ error: 'Procedimento não possui valor pago para estornar' }, { status: 400 });
  }

  if (item.status === 'concluido') {
    return serviceResult({ error: 'Não é possível estornar um procedimento já concluído' }, { status: 400 });
  }

  const saldoAtual = await repository.buscarSaldo(clienteId);
  const saldoAnterior = saldoAtual?.saldo ?? 0;
  const saldoNovo = saldoAnterior + item.valor_pago;
  const timestamp = nowUtcIso();

  await repository.persistirEstornarProcedimento({ clienteId, item, saldoAnterior, saldoNovo, timestamp });

  return serviceResult({ saldo_novo: saldoNovo, valor_creditado: item.valor_pago });
}
