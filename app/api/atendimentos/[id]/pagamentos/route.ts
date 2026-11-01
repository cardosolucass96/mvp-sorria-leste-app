import { NextResponse } from 'next/server';
import { withUnit } from '@/lib/auth/middleware';
import { listarPagamentos, registrarPagamento } from '@/modules/financeiro/server';

export const GET = withUnit(async (request, context) => {
  const { id } = await context.params!;
  const result = await listarPagamentos(parseInt(id as string), context.unidadeId, request.nextUrl.searchParams.get('grouped') === '1');
  return NextResponse.json(result.body, { status: result.status });
});

export const POST = withUnit(async (request, context) => {
  try {
    const { id } = await context.params!;
    const result = await registrarPagamento(parseInt(id as string), context.unidadeId, context.user.sub, await request.json());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro ao registrar pagamento' }, { status: 500 });
  }
});
