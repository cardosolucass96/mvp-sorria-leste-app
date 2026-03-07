import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ProcedimentoRow {
  item_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_nome: string;
  dentes: string | null;
  quantidade: number;
  status: string;
  tipo: string;
  created_at: string;
  concluido_at: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const usuarioId = searchParams.get('usuario_id');

  if (!usuarioId) {
    return NextResponse.json({ error: 'usuario_id é obrigatório' }, { status: 400 });
  }

  try {
    // Buscar procedimentos onde o usuário foi o avaliador (criou o item)
    const avaliacoes = await query<ProcedimentoRow>(
      `SELECT 
        ia.id as item_id,
        ia.atendimento_id,
        p.nome as procedimento_nome,
        c.nome as cliente_nome,
        ia.dentes,
        ia.quantidade,
        ia.status,
        'avaliacao' as tipo,
        ia.created_at,
        ia.concluido_at
      FROM itens_atendimento ia
      JOIN procedimentos p ON ia.procedimento_id = p.id
      JOIN atendimentos a ON ia.atendimento_id = a.id
      JOIN clientes c ON a.cliente_id = c.id
      WHERE ia.criado_por_id = ?
      ORDER BY ia.created_at DESC`,
      [usuarioId]
    );

    // Buscar procedimentos onde o usuário foi o executor
    const execucoes = await query<ProcedimentoRow>(
      `SELECT 
        ia.id as item_id,
        ia.atendimento_id,
        p.nome as procedimento_nome,
        c.nome as cliente_nome,
        ia.dentes,
        ia.quantidade,
        ia.status,
        'execucao' as tipo,
        ia.created_at,
        ia.concluido_at
      FROM itens_atendimento ia
      JOIN procedimentos p ON ia.procedimento_id = p.id
      JOIN atendimentos a ON ia.atendimento_id = a.id
      JOIN clientes c ON a.cliente_id = c.id
      WHERE ia.executor_id = ?
      ORDER BY ia.created_at DESC`,
      [usuarioId]
    );

    // Combinar e ordenar por data
    const todos = [...avaliacoes, ...execucoes].sort((a, b) => {
      const dataA = new Date(a.concluido_at || a.created_at).getTime();
      const dataB = new Date(b.concluido_at || b.created_at).getTime();
      return dataB - dataA;
    });

    return NextResponse.json(todos);
  } catch (error) {
    console.error('Erro ao buscar procedimentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar procedimentos' }, { status: 500 });
  }
}
