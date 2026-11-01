import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { estornarProcedimento } from '@/modules/financeiro/server';

export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await estornarProcedimento(Number(id), await request.json().catch(() => null), context.unidadeId, request.headers.get('Idempotency-Key') ?? undefined);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao estornar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao estornar procedimento' }, { status: 500 });
  }
});
