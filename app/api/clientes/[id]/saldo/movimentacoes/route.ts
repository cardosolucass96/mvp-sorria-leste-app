import { NextResponse } from 'next/server';
import { withRole } from '@/lib/auth/middleware';
import { consultarMovimentacoesSaldo } from '@/modules/financeiro/server';

export const GET = withRole(['admin', 'atendente'], async (_request, context) => {
  try {
    const { id } = await context.params!;
    const result = await consultarMovimentacoesSaldo(Number(id));
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao buscar movimentações:', error);
    return NextResponse.json({ error: 'Erro ao buscar movimentações' }, { status: 500 });
  }
});
