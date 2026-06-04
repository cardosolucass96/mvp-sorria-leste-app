import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { buscarEtapasComValor, recalcularFinanceiroItens, roundMoney } from '@/lib/helpers/pagamentoFlow';

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  created_at: string;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
}

interface AlocacaoPagamentoInput {
  item_id: number;
  etapa_modelo_id?: number | null;
  valor: number;
}

interface ItemPagamentoRow {
  id: number;
  procedimento_id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  etapas_valores: string | null;
}

async function verificarAtendimentoUnidade(atendimentoId: number, unidadeId: number) {
  const at = await queryOne<Atendimento>(
    'SELECT id, status, unidade_id FROM atendimentos WHERE id = ?',
    [atendimentoId]
  );
  if (!at) return { error: NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 }) };
  if (at.unidade_id !== unidadeId) return { error: NextResponse.json({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 }) };
  return { atendimento: at };
}

// GET /api/atendimentos/[id]/pagamentos - Lista pagamentos do atendimento
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const result = await verificarAtendimentoUnidade(parseInt(id as string), context.unidadeId);
    if ('error' in result) return result.error;

    const pagamentos = await query(
      `SELECT p.*, u.nome as recebido_por_nome
       FROM pagamentos p
       LEFT JOIN usuarios u ON p.recebido_por_id = u.id
       WHERE p.atendimento_id = ?
       ORDER BY p.created_at DESC`,
      [parseInt(id as string)]
    );

    return NextResponse.json(pagamentos);
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar pagamentos' },
      { status: 500 }
    );
  }
});

// POST /api/atendimentos/[id]/pagamentos - Registra novo pagamento com alocação explícita.
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    const body = await request.json();
    const { valor, metodo, observacoes, alocacoes } = body as {
      valor: number;
      metodo: string;
      observacoes?: string | null;
      alocacoes?: AlocacaoPagamentoInput[];
    };

    const check = await verificarAtendimentoUnidade(atendimentoId, context.unidadeId);
    if ('error' in check) return check.error;
    const atendimento = check.atendimento;

    if (!['aguardando_pagamento', 'em_execucao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Não é possível registrar pagamento neste status' },
        { status: 400 }
      );
    }

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor do pagamento é obrigatório e deve ser maior que zero' },
        { status: 400 }
      );
    }

    const metodosValidos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria'];
    if (!metodo || !metodosValidos.includes(metodo)) {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      );
    }

    const recebidoPorId = context.user.sub;

    if (!Array.isArray(alocacoes) || alocacoes.length === 0) {
      return NextResponse.json(
        { error: 'Informe ao menos uma alocação de pagamento' },
        { status: 400 }
      );
    }

    const somaAlocacoes = roundMoney(alocacoes.reduce((sum, alocacao) => sum + Number(alocacao.valor || 0), 0));
    if (Math.abs(somaAlocacoes - roundMoney(Number(valor))) > 0.01) {
      return NextResponse.json(
        { error: 'O valor do pagamento deve ser igual à soma das alocações' },
        { status: 400 }
      );
    }

    const itemIds = [...new Set(alocacoes.map(alocacao => Number(alocacao.item_id)).filter(Number.isFinite))];
    const placeholders = itemIds.map(() => '?').join(',');
    const itens = itemIds.length > 0
      ? await query<ItemPagamentoRow>(
          `SELECT id, procedimento_id, valor, valor_final, valor_pago, etapas_valores
           FROM itens_atendimento
           WHERE atendimento_id = ? AND id IN (${placeholders})`,
          [atendimentoId, ...itemIds]
        )
      : [];
    const itensMap = new Map(itens.map(item => [item.id, item]));

    for (const alocacao of alocacoes) {
      const valorAlocado = Number(alocacao.valor);
      if (!Number.isFinite(valorAlocado) || valorAlocado <= 0) {
        return NextResponse.json({ error: 'Valor de alocação inválido' }, { status: 400 });
      }

      const item = itensMap.get(Number(alocacao.item_id));
      if (!item) {
        return NextResponse.json({ error: 'Item de atendimento inválido na alocação' }, { status: 400 });
      }

      if (alocacao.etapa_modelo_id) {
        const etapas = await buscarEtapasComValor(item);
        const etapa = etapas.find(et => et.id === Number(alocacao.etapa_modelo_id));
        if (!etapa) {
          return NextResponse.json({ error: 'Sessão inválida na alocação' }, { status: 400 });
        }
      }
    }

    // Insere o pagamento
    const result = await execute(
      `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, observacoes)
       VALUES (?, ?, ?, ?, ?)`,
      [atendimentoId, recebidoPorId, valor, metodo, observacoes || null]
    );

    const pagamentoId = result.lastInsertRowid;

    for (const alocacao of alocacoes) {
      await execute(
        `INSERT INTO pagamentos_alocacoes (pagamento_id, item_atendimento_id, etapa_modelo_id, valor_alocado)
         VALUES (?, ?, ?, ?)`,
        [
          pagamentoId,
          alocacao.item_id,
          alocacao.etapa_modelo_id ?? null,
          roundMoney(Number(alocacao.valor)),
        ]
      );
    }

    await recalcularFinanceiroItens(itemIds);

    const novoPagamento = await queryOne<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ?',
      [pagamentoId]
    );

    return NextResponse.json(novoPagamento, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return NextResponse.json(
      { error: 'Erro ao registrar pagamento' },
      { status: 500 }
    );
  }
});
