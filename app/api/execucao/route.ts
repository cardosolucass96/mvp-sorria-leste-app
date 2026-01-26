import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface ProcedimentoExecucao {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  executor_nome: string | null;
  cliente_nome: string;
  status: string;
  created_at: string;
  concluido_at: string | null;
}

// GET /api/execucao?executor_id=X - Lista PROCEDIMENTOS individuais para o executor
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const executorId = searchParams.get('executor_id');

    if (!executorId) {
      return NextResponse.json(
        { error: 'executor_id é obrigatório' },
        { status: 400 }
      );
    }

    // Busca PROCEDIMENTOS PAGOS individuais:
    // 1. Já atribuídos ao executor (meus)
    // 2. Sem executor definido (disponíveis para pegar)
    const procedimentos = await query<ProcedimentoExecucao>(
      `SELECT 
        i.id,
        i.atendimento_id,
        i.procedimento_id,
        p.nome as procedimento_nome,
        i.executor_id,
        e.nome as executor_nome,
        c.nome as cliente_nome,
        i.status,
        i.created_at,
        i.concluido_at
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios e ON i.executor_id = e.id
      WHERE a.status = 'em_execucao'
      AND i.status IN ('pago', 'executando', 'concluido')
      AND (i.executor_id = ? OR i.executor_id IS NULL)
      ORDER BY 
        CASE WHEN i.executor_id = ? THEN 0 ELSE 1 END,
        i.created_at DESC`,
      [parseInt(executorId), parseInt(executorId)]
    );

    // Separa em "meus" e "disponíveis"
    const meusProcedimentos = procedimentos.filter(p => p.executor_id === parseInt(executorId));
    const disponiveis = procedimentos.filter(p => p.executor_id === null);

    return NextResponse.json({
      meusProcedimentos,
      disponiveis
    });
  } catch (error) {
    console.error('Erro ao buscar procedimentos do executor:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar procedimentos' },
      { status: 500 }
    );
  }
}
