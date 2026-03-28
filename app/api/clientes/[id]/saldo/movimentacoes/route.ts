import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/clientes/[id]/saldo/movimentacoes - Lista últimas movimentações
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    // Verifica se cliente existe
    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [clienteId]
    );

    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    const movimentacoes = await query(
      `SELECT * FROM movimentacoes_saldo
       WHERE cliente_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [clienteId]
    );

    return NextResponse.json(movimentacoes);
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar movimentações' },
      { status: 500 }
    );
  }
}
