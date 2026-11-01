import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { cancelarPagamento } from '@/modules/financeiro/server';

export const PUT = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    const { id, pagamentoId } = await context.params! as { id: string; pagamentoId: string };
    const { motivo } = await request.json();
    const result = await cancelarPagamento(parseInt(id), parseInt(pagamentoId), context.unidadeId, motivo, request.headers.get('Idempotency-Key') ?? undefined);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});
