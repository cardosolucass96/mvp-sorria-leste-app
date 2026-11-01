import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { estornarProcedimento } from '@/modules/financeiro/server';

export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await estornarProcedimento(Number(id), await request.json(), context.unidadeId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    console.error('Erro ao estornar procedimento:', error);
    return NextResponse.json({ error: 'Erro ao estornar procedimento' }, { status: 500 });
  }
});
