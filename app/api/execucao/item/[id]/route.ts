import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  executor_nome: string | null;
  criado_por_id: number | null;
  criado_por_nome: string | null;
  cliente_nome: string;
  cliente_id: number;
  valor: number;
  valor_pago: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
}

// GET /api/execucao/item/[id] - Busca um item de atendimento específico pelo ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const itens = await query<ItemAtendimento>(
      `SELECT 
        i.id,
        i.atendimento_id,
        i.procedimento_id,
        p.nome as procedimento_nome,
        i.executor_id,
        e.nome as executor_nome,
        i.criado_por_id,
        cp.nome as criado_por_nome,
        c.nome as cliente_nome,
        c.id as cliente_id,
        i.valor,
        i.valor_pago,
        i.status,
        i.created_at,
        i.concluido_at
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios e ON i.executor_id = e.id
      LEFT JOIN usuarios cp ON i.criado_por_id = cp.id
      WHERE i.id = ?`,
      [parseInt(id)]
    );

    if (itens.length === 0) {
      return NextResponse.json(
        { error: 'Item não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(itens[0]);
  } catch (error) {
    console.error('Erro ao buscar item:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar item' },
      { status: 500 }
    );
  }
}
