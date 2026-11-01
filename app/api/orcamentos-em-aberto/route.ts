import { NextResponse } from 'next/server';
import { withUnitRole } from '@/lib/auth/middleware';
import { listarOrcamentosEmAberto } from '@/modules/orcamentos/server';

export const GET = withUnitRole(['admin', 'atendente'], async (_request, context) => {
  try {
    return NextResponse.json(await listarOrcamentosEmAberto(context.unidadeId));
  } catch (error) {
    console.error('Erro ao listar orçamentos em aberto:', error);
    return NextResponse.json({ error: 'Erro ao listar orçamentos em aberto' }, { status: 500 });
  }
});
