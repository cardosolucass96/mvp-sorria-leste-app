import { NextRequest, NextResponse } from 'next/server';
import { transferirSaldo } from '@/modules/financeiro/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await transferirSaldo(parseInt(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    return NextResponse.json({ error: 'Erro ao transferir saldo' }, { status: 500 });
  }
}
