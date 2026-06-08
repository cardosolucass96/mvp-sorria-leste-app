import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { reabrirFechamentoCaixa, validarDataFechamentoCaixa } from '@/lib/helpers/fechamentoCaixa';

export const POST = withUnitRole(['admin'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const body = await request.json().catch(() => ({}));
    const data = validarDataFechamentoCaixa(body.data ?? null);
    const motivo = typeof body.motivo === 'string' ? body.motivo : '';
    const response = await reabrirFechamentoCaixa({
      unidadeId: context.unidadeId,
      dataReferencia: data,
      usuarioId: context.user.sub,
      motivo,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao reabrir fechamento de caixa:', error);
    const message = error instanceof Error ? error.message : 'Erro ao reabrir fechamento de caixa';
    const status = (
      message.includes('Data inválida')
      || message.includes('obrigatório')
      || message.includes('inválido')
      || message.includes('Não existe fechamento')
    ) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
});
