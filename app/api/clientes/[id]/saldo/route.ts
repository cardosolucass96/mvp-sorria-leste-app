import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

interface SaldoResult {
  saldo_disponivel: number;
}

// GET /api/clientes/[id]/saldo - Retorna saldo disponível do cliente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

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

    // Calcula saldo a partir das movimentações
    const result = await queryOne<SaldoResult>(
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
    });
  } catch (error) {
    console.error('Erro ao buscar saldo:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar saldo' },
      { status: 500 }
    );
  }
}
