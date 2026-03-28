import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface SaldoResult {
  saldo_disponivel: number;
}

const SALDO_QUERY = `SELECT COALESCE(
  SUM(CASE
    WHEN tipo IN ('credito', 'transferencia_recebida') THEN valor
    WHEN tipo IN ('debito', 'estorno', 'transferencia_enviada') THEN -valor
    ELSE 0
  END), 0
) as saldo_disponivel
FROM movimentacoes_saldo
WHERE cliente_id = ?`;

// POST /api/clientes/[id]/saldo/transferir - Transfere saldo para outro cliente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);
    const body = await request.json();
    const { cliente_destino_id, valor, observacoes } = body;

    if (!cliente_destino_id) {
      return NextResponse.json(
        { error: 'Cliente destino é obrigatório' },
        { status: 400 }
      );
    }

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor deve ser maior que zero' },
        { status: 400 }
      );
    }

    if (clienteId === cliente_destino_id) {
      return NextResponse.json(
        { error: 'Não é possível transferir para o mesmo cliente' },
        { status: 400 }
      );
    }

    // Verifica se ambos os clientes existem
    const origem = await queryOne<{ id: number; nome: string }>(
      'SELECT id, nome FROM clientes WHERE id = ?',
      [clienteId]
    );
    const destino = await queryOne<{ id: number; nome: string }>(
      'SELECT id, nome FROM clientes WHERE id = ?',
      [cliente_destino_id]
    );

    if (!origem) {
      return NextResponse.json(
        { error: 'Cliente de origem não encontrado' },
        { status: 404 }
      );
    }

    if (!destino) {
      return NextResponse.json(
        { error: 'Cliente de destino não encontrado' },
        { status: 404 }
      );
    }

    // Verifica saldo disponível
    const saldoResult = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);
    const saldoDisponivel = saldoResult?.saldo_disponivel ?? 0;

    if (valor > saldoDisponivel + 0.01) {
      return NextResponse.json(
        { error: 'Valor de transferência maior que o saldo disponível' },
        { status: 400 }
      );
    }

    const obs = observacoes?.trim() || null;

    // Movimentação de saída (origem)
    await execute(
      `INSERT INTO movimentacoes_saldo (cliente_id, tipo, valor, cliente_destino_id, observacoes)
       VALUES (?, 'transferencia_enviada', ?, ?, ?)`,
      [clienteId, valor, cliente_destino_id, obs ? `Transferência para ${destino.nome}: ${obs}` : `Transferência para ${destino.nome}`]
    );

    // Movimentação de entrada (destino)
    await execute(
      `INSERT INTO movimentacoes_saldo (cliente_id, tipo, valor, cliente_destino_id, observacoes)
       VALUES (?, 'transferencia_recebida', ?, ?, ?)`,
      [cliente_destino_id, valor, clienteId, obs ? `Transferência de ${origem.nome}: ${obs}` : `Transferência de ${origem.nome}`]
    );

    // Retorna novo saldo da origem
    const novoSaldo = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);

    return NextResponse.json({
      cliente_id: clienteId,
      saldo_disponivel: novoSaldo?.saldo_disponivel ?? 0,
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    return NextResponse.json(
      { error: 'Erro ao transferir saldo' },
      { status: 500 }
    );
  }
}
