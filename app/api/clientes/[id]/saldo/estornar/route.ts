import { NextRequest, NextResponse } from 'next/server';
import { estornarSaldo } from '@/modules/financeiro/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await estornarSaldo(parseInt(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao estornar saldo:', error);
    return NextResponse.json({ error: 'Erro ao estornar saldo' }, { status: 500 });
  }
}
