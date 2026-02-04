import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  ativo: number;
  created_at: string;
}

// GET /api/procedimentos/[id] - Busca procedimento por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const procedimento = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!procedimento) {
      return NextResponse.json(
        { error: 'Procedimento não encontrado' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(procedimento);
  } catch (error) {
    console.error('Erro ao buscar procedimento:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar procedimento' },
      { status: 500 }
    );
  }
}

// PUT /api/procedimentos/[id] - Atualiza procedimento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nome, valor, comissao_venda, comissao_execucao, ativo } = body;
    
    // Verifica se existe
    const existe = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!existe) {
      return NextResponse.json(
        { error: 'Procedimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Validações
    if (nome !== undefined && nome.trim() === '') {
      return NextResponse.json(
        { error: 'Nome não pode ser vazio' },
        { status: 400 }
      );
    }
    
    if (valor !== undefined && valor < 0) {
      return NextResponse.json(
        { error: 'Valor deve ser maior ou igual a zero' },
        { status: 400 }
      );
    }
    
    if (comissao_venda !== undefined && (comissao_venda < 0 || comissao_venda > 100)) {
      return NextResponse.json(
        { error: 'Comissão de venda deve estar entre 0 e 100' },
        { status: 400 }
      );
    }
    
    if (comissao_execucao !== undefined && (comissao_execucao < 0 || comissao_execucao > 100)) {
      return NextResponse.json(
        { error: 'Comissão de execução deve estar entre 0 e 100' },
        { status: 400 }
      );
    }
    
    // Monta query de update dinamicamente
    const updates: string[] = [];
    const updateParams: (string | number)[] = [];
    
    if (nome !== undefined) {
      updates.push('nome = ?');
      updateParams.push(nome.trim());
    }
    if (valor !== undefined) {
      updates.push('valor = ?');
      updateParams.push(valor);
    }
    if (comissao_venda !== undefined) {
      updates.push('comissao_venda = ?');
      updateParams.push(comissao_venda);
    }
    if (comissao_execucao !== undefined) {
      updates.push('comissao_execucao = ?');
      updateParams.push(comissao_execucao);
    }
    if (ativo !== undefined) {
      updates.push('ativo = ?');
      updateParams.push(ativo ? 1 : 0);
    }
    if (body.por_dente !== undefined) {
      updates.push('por_dente = ?');
      updateParams.push(body.por_dente ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }
    
    updateParams.push(parseInt(id));
    
    await execute(
      `UPDATE procedimentos SET ${updates.join(', ')} WHERE id = ?`,
      updateParams
    );
    
    const atualizado = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    return NextResponse.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar procedimento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar procedimento' },
      { status: 500 }
    );
  }
}

// DELETE /api/procedimentos/[id] - Desativa procedimento (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verifica se existe
    const existe = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!existe) {
      return NextResponse.json(
        { error: 'Procedimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Soft delete - apenas desativa
    await execute(
      'UPDATE procedimentos SET ativo = 0 WHERE id = ?',
      [parseInt(id)]
    );
    
    return NextResponse.json({ message: 'Procedimento desativado com sucesso' });
  } catch (error) {
    console.error('Erro ao desativar procedimento:', error);
    return NextResponse.json(
      { error: 'Erro ao desativar procedimento' },
      { status: 500 }
    );
  }
}
