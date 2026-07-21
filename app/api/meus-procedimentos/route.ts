import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { getStoredUtcInstantMillis } from '@/lib/time';
import { isRestrictedDentistPatientView } from '@/lib/auth/patientPrivacy';

interface ProcedimentoRow {
  item_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_id: number;
  cliente_nome: string;
  dentes: string | null;
  quantidade: number;
  status: string;
  tipo: string;
  valor: number | null;
  valor_final: number | null;
  valor_pago: number;
  adicionado_em_execucao: number;
  created_at: string;
  concluido_at: string | null;
}

export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  const searchParams = request.nextUrl.searchParams;
  const usuarioId = searchParams.get('usuario_id');

  if (!usuarioId) {
    return NextResponse.json({ error: 'usuario_id é obrigatório' }, { status: 400 });
  }

  if (isRestrictedDentistPatientView(context.user) && parseInt(usuarioId, 10) !== context.user.sub) {
    return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
  }

  try {
    // Buscar procedimentos onde o usuário foi o avaliador (criou o item)
    const avaliacoes = await query<ProcedimentoRow>(
      `SELECT
        ia.id as item_id,
        ia.atendimento_id,
        p.nome as procedimento_nome,
        c.id as cliente_id,
        c.nome as cliente_nome,
        ia.dentes,
        ia.quantidade,
        ia.status,
        'avaliacao' as tipo,
        ia.valor,
        ia.valor_final,
        ia.valor_pago,
        ia.adicionado_em_execucao,
        ia.created_at,
        ia.concluido_at
      FROM itens_atendimento ia
      JOIN procedimentos p ON ia.procedimento_id = p.id
      JOIN atendimentos a ON ia.atendimento_id = a.id
      JOIN clientes c ON a.cliente_id = c.id
      WHERE ia.criado_por_id = ? AND a.unidade_id = ?
      ORDER BY ia.created_at DESC`,
      [usuarioId, context.unidadeId]
    );

    // Buscar procedimentos onde o usuário foi o executor
    const execucoes = await query<ProcedimentoRow>(
      `SELECT
        ia.id as item_id,
        ia.atendimento_id,
        p.nome as procedimento_nome,
        c.id as cliente_id,
        c.nome as cliente_nome,
        ia.dentes,
        ia.quantidade,
        ia.status,
        'execucao' as tipo,
        ia.valor,
        ia.valor_final,
        ia.valor_pago,
        ia.adicionado_em_execucao,
        ia.created_at,
        ia.concluido_at
      FROM itens_atendimento ia
      JOIN procedimentos p ON ia.procedimento_id = p.id
      JOIN atendimentos a ON ia.atendimento_id = a.id
      JOIN clientes c ON a.cliente_id = c.id
      WHERE ia.executor_id = ? AND a.unidade_id = ?
      ORDER BY ia.created_at DESC`,
      [usuarioId, context.unidadeId]
    );

    // Combinar e ordenar por data
    const todos = [...avaliacoes, ...execucoes].sort((a, b) => {
      const dataA = getStoredUtcInstantMillis(a.concluido_at || a.created_at) ?? 0;
      const dataB = getStoredUtcInstantMillis(b.concluido_at || b.created_at) ?? 0;
      return dataB - dataA;
    });

    return NextResponse.json(todos);
  } catch (error) {
    console.error('Erro ao buscar procedimentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar procedimentos' }, { status: 500 });
  }
});
