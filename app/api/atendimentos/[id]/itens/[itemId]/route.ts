import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute, query } from '@/lib/db';
import { gerarComissoesItem } from '@/lib/helpers/gerarComissoes';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  valor_original: number | null;
  valor_final: number | null;
  desconto_valor: number;
  desconto_motivo: string | null;
  etapas_valores: string | null;
  valor_pago: number;
  status: string;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
  categoria_id: number | null;
}

// PUT /api/atendimentos/[id]/itens/[itemId] - Atualiza item
export const PUT = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id, itemId } = await context.params! as { id: string; itemId: string };
    const body = await request.json();
    const {
      executor_id,
      valor,
      valor_final,
      desconto_motivo,
      status,
      usuario_id,
      dentes,
      etapa_modelo_id,
      etapa_valor,
    } = body;

    // Verifica se atendimento existe e pertence à unidade
    const atendimento = await queryOne<Atendimento>(
      'SELECT id, status, unidade_id, categoria_id FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );

    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    if (atendimento.unidade_id !== context.unidadeId) {
      return NextResponse.json(
        { error: 'Atendimento não pertence a esta unidade' },
        { status: 403 }
      );
    }
    
    // Verifica se item existe
    const item = await queryOne<ItemAtendimento>(
      'SELECT * FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
      [parseInt(itemId), parseInt(id)]
    );
    
    if (!item) {
      return NextResponse.json(
        { error: 'Item não encontrado' },
        { status: 404 }
      );
    }
    
    // Validação: apenas o executor pode marcar como executando/concluído
    if (status && ['executando', 'concluido'].includes(status)) {
      if (usuario_id && item.executor_id && usuario_id !== item.executor_id) {
        return NextResponse.json(
          { error: 'Apenas o executor designado pode alterar o status deste procedimento' },
          { status: 403 }
        );
      }
    }

    // Validação: não permite trocar executor após iniciar execução
    if (executor_id !== undefined && ['executando', 'concluido'].includes(item.status)) {
      return NextResponse.json(
        { error: 'Não é possível trocar o executor após o procedimento ter sido iniciado' },
        { status: 400 }
      );
    }

    // Validação: executor precisa ter role compatível com a categoria do atendimento
    if (executor_id && atendimento.categoria_id) {
      const compatRow = await queryOne<{ n: number }>(
        `SELECT COUNT(*) as n
           FROM usuario_roles ur
           JOIN categoria_roles cr ON cr.role = ur.role
          WHERE ur.usuario_id = ? AND cr.categoria_id = ?`,
        [executor_id, atendimento.categoria_id]
      );
      if (!compatRow || compatRow.n === 0) {
        return NextResponse.json(
          { error: 'Executor não tem permissão para esta categoria' },
          { status: 400 }
        );
      }
    }

    // Validação: edição de valor só em avaliacao ou aguardando_pagamento
    // Garante também valor >= 0 e valor >= valor_pago (sem criar excesso não tratado).
    const valorRecebido = valor_final !== undefined ? valor_final : valor;
    if (valorRecebido !== undefined) {
      if (!['avaliacao', 'aguardando_pagamento'].includes(atendimento.status)) {
        return NextResponse.json(
          { error: 'Só é possível editar o valor durante a avaliação ou enquanto aguarda pagamento' },
          { status: 400 }
        );
      }

      const valorNum = Number(valorRecebido);
      if (!Number.isFinite(valorNum) || valorNum < 0) {
        return NextResponse.json(
          { error: 'Valor inválido' },
          { status: 400 }
        );
      }

      if (valorNum < item.valor_pago) {
        return NextResponse.json(
          {
            error: `Não é possível reduzir o valor abaixo do que já foi pago (R$ ${item.valor_pago.toFixed(2)}). Estorne o pagamento primeiro.`,
          },
          { status: 400 }
        );
      }
    }

    // Monta update
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];

    if (executor_id !== undefined) {
      updates.push('executor_id = ?');
      updateParams.push(executor_id || null);
    }

    // Edição per-etapa: body contém etapa_modelo_id + etapa_valor.
    // Inicializa override com split igualitário na primeira edição,
    // depois atualiza apenas a etapa alvo. item.valor = soma dos overrides.
    if (etapa_modelo_id !== undefined && etapa_valor !== undefined) {
      if (!['avaliacao', 'aguardando_pagamento'].includes(atendimento.status)) {
        return NextResponse.json(
          { error: 'Só é possível editar o valor das sessões durante a avaliação ou enquanto aguarda pagamento' },
          { status: 400 }
        );
      }

      const etapaId = Number(etapa_modelo_id);
      const etapaValorNum = Number(etapa_valor);
      if (!Number.isFinite(etapaId) || !Number.isFinite(etapaValorNum) || etapaValorNum < 0) {
        return NextResponse.json({ error: 'Valor de sessão inválido' }, { status: 400 });
      }

      // Carrega template de etapas do procedimento (para validar + inicializar)
      const modelos = await query<{ id: number; valor: number | null }>(
        `SELECT id, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC`,
        [item.procedimento_id]
      );
      if (modelos.length === 0) {
        return NextResponse.json(
          { error: 'Procedimento não possui sessões configuradas' },
          { status: 400 }
        );
      }
      if (!modelos.some(m => m.id === etapaId)) {
        return NextResponse.json(
          { error: 'Sessão não pertence a este procedimento' },
          { status: 400 }
        );
      }

      let overrides: Record<string, number> = {};
      if (item.etapas_valores) {
        try {
          overrides = JSON.parse(item.etapas_valores) as Record<string, number>;
        } catch {
          overrides = {};
        }
      }
      // Inicializa entradas faltantes com split igualitário do item.valor atual
      for (const m of modelos) {
        if (overrides[String(m.id)] === undefined) {
          overrides[String(m.id)] = item.valor / modelos.length;
        }
      }
      // Aplica a edição
      overrides[String(etapaId)] = etapaValorNum;

      // Recalcula item.valor
      const newItemValor = Object.values(overrides).reduce((sum, v) => sum + Number(v), 0);
      if (newItemValor < item.valor_pago) {
        return NextResponse.json(
          {
            error: `Soma das sessões (R$ ${newItemValor.toFixed(2)}) é menor que o valor já pago (R$ ${item.valor_pago.toFixed(2)}). Estorne o pagamento primeiro.`,
          },
          { status: 400 }
        );
      }

      updates.push('etapas_valores = ?');
      updateParams.push(JSON.stringify(overrides));
      updates.push('valor = ?');
      updateParams.push(newItemValor);
      updates.push('valor_final = ?');
      updateParams.push(newItemValor);
      updates.push('desconto_valor = ?');
      updateParams.push(0);
      updates.push('desconto_motivo = ?');
      updateParams.push(null);
      updates.push('desconto_aplicado_por_id = ?');
      updateParams.push(null);
      updates.push('desconto_aplicado_em = ?');
      updateParams.push(null);

      // Snapshot de valor_original no primeiro override
      if (item.valor_original === null || item.valor_original === undefined) {
        updates.push('valor_original = ?');
        updateParams.push(item.valor);
      }
    } else if (valorRecebido !== undefined) {
      const valorNum = Number(valorRecebido);
      const baseline = item.valor_original ?? item.valor_final ?? item.valor;
      const descontoValor = Math.max(0, baseline - valorNum);

      updates.push('valor = ?');
      updateParams.push(valorNum);
      updates.push('valor_final = ?');
      updateParams.push(valorNum);
      updates.push('desconto_valor = ?');
      updateParams.push(descontoValor);
      updates.push('desconto_motivo = ?');
      updateParams.push(descontoValor > 0 ? (desconto_motivo?.trim() || null) : null);
      updates.push('desconto_aplicado_por_id = ?');
      updateParams.push(descontoValor > 0 ? context.user.sub : null);
      updates.push('desconto_aplicado_em = ?');
      updateParams.push(descontoValor > 0 ? new Date().toISOString() : null);

      // Backfill defensivo: se o item é legacy (valor_original IS NULL),
      // snapshota o valor atual (antes da edição) como baseline do orçamento.
      if (item.valor_original === null || item.valor_original === undefined) {
        updates.push('valor_original = ?');
        updateParams.push(item.valor);
      }
    }
    
    if (status !== undefined) {
      updates.push('status = ?');
      updateParams.push(status);
      
      // Se concluindo, marca a data
      if (status === 'concluido') {
        updates.push('concluido_at = CURRENT_TIMESTAMP');
      }
    }
    
    if (dentes !== undefined) {
      updates.push('dentes = ?');
      updateParams.push(dentes);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }
    
    updateParams.push(parseInt(itemId));
    
    await execute(
      `UPDATE itens_atendimento SET ${updates.join(', ')} WHERE id = ?`,
      updateParams
    );

    // Gera comissões quando item é marcado como concluído
    let atendimentoFinalizado = false;
    let atendimentoVoltouParaPagamento = false;
    if (status === 'concluido') {
      await gerarComissoesItem(parseInt(itemId));

      // Auto-transição: se todos os itens do atendimento estão concluídos →
      //   - Se há itens adicionados em execução ainda não pagos → volta para 'aguardando_pagamento'
      //   - Caso contrário → 'finalizado'
      const contagem = await queryOne<{ total: number; concluidos: number; pendentes_pagamento: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'concluido' THEN 1 ELSE 0 END) as concluidos,
                SUM(CASE WHEN adicionado_em_execucao = 1 AND valor_pago < valor THEN 1 ELSE 0 END) as pendentes_pagamento
         FROM itens_atendimento WHERE atendimento_id = ?`,
        [parseInt(id)]
      );
      if (contagem && contagem.total > 0 && contagem.total === contagem.concluidos) {
        if (contagem.pendentes_pagamento > 0) {
          // Há procedimentos adicionados em execução que ainda precisam ser cobrados
          const res = await execute(
            `UPDATE atendimentos
             SET status = 'aguardando_pagamento',
                 liberado_por_id = NULL,
                 liberado_em = NULL
             WHERE id = ? AND status = 'em_execucao'`,
            [parseInt(id)]
          );
          atendimentoVoltouParaPagamento = res.changes > 0;
        } else {
          const res = await execute(
            `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now','localtime')
             WHERE id = ? AND status = 'em_execucao'`,
            [parseInt(id)]
          );
          atendimentoFinalizado = res.changes > 0;
        }
      }
    }

    // Retorna item atualizado
    const atualizado = await queryOne<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null }>(
      `SELECT 
        i.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      WHERE i.id = ?`,
      [parseInt(itemId)]
    );
    
    return NextResponse.json({
      ...atualizado,
      atendimento_finalizado: atendimentoFinalizado,
      atendimento_voltou_para_pagamento: atendimentoVoltouParaPagamento,
    });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar item' },
      { status: 500 }
    );
  }
});
