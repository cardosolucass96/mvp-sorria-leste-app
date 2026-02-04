import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
}

interface Atendimento {
  id: number;
  status: string;
}

// GET /api/atendimentos/[id]/itens - Lista itens do atendimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const itens = await query<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null; criado_por_nome: string | null }>(
      `SELECT 
        i.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome,
        c.nome as criado_por_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      LEFT JOIN usuarios c ON i.criado_por_id = c.id
      WHERE i.atendimento_id = ?
      ORDER BY i.created_at ASC`,
      [parseInt(id)]
    );
    
    return NextResponse.json(itens);
  } catch (error) {
    console.error('Erro ao buscar itens:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar itens' },
      { status: 500 }
    );
  }
}

// POST /api/atendimentos/[id]/itens - Adiciona item ao atendimento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade } = body;
    
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
    
    // Verifica se pode adicionar itens (triagem, avaliacao ou em_execucao)
    if (!['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Não é possível adicionar procedimentos neste status' },
        { status: 400 }
      );
    }
    
    // Validações
    if (!procedimento_id) {
      return NextResponse.json(
        { error: 'Procedimento é obrigatório' },
        { status: 400 }
      );
    }
    
    // Busca procedimento para pegar valor padrão
    const procedimento = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ? AND ativo = 1',
      [procedimento_id]
    );
    
    if (!procedimento) {
      return NextResponse.json(
        { error: 'Procedimento não encontrado ou inativo' },
        { status: 404 }
      );
    }
    
    // Verifica executor se fornecido
    if (executor_id) {
      const executor = await queryOne<{ id: number; role: string }>(
        "SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1",
        [executor_id]
      );
      
      if (!executor) {
        return NextResponse.json(
          { error: 'Executor não encontrado' },
          { status: 404 }
        );
      }
      
      if (executor.role !== 'executor' && executor.role !== 'admin') {
        return NextResponse.json(
          { error: 'Usuário selecionado não é executor' },
          { status: 400 }
        );
      }
    }
    
    // Usa valor do procedimento se não fornecido
    const valorFinal = valor !== undefined ? valor : procedimento.valor;
    const quantidadeFinal = quantidade || 1;
    
    // Insere item
    const result = await execute(
      `INSERT INTO itens_atendimento 
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [
        parseInt(id),
        procedimento_id,
        executor_id || null,
        criado_por_id || null,
        valorFinal,
        dentes || null,
        quantidadeFinal
      ]
    );
    
    // Se adicionou durante execução, volta para aguardando_pagamento
    if (atendimento.status === 'em_execucao') {
      await execute(
        "UPDATE atendimentos SET status = 'aguardando_pagamento' WHERE id = ?",
        [parseInt(id)]
      );
    }
    
    // Retorna item criado
    const novoItem = await queryOne<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null }>(
      `SELECT 
        i.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      WHERE i.id = ?`,
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(novoItem, { status: 201 });
  } catch (error) {
    console.error('Erro ao adicionar item:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar item' },
      { status: 500 }
    );
  }
}

// DELETE /api/atendimentos/[id]/itens - Remove item (só na avaliação, pelo criador)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');
    const usuarioId = searchParams.get('usuario_id');
    
    if (!itemId) {
      return NextResponse.json(
        { error: 'ID do item é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se atendimento existe e está em avaliação
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
    
    if (atendimento.status !== 'avaliacao') {
      return NextResponse.json(
        { error: 'Só é possível remover procedimentos durante a avaliação' },
        { status: 400 }
      );
    }
    
    // Verifica se item existe e pertence ao atendimento
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
    
    // Remove item
    await execute('DELETE FROM itens_atendimento WHERE id = ?', [parseInt(itemId)]);
    
    return NextResponse.json({ message: 'Item removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    return NextResponse.json(
      { error: 'Erro ao remover item' },
      { status: 500 }
    );
  }
}
