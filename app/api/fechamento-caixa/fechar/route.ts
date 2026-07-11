import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { fecharFechamentoCaixa, validarDataFechamentoCaixa } from '@/lib/helpers/fechamentoCaixa';

export const POST = withUnitRole(['admin', 'atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const body = await request.json().catch(() => ({}));
    const data = validarDataFechamentoCaixa(body.data ?? null);
    const response = await fecharFechamentoCaixa({
      unidadeId: context.unidadeId,
      dataReferencia: data,
      usuarioId: context.user.sub,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao fechar caixa:', error);
    const message = error instanceof Error ? error.message : 'Erro ao fechar caixa';
    const status = (
      message.includes('Data inválida')
      || message.includes('obrigatório')
      || message.includes('inválido')
    ) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
});
