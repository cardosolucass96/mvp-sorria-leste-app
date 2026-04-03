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
  status: string;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
}

// PUT /api/atendimentos/[id]/itens/[itemId] - Atualiza item
export const PUT = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id, itemId } = await context.params! as { id: string; itemId: string };
    const body = await request.json();
    const { executor_id, valor, status, usuario_id, dentes } = body;

    // Verifica se atendimento existe e pertence à unidade
    const atendimento = await queryOne<Atendimento>(
      'SELECT id, status, unidade_id FROM atendimentos WHERE id = ?',
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
    
    // Monta update
    const updates: string[] = [];
    const updateParams: (string | number | null)[] = [];
    
    if (executor_id !== undefined) {
      updates.push('executor_id = ?');
      updateParams.push(executor_id || null);
    }
    
    if (valor !== undefined) {
      updates.push('valor = ?');
      updateParams.push(valor);
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
    if (status === 'concluido') {
      await gerarComissoesItem(parseInt(itemId));

      // Auto-transição: se todos os itens do atendimento estão concluídos → finalizado
      const contagem = await queryOne<{ total: number; concluidos: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status = 'concluido' THEN 1 ELSE 0 END) as concluidos
         FROM itens_atendimento WHERE atendimento_id = ?`,
        [parseInt(id)]
      );
      if (contagem && contagem.total > 0 && contagem.total === contagem.concluidos) {
        const res = await execute(
          `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now','localtime')
           WHERE id = ? AND status = 'em_execucao'`,
          [parseInt(id)]
        );
        atendimentoFinalizado = res.changes > 0;
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
    
    return NextResponse.json({ ...atualizado, atendimento_finalizado: atendimentoFinalizado });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar item' },
      { status: 500 }
    );
  }
});
