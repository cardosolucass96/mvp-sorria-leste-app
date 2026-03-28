import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface SaldoResult {
  saldo_disponivel: number;
}

interface ItemAtendimento {
  id: number;
  valor: number;
  valor_pago: number;
  status: string;
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

// POST /api/clientes/[id]/saldo/debitar - Usa saldo para pagar um item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);
    const body = await request.json();
    const { item_atendimento_id, atendimento_id } = body;

    if (!item_atendimento_id || !atendimento_id) {
      return NextResponse.json(
        { error: 'item_atendimento_id e atendimento_id são obrigatórios' },
        { status: 400 }
      );
    }

    // Verifica saldo disponível
    const saldoResult = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);
    const saldoDisponivel = saldoResult?.saldo_disponivel ?? 0;

    // Busca item
    const item = await queryOne<ItemAtendimento>(
      'SELECT id, valor, valor_pago, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
      [item_atendimento_id, atendimento_id]
    );

    if (!item) {
      return NextResponse.json(
        { error: 'Item não encontrado' },
        { status: 404 }
      );
    }

    if (item.status === 'pago') {
      return NextResponse.json(
        { error: 'Item já está pago' },
        { status: 400 }
      );
    }

    const valorRestante = item.valor - item.valor_pago;

    if (saldoDisponivel < valorRestante - 0.01) {
      return NextResponse.json(
        { error: 'Saldo insuficiente para cobrir o valor restante do item' },
        { status: 400 }
      );
    }

    // Debita o saldo
    await execute(
      `INSERT INTO movimentacoes_saldo (cliente_id, tipo, valor, item_atendimento_id, atendimento_id, observacoes)
       VALUES (?, 'debito', ?, ?, ?, ?)`,
      [clienteId, valorRestante, item_atendimento_id, atendimento_id, `Pagamento via saldo - item #${item_atendimento_id}`]
    );

    // Atualiza item como pago
    await execute(
      `UPDATE itens_atendimento
       SET valor_pago = valor, status = 'pago'
       WHERE id = ?`,
      [item_atendimento_id]
    );

    // Retorna novo saldo
    const novoSaldo = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);

    return NextResponse.json({
      cliente_id: clienteId,
      saldo_disponivel: novoSaldo?.saldo_disponivel ?? 0,
      valor_debitado: valorRestante,
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao debitar saldo:', error);
    return NextResponse.json(
      { error: 'Erro ao debitar saldo' },
      { status: 500 }
    );
  }
}
