import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  cancelado: number;
}

interface Atendimento {
  id: number;
  unidade_id: number;
}

// PUT /api/atendimentos/[id]/pagamentos/[pagamentoId] - Cancela um pagamento
// Reverte o status de todos os itens 'pago' do atendimento para 'pendente'
// se não houver outro pagamento ativo após este cancelamento.
export const PUT = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id, pagamentoId } = await context.params! as { id: string; pagamentoId: string };
    const atendimentoId = parseInt(id);
    const { motivo } = await request.json();

    // Verifica se atendimento pertence à unidade
    const atendimento = await queryOne<Atendimento>(
      'SELECT id, unidade_id FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    if (!atendimento) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
    }

    if (atendimento.unidade_id !== context.unidadeId) {
      return NextResponse.json({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 });
    }

    if (!motivo?.trim()) {
      return NextResponse.json({ error: 'Informe o motivo do cancelamento' }, { status: 400 });
    }

    const pagamento = await queryOne<Pagamento>(
      'SELECT id, atendimento_id, valor, cancelado FROM pagamentos WHERE id = ? AND atendimento_id = ?',
      [parseInt(pagamentoId), atendimentoId]
    );

    if (!pagamento) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    if (pagamento.cancelado) {
      return NextResponse.json({ error: 'Pagamento já está cancelado' }, { status: 400 });
    }

    // Marca o pagamento como cancelado
    await execute(
      'UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?',
      [motivo.trim(), parseInt(pagamentoId)]
    );

    // Verifica se ainda existe algum pagamento ativo para este atendimento
    const pagamentoAtivo = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM pagamentos WHERE atendimento_id = ? AND cancelado = 0',
      [atendimentoId]
    );

    // Se não há mais pagamentos ativos, reverte os itens 'pago' → 'pendente'
    if (!pagamentoAtivo || pagamentoAtivo.count === 0) {
      await execute(
        `UPDATE itens_atendimento
         SET valor_pago = 0,
             status = 'pendente'
         WHERE atendimento_id = ? AND status = 'pago'`,
        [atendimentoId]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
