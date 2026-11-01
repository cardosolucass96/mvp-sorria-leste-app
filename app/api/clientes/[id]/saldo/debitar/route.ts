import { NextRequest, NextResponse } from 'next/server';
import { debitarSaldo } from '@/modules/financeiro/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await debitarSaldo(parseInt(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao debitar saldo:', error);
    return NextResponse.json({ error: 'Erro ao debitar saldo' }, { status: 500 });
  }
}
