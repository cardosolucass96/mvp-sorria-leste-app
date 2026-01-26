import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

interface Parcela {
  id: number;
  atendimento_id: number;
  numero: number;
  valor: number;
  data_vencimento: string;
  pago: number;
  pagamento_id: number | null;
  observacoes: string | null;
  created_at: string;
}

interface Atendimento {
  id: number;
  status: string;
}

// GET /api/atendimentos/[id]/parcelas - Lista parcelas do atendimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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
    
    const parcelas = await query<Parcela>(
      `SELECT * FROM parcelas 
       WHERE atendimento_id = ? 
       ORDER BY numero ASC`,
      [parseInt(id)]
    );
    
    return NextResponse.json(parcelas);
  } catch (error) {
    console.error('Erro ao buscar parcelas:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar parcelas' },
      { status: 500 }
    );
  }
}

// POST /api/atendimentos/[id]/parcelas - Cria nova parcela agendada
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { valor, data_vencimento, observacoes } = body;
    
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
    
    // Validações
    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor da parcela é obrigatório e deve ser maior que zero' },
        { status: 400 }
      );
    }
    
    if (!data_vencimento) {
      return NextResponse.json(
        { error: 'Data de vencimento é obrigatória' },
        { status: 400 }
      );
    }
    
    // Busca o próximo número de parcela
    const ultimaParcela = await queryOne<{ max_numero: number }>(
      'SELECT MAX(numero) as max_numero FROM parcelas WHERE atendimento_id = ?',
      [parseInt(id)]
    );
    const numeroParcela = (ultimaParcela?.max_numero || 0) + 1;
    
    // Insere parcela
    const result = await execute(
      `INSERT INTO parcelas (atendimento_id, numero, valor, data_vencimento, observacoes)
       VALUES (?, ?, ?, ?, ?)`,
      [parseInt(id), numeroParcela, valor, data_vencimento, observacoes || null]
    );
    
    // Retorna a parcela criada
    const novaParcela = await queryOne<Parcela>(
      'SELECT * FROM parcelas WHERE id = ?',
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(novaParcela, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar parcela:', error);
    return NextResponse.json(
      { error: 'Erro ao criar parcela' },
      { status: 500 }
    );
  }
}

// DELETE /api/atendimentos/[id]/parcelas - Remove parcela por ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const parcelaId = searchParams.get('parcela_id');
    
    if (!parcelaId) {
      return NextResponse.json(
        { error: 'ID da parcela é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se parcela existe e pertence ao atendimento
    const parcela = await queryOne<Parcela>(
      'SELECT * FROM parcelas WHERE id = ? AND atendimento_id = ?',
      [parseInt(parcelaId), parseInt(id)]
    );
    
    if (!parcela) {
      return NextResponse.json(
        { error: 'Parcela não encontrada' },
        { status: 404 }
      );
    }
    
    // Não permite remover parcela já paga
    if (parcela.pago) {
      return NextResponse.json(
        { error: 'Não é possível remover parcela já paga' },
        { status: 400 }
      );
    }
    
    // Remove parcela
    await execute('DELETE FROM parcelas WHERE id = ?', [parseInt(parcelaId)]);
    
    return NextResponse.json({ message: 'Parcela removida com sucesso' });
  } catch (error) {
    console.error('Erro ao remover parcela:', error);
    return NextResponse.json(
      { error: 'Erro ao remover parcela' },
      { status: 500 }
    );
  }
}

// PUT /api/atendimentos/[id]/parcelas - Marca parcela como paga
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { parcela_id, pagamento_id } = body;
    
    if (!parcela_id) {
      return NextResponse.json(
        { error: 'ID da parcela é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se parcela existe e pertence ao atendimento
    const parcela = await queryOne<Parcela>(
      'SELECT * FROM parcelas WHERE id = ? AND atendimento_id = ?',
      [parcela_id, parseInt(id)]
    );
    
    if (!parcela) {
      return NextResponse.json(
        { error: 'Parcela não encontrada' },
        { status: 404 }
      );
    }
    
    // Atualiza parcela como paga
    await execute(
      'UPDATE parcelas SET pago = 1, pagamento_id = ? WHERE id = ?',
      [pagamento_id || null, parcela_id]
    );
    
    // Retorna parcela atualizada
    const atualizada = await queryOne<Parcela>(
      'SELECT * FROM parcelas WHERE id = ?',
      [parcela_id]
    );
    
    return NextResponse.json(atualizada);
  } catch (error) {
    console.error('Erro ao atualizar parcela:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar parcela' },
      { status: 500 }
    );
  }
}
