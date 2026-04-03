import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

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

// POST /api/atendimentos/[id]/pagamentos - Registra novo pagamento
// Modelo simplificado: registra valor + método para o atendimento inteiro.
// Todos os itens são marcados como 'pago' automaticamente (quem chega aqui vai pagar tudo).
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    const body = await request.json();
    // etapas_pagas_por_item: Record<itemId, nomesDeEtapasPagas[]>
    // Quando fornecido, atualiza etapa_label e valor do item para refletir apenas as sessões pagas
    // sem criar agendamentos (isso ocorre apenas em "Enviar para Execução")
    const { valor, metodo, observacoes, item_ids, etapas_pagas_por_item } = body;

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

    // Insere o pagamento
    const result = await execute(
      `INSERT INTO pagamentos (atendimento_id, recebido_por_id, valor, metodo, observacoes)
       VALUES (?, ?, ?, ?, ?)`,
      [atendimentoId, recebidoPorId, valor, metodo, observacoes || null]
    );

    const pagamentoId = result.lastInsertRowid;

    // Pagamento parcial de sessões (ex: pagar só etapa 1 de um canal com 2 sessões).
    // Para cada item em etapas_pagas_por_item:
    //   - Combina sessões já pagas (etapa_label existente) com as novas sessões pagas
    //   - Se TODAS as sessões estão pagas → marca como 'pago', limpa etapa_label
    //   - Se ainda parcial → atualiza etapa_label, mantém 'pendente' (para poder pagar o restante depois)
    // Esses itens são excluídos do UPDATE genérico abaixo.
    const itemsHandledSeparately = new Set<number>();

    if (etapas_pagas_por_item && typeof etapas_pagas_por_item === 'object') {
      for (const [itemIdStr, nomesPagosNovos] of Object.entries(etapas_pagas_por_item as Record<string, string[]>)) {
        const itemId = parseInt(itemIdStr);
        itemsHandledSeparately.add(itemId);

        const itemData = await queryOne<{ id: number; procedimento_id: number; etapa_label: string | null }>(
          'SELECT id, procedimento_id, etapa_label FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
          [itemId, atendimentoId]
        );
        if (!itemData) continue;

        const todasEtapas = await query<{ nome: string; valor: number | null }>(
          'SELECT nome, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
          [itemData.procedimento_id]
        );

        // Combina sessões já pagas (de pagamentos anteriores) com as novas
        const jaPageasNomes = itemData.etapa_label
          ? itemData.etapa_label.split(', ').map(s => s.trim())
          : [];
        const todasPageasNomes = [...new Set([...jaPageasNomes, ...(nomesPagosNovos as string[])])];
        const todosPago = todasPageasNomes.length >= todasEtapas.length;

        if (todosPago) {
          // Todas as sessões pagas → marca como pago, limpa etapa_label
          await execute(
            "UPDATE itens_atendimento SET status = 'pago', valor_pago = valor, etapa_label = NULL WHERE id = ?",
            [itemId]
          );
        } else {
          // Ainda parcial → atualiza etapa_label com todas as sessões pagas até agora
          const label = todasPageasNomes.join(', ');
          const etapasPageas = todasEtapas.filter(e => todasPageasNomes.includes(e.nome));
          const todosTemValor = etapasPageas.every(e => e.valor != null);
          if (todosTemValor) {
            const valorPago = etapasPageas.reduce((sum, e) => sum + (e.valor ?? 0), 0);
            await execute(
              'UPDATE itens_atendimento SET etapa_label = ?, valor_pago = ? WHERE id = ?',
              [label, valorPago, itemId]
            );
          } else {
            await execute('UPDATE itens_atendimento SET etapa_label = ? WHERE id = ?', [label, itemId]);
          }
        }
      }
    }

    // Marca itens como pagos: apenas os selecionados (se item_ids fornecido) ou todos os pendentes.
    // Exclui itens tratados individualmente por etapas_pagas_por_item.
    const itemIdsParaPagar = Array.isArray(item_ids) && item_ids.length > 0
      ? (item_ids as number[]).filter(id => !itemsHandledSeparately.has(id))
      : null;

    if (itemIdsParaPagar && itemIdsParaPagar.length > 0) {
      const placeholders = itemIdsParaPagar.map(() => '?').join(',');
      await execute(
        `UPDATE itens_atendimento
         SET valor_pago = valor, status = 'pago'
         WHERE atendimento_id = ? AND status = 'pendente' AND id IN (${placeholders})`,
        [atendimentoId, ...itemIdsParaPagar]
      );
    } else if (!item_ids || (Array.isArray(item_ids) && item_ids.length === 0)) {
      await execute(
        `UPDATE itens_atendimento
         SET valor_pago = valor, status = 'pago'
         WHERE atendimento_id = ? AND status = 'pendente'`,
        [atendimentoId]
      );
    }

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
