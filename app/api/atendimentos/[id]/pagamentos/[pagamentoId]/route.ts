import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  cancelado: number;
}

interface PagamentoItem {
  item_atendimento_id: number;
  valor_aplicado: number;
}

// PUT /api/atendimentos/[id]/pagamentos/[pagamentoId] - Cancela pagamento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pagamentoId: string }> }
) {
  try {
    const { id, pagamentoId } = await params;
    const { motivo } = await request.json();

    if (!motivo?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo do cancelamento' }, { status: 400 });
    }

    const pagamento = await queryOne<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ? AND atendimento_id = ?',
      [parseInt(pagamentoId), parseInt(id)]
    );

    if (!pagamento) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    if (pagamento.cancelado) {
      return NextResponse.json({ error: 'Pagamento já está cancelado' }, { status: 400 });
    }

    // Busca itens vinculados para reverter valor_pago
    const itens = await query<PagamentoItem>(
      'SELECT * FROM pagamentos_itens WHERE pagamento_id = ?',
      [parseInt(pagamentoId)]
    );

    // Reverte valor_pago em cada item
    for (const item of itens) {
      await execute(
        `UPDATE itens_atendimento
         SET valor_pago = CASE WHEN valor_pago >= ? THEN valor_pago - ? ELSE 0 END
         WHERE id = ?`,
        [item.valor_aplicado, item.valor_aplicado, item.item_atendimento_id]
      );
      await execute(
        `UPDATE itens_atendimento
         SET status = 'pendente'
         WHERE id = ? AND status = 'pago' AND valor_pago < valor`,
        [item.item_atendimento_id]
      );
    }

    // Marca pagamento como cancelado
    await execute(
      'UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?',
      [motivo.trim(), parseInt(pagamentoId)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
