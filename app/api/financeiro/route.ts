import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { obterFinanceiroResponse } from '@/lib/financeiro/financeiro';

export const GET = withUnitRole(['admin'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { searchParams } = new URL(request.url);
    const response = await obterFinanceiroResponse({
      unidadeId: context.unidadeId,
      data: searchParams.get('data'),
      dataInicio: searchParams.get('data_inicio'),
      dataFim: searchParams.get('data_fim'),
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao buscar financeiro:', error);
    const message = error instanceof Error ? error.message : 'Erro ao buscar financeiro';
    const status = (
      message.includes('Data inválida')
      || message.includes('Data início')
      || message.includes('Período máximo')
    ) ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
});
