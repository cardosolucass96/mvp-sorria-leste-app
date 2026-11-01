import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { debitarSaldo } from '@/modules/financeiro/server';

export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await debitarSaldo(Number(id), await request.json(), context.unidadeId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    console.error('Erro ao debitar saldo:', error);
    return NextResponse.json({ error: 'Erro ao debitar saldo' }, { status: 500 });
  }
});
