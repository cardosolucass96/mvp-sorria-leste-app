import { NextRequest, NextResponse } from 'next/server';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import {
  obterFechamentoCaixaResponse,
  salvarDraftFechamentoCaixa,
  validarDataFechamentoCaixa,
} from '@/lib/helpers/fechamentoCaixa';
import type { FechamentoCaixaDraft } from '@/lib/fechamento-caixa/types';

export const GET = withUnitRole(['admin'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { searchParams } = new URL(request.url);
    const data = validarDataFechamentoCaixa(searchParams.get('data'));
    const response = await obterFechamentoCaixaResponse(context.unidadeId, data);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao buscar fechamento de caixa:', error);
    const message = error instanceof Error ? error.message : 'Erro ao buscar fechamento de caixa';
    return NextResponse.json({ error: message }, { status: message.includes('Data inválida') ? 400 : 500 });
  }
});

export const PUT = withUnitRole(['admin'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { searchParams } = new URL(request.url);
    const data = validarDataFechamentoCaixa(searchParams.get('data'));
    const body = await request.json().catch(() => ({}));
    const draft = body.draft as FechamentoCaixaDraft | undefined;

    if (!draft) {
      return NextResponse.json({ error: 'draft é obrigatório' }, { status: 400 });
    }

    const response = await salvarDraftFechamentoCaixa({
      unidadeId: context.unidadeId,
      dataReferencia: data,
      draft,
      usuarioId: context.user.sub,
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro ao salvar draft do fechamento de caixa:', error);
    const message = error instanceof Error ? error.message : 'Erro ao salvar fechamento de caixa';
    const status = (
      message.includes('Data inválida')
      || message.includes('obrigatório')
      || message.includes('inválido')
    ) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
});
