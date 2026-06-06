import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { recalcularFinanceiroAgendamentos, recalcularFinanceiroItens } from '@/lib/helpers/pagamentoFlow';
import { garantirEsquemaPagamentosGrupos } from '@/lib/helpers/pagamentosGrupos';

interface Pagamento {
  id: number;
  atendimento_id: number;
  pagamento_grupo_id: number | null;
  valor: number;
  cancelado: number;
}

interface Atendimento {
  id: number;
  unidade_id: number;
}

// PUT /api/atendimentos/[id]/pagamentos/[pagamentoId] - Cancela um pagamento
// Se o pagamento fizer parte de um grupo, o cancelamento vale para o grupo inteiro.
export const PUT = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id, pagamentoId } = await context.params! as { id: string; pagamentoId: string };
    const atendimentoId = parseInt(id);
    const pagamentoIdNumero = parseInt(pagamentoId);
    const { motivo } = await request.json();

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

    await garantirEsquemaPagamentosGrupos();

    const pagamento = await queryOne<Pagamento>(
      `SELECT id, atendimento_id, pagamento_grupo_id, valor, cancelado
       FROM pagamentos
       WHERE id = ? AND atendimento_id = ?`,
      [pagamentoIdNumero, atendimentoId]
    );

    if (!pagamento) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    const motivoNormalizado = motivo.trim();
    let pagamentosAlvo: Array<{ id: number; cancelado: number }> = [];

    if (pagamento.pagamento_grupo_id) {
      pagamentosAlvo = await query<{ id: number; cancelado: number }>(
        'SELECT id, cancelado FROM pagamentos WHERE pagamento_grupo_id = ?',
        [pagamento.pagamento_grupo_id]
      );

      if (pagamentosAlvo.every((pagamentoGrupo) => pagamentoGrupo.cancelado)) {
        return NextResponse.json({ error: 'Pagamento já está cancelado' }, { status: 400 });
      }

      await execute(
        'UPDATE pagamentos_grupos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?',
        [motivoNormalizado, pagamento.pagamento_grupo_id]
      );
      await execute(
        'UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE pagamento_grupo_id = ?',
        [motivoNormalizado, pagamento.pagamento_grupo_id]
      );
    } else {
      if (pagamento.cancelado) {
        return NextResponse.json({ error: 'Pagamento já está cancelado' }, { status: 400 });
      }

      pagamentosAlvo = [{ id: pagamentoIdNumero, cancelado: pagamento.cancelado }];
      await execute(
        'UPDATE pagamentos SET cancelado = 1, motivo_cancelamento = ? WHERE id = ?',
        [motivoNormalizado, pagamentoIdNumero]
      );
    }

    const pagamentoIds = pagamentosAlvo.map((pagamentoAlvo) => pagamentoAlvo.id);
    const placeholders = pagamentoIds.map(() => '?').join(',');
    const alocacoes = pagamentoIds.length > 0
      ? await query<{ item_atendimento_id: number | null; agendamento_id: number | null }>(
          `SELECT item_atendimento_id, agendamento_id
           FROM pagamentos_alocacoes
           WHERE pagamento_id IN (${placeholders})`,
          pagamentoIds
        )
      : [];

    const itemIds = [...new Set(alocacoes
      .map((alocacao) => alocacao.item_atendimento_id)
      .filter((value): value is number => Number.isFinite(value)))];
    const agendamentoIds = [...new Set(alocacoes
      .map((alocacao) => alocacao.agendamento_id)
      .filter((value): value is number => Number.isFinite(value)))];

    if (itemIds.length > 0) {
      await recalcularFinanceiroItens(itemIds);
    }
    if (agendamentoIds.length > 0) {
      await recalcularFinanceiroAgendamentos(agendamentoIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
