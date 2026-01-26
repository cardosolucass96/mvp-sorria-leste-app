import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

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
}

// PUT /api/atendimentos/[id]/itens/[itemId] - Atualiza item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    const { executor_id, valor, status, usuario_id } = body;
    
    // Verifica se atendimento existe
    const atendimento = await queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
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
    
    return NextResponse.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar item' },
      { status: 500 }
    );
  }
}
