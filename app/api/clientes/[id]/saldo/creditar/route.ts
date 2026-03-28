import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

// POST /api/clientes/[id]/saldo/creditar - Adiciona crédito ao saldo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);
    const body = await request.json();
    const { valor, pagamento_id, observacoes } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor deve ser maior que zero' },
        { status: 400 }
      );
    }

    // Verifica se cliente existe
    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [clienteId]
    );

    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    // Insere movimentação de crédito
    await execute(
      `INSERT INTO movimentacoes_saldo (cliente_id, tipo, valor, pagamento_id, observacoes)
       VALUES (?, 'credito', ?, ?, ?)`,
      [clienteId, valor, pagamento_id || null, observacoes || null]
    );

    // Retorna novo saldo
    const result = await queryOne<{ saldo_disponivel: number }>(
      `SELECT COALESCE(
        SUM(CASE
          WHEN tipo IN ('credito', 'transferencia_recebida') THEN valor
          WHEN tipo IN ('debito', 'estorno', 'transferencia_enviada') THEN -valor
          ELSE 0
        END), 0
      ) as saldo_disponivel
      FROM movimentacoes_saldo
      WHERE cliente_id = ?`,
      [clienteId]
    );

    return NextResponse.json({
      cliente_id: clienteId,
      saldo_disponivel: result?.saldo_disponivel ?? 0,
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao creditar saldo:', error);
    return NextResponse.json(
      { error: 'Erro ao creditar saldo' },
      { status: 500 }
    );
  }
}
