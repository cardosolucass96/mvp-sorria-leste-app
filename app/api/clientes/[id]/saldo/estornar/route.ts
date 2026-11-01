import { NextResponse } from 'next/server';
import { withRole } from '@/lib/auth/middleware';
import { estornarSaldo } from '@/modules/financeiro/server';

export const POST = withRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await estornarSaldo(Number(id), await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    console.error('Erro ao estornar saldo:', error);
    return NextResponse.json({ error: 'Erro ao estornar saldo' }, { status: 500 });
  }
});
