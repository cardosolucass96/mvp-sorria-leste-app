import { NextRequest, NextResponse } from 'next/server';
import { consultarMovimentacoesSaldo } from '@/modules/financeiro/server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await consultarMovimentacoesSaldo(parseInt(id));
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    return NextResponse.json({ error: 'Erro ao buscar movimentações' }, { status: 500 });
  }
}
