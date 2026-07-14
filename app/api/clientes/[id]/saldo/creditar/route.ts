import { NextRequest, NextResponse } from 'next/server';
import { queryOne, batch } from '@/lib/db';
import { nowUtcIso } from '@/lib/time';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SaldoCliente {
  saldo: number;
}

// POST /api/clientes/[id]/saldo/creditar - Adiciona crédito ao saldo
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { valor, pagamento_id, observacoes } = body;

    if (!valor || typeof valor !== 'number' || valor <= 0) {
      return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });
    }

    const saldoAtual = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [clienteId]
    );
    const saldoAnterior = saldoAtual?.saldo ?? 0;
    const saldoNovo = saldoAnterior + valor;
    const timestamp = nowUtcIso();

    await batch([
      {
        sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(cliente_id) DO UPDATE SET
                saldo = saldo + excluded.saldo,
                updated_at = ?`,
        params: [clienteId, valor, timestamp, timestamp],
      },
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, pagamento_id, observacoes)
              VALUES (?, 'credito', ?, ?, ?, ?, ?)`,
        params: [clienteId, valor, saldoAnterior, saldoNovo, pagamento_id ?? null, observacoes ?? null],
      },
    ]);

    return NextResponse.json({ saldo: saldoNovo }, { status: 201 });
  } catch (error) {
    console.error('Erro ao creditar saldo:', error);
    return NextResponse.json({ error: 'Erro ao creditar saldo' }, { status: 500 });
  }
}
