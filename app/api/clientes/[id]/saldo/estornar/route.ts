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

// POST /api/clientes/[id]/saldo/estornar - Estorna valor do saldo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);
    const body = await request.json();
    const { valor, observacoes } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor deve ser maior que zero' },
        { status: 400 }
      );
    }

    if (!observacoes || !observacoes.trim()) {
      return NextResponse.json(
        { error: 'Observações são obrigatórias para estorno' },
        { status: 400 }
      );
    }

    // Verifica saldo disponível
    const saldoResult = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);
    const saldoDisponivel = saldoResult?.saldo_disponivel ?? 0;

    if (valor > saldoDisponivel + 0.01) {
      return NextResponse.json(
        { error: 'Valor de estorno maior que o saldo disponível' },
        { status: 400 }
      );
    }

    // Insere movimentação de estorno
    await execute(
      `INSERT INTO movimentacoes_saldo (cliente_id, tipo, valor, observacoes)
       VALUES (?, 'estorno', ?, ?)`,
      [clienteId, valor, observacoes.trim()]
    );

    // Retorna novo saldo
    const novoSaldo = await queryOne<SaldoResult>(SALDO_QUERY, [clienteId]);

    return NextResponse.json({
      cliente_id: clienteId,
      saldo_disponivel: novoSaldo?.saldo_disponivel ?? 0,
    }, { status: 201 });
  } catch (error) {
    console.error('Erro ao estornar saldo:', error);
    return NextResponse.json(
      { error: 'Erro ao estornar saldo' },
      { status: 500 }
    );
  }
}
