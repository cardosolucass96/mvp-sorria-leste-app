import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SaldoCliente {
  cliente_id: number;
  saldo: number;
  updated_at: string;
}

interface Movimentacao {
  id: number;
  cliente_id: number;
  tipo: string;
  valor: number;
  saldo_anterior: number;
  saldo_novo: number;
  pagamento_id: number | null;
  item_atendimento_id: number | null;
  atendimento_id: number | null;
  cliente_destino_id: number | null;
  observacoes: string | null;
  created_at: string;
}

// GET /api/clientes/[id]/saldo - Saldo atual + últimas movimentações
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [id]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const saldoRow = await queryOne<SaldoCliente>(
      'SELECT saldo, updated_at FROM saldo_clientes WHERE cliente_id = ?',
      [id]
    );

    const movimentacoes = await query<Movimentacao>(
      `SELECT m.*
       FROM movimentacoes_saldo m
       WHERE m.cliente_id = ?
       ORDER BY m.created_at DESC
       LIMIT 20`,
      [id]
    );

    return NextResponse.json({
      saldo: saldoRow?.saldo ?? 0,
      updated_at: saldoRow?.updated_at ?? null,
      movimentacoes,
    });
  } catch (error) {
    console.error('Erro ao buscar saldo do cliente:', error);
    return NextResponse.json({ error: 'Erro ao buscar saldo do cliente' }, { status: 500 });
  }
}
