import { NextRequest, NextResponse } from 'next/server';
import { queryOne, batch } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SaldoCliente {
  saldo: number;
}

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  valor: number;
  valor_pago: number;
  status: string;
}

// POST /api/clientes/[id]/saldo/debitar - Usa saldo para pagar um item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { item_atendimento_id, atendimento_id, observacoes } = body;

    if (!item_atendimento_id || !atendimento_id) {
      return NextResponse.json({ error: 'item_atendimento_id e atendimento_id são obrigatórios' }, { status: 400 });
    }

    // Buscar o item e calcular valor restante
    const item = await queryOne<ItemAtendimento>(
      'SELECT id, atendimento_id, valor, valor_pago, status FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
      [item_atendimento_id, atendimento_id]
    );

    if (!item) {
      return NextResponse.json({ error: 'Item de atendimento não encontrado' }, { status: 404 });
    }

    const valorRestante = item.valor - item.valor_pago;
    if (valorRestante <= 0) {
      return NextResponse.json({ error: 'Item já está totalmente pago' }, { status: 400 });
    }

    // Verificar saldo suficiente
    const saldoAtual = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [clienteId]
    );
    const saldoAnterior = saldoAtual?.saldo ?? 0;

    if (saldoAnterior < valorRestante) {
      return NextResponse.json(
        { error: 'Saldo insuficiente', saldo: saldoAnterior, valor_necessario: valorRestante },
        { status: 400 }
      );
    }

    const saldoNovo = saldoAnterior - valorRestante;

    await batch([
      {
        sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
              VALUES (?, ?, datetime('now', 'localtime'))
              ON CONFLICT(cliente_id) DO UPDATE SET
                saldo = ?, updated_at = datetime('now', 'localtime')`,
        params: [clienteId, saldoNovo, saldoNovo],
      },
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, item_atendimento_id, atendimento_id, observacoes)
              VALUES (?, 'debito', ?, ?, ?, ?, ?, ?)`,
        params: [clienteId, valorRestante, saldoAnterior, saldoNovo, item_atendimento_id, atendimento_id, observacoes ?? null],
      },
      {
        sql: `UPDATE itens_atendimento SET valor_pago = valor, status = 'pago' WHERE id = ?`,
        params: [item_atendimento_id],
      },
    ]);

    const itemAtualizado = await queryOne<ItemAtendimento>(
      'SELECT id, atendimento_id, valor, valor_pago, status FROM itens_atendimento WHERE id = ?',
      [item_atendimento_id]
    );

    return NextResponse.json({ saldo: saldoNovo, item: itemAtualizado });
  } catch (error) {
    console.error('Erro ao debitar saldo:', error);
    return NextResponse.json({ error: 'Erro ao debitar saldo' }, { status: 500 });
  }
}
