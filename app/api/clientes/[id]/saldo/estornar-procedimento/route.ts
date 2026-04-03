import { NextRequest, NextResponse } from 'next/server';
import { queryOne, batch } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ItemRow {
  id: number;
  valor_pago: number;
  status: string;
  procedimento_nome: string;
  atendimento_cliente_id: number;
}

interface SaldoCliente {
  saldo: number;
}

// POST /api/clientes/[id]/saldo/estornar-procedimento
// Converte o valor pago de um procedimento não concluído em saldo do cliente
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const { item_atendimento_id } = body;

    if (!item_atendimento_id) {
      return NextResponse.json({ error: 'item_atendimento_id é obrigatório' }, { status: 400 });
    }

    const item = await queryOne<ItemRow>(
      `SELECT ia.id, ia.valor_pago, ia.status, p.nome AS procedimento_nome, a.cliente_id AS atendimento_cliente_id
       FROM itens_atendimento ia
       JOIN atendimentos a ON a.id = ia.atendimento_id
       JOIN procedimentos p ON p.id = ia.procedimento_id
       WHERE ia.id = ?`,
      [item_atendimento_id]
    );

    if (!item) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    if (item.atendimento_cliente_id !== clienteId) {
      return NextResponse.json({ error: 'Procedimento não pertence a este cliente' }, { status: 403 });
    }

    if (item.valor_pago <= 0) {
      return NextResponse.json({ error: 'Procedimento não possui valor pago para estornar' }, { status: 400 });
    }

    if (item.status === 'concluido') {
      return NextResponse.json({ error: 'Não é possível estornar um procedimento já concluído' }, { status: 400 });
    }

    const saldoAtual = await queryOne<SaldoCliente>(
      'SELECT saldo FROM saldo_clientes WHERE cliente_id = ?',
      [clienteId]
    );
    const saldoAnterior = saldoAtual?.saldo ?? 0;
    const saldoNovo = saldoAnterior + item.valor_pago;

    await batch([
      {
        sql: `INSERT INTO saldo_clientes (cliente_id, saldo, updated_at)
              VALUES (?, ?, datetime('now', 'localtime'))
              ON CONFLICT(cliente_id) DO UPDATE SET
                saldo = saldo + excluded.saldo,
                updated_at = datetime('now', 'localtime')`,
        params: [clienteId, item.valor_pago],
      },
      {
        sql: `INSERT INTO movimentacoes_saldo
              (cliente_id, tipo, valor, saldo_anterior, saldo_novo, item_atendimento_id, observacoes)
              VALUES (?, 'estorno', ?, ?, ?, ?, ?)`,
        params: [
          clienteId,
          item.valor_pago,
          saldoAnterior,
          saldoNovo,
          item.id,
          `Estorno: ${item.procedimento_nome}`,
        ],
      },
      {
        sql: `UPDATE itens_atendimento SET valor_pago = 0, status = 'pendente' WHERE id = ?`,
        params: [item.id],
      },
    ]);

    return NextResponse.json({ saldo_novo: saldoNovo, valor_creditado: item.valor_pago });
  } catch (error) {
    console.error('Erro ao estornar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao estornar procedimento' }, { status: 500 });
  }
}
