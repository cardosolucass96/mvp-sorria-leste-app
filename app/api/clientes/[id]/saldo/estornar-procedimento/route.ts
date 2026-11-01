import { NextRequest, NextResponse } from 'next/server';
import { estornarProcedimento } from '@/modules/financeiro/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await estornarProcedimento(parseInt(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao estornar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao estornar procedimento' }, { status: 500 });
  }
}
