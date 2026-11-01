import { NextRequest, NextResponse } from 'next/server';
import { creditarSaldo } from '@/modules/financeiro/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await creditarSaldo(parseInt(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao creditar saldo:', error);
    return NextResponse.json({ error: 'Erro ao creditar saldo' }, { status: 500 });
  }
}
