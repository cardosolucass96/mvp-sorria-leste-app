import { NextRequest, NextResponse } from 'next/server';
import { queryOne, batch } from '@/lib/db';
import { nowUtcIso } from '@/lib/time';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SaldoCliente {
  saldo: number;
}

// POST /api/clientes/[id]/saldo/estornar - Devolve saldo ao cliente
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { valor, observacoes } = body;

    if (!valor || typeof valor !== 'number' || valor <= 0) {
      return NextResponse.json({ error: 'Valor deve ser maior que zero' }, { status: 400 });
    }

    const saldoAtual = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [clienteId]
    );
    const saldoAnterior = saldoAtual?.saldo ?? 0;

    if (valor > saldoAnterior) {
      return NextResponse.json(
        { error: 'Valor de estorno maior que o saldo disponível', saldo: saldoAnterior },
        { status: 400 }
      );
    }

    const saldoNovo = saldoAnterior - valor;
    const timestamp = nowUtcIso();

    await batch([
      {
        sql: `UPDATE saldo_clientes SET saldo = ?, updated_at = ? WHERE cliente_id = ?`,
        params: [saldoNovo, timestamp, clienteId],
      },
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, observacoes)
              VALUES (?, 'estorno', ?, ?, ?, ?)`,
        params: [clienteId, valor, saldoAnterior, saldoNovo, observacoes ?? null],
      },
    ]);

    return NextResponse.json({ saldo: saldoNovo });
  } catch (error) {
    console.error('Erro ao estornar saldo:', error);
    return NextResponse.json({ error: 'Erro ao estornar saldo' }, { status: 500 });
  }
}
