import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { debitarSaldo } from '@/modules/financeiro/server';

export const POST = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await debitarSaldo(Number(id), await request.json().catch(() => null), context.unidadeId, request.headers.get('Idempotency-Key') ?? undefined);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao debitar saldo:', error);
    return NextResponse.json({ error: 'Erro ao debitar saldo' }, { status: 500 });
  }
});
