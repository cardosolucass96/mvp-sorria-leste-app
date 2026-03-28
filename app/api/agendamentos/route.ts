import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface AgendamentoRow {
  id: number;
  cliente_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  data_agendada: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
}

// GET /api/agendamentos?cliente_id=X&status=pendente,agendado
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('cliente_id');
    const statusParam = searchParams.get('status');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (clienteId) {
      conditions.push('a.cliente_id = ?');
      params.push(parseInt(clienteId));
    }

    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim());
      conditions.push(`a.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const agendamentos = await query<AgendamentoRow>(
      `SELECT a.id, a.cliente_id, a.procedimento_id, p.nome as procedimento_nome,
              a.executor_id, a.data_agendada, a.status, a.observacoes, a.created_at
       FROM agendamentos a
       JOIN procedimentos p ON p.id = a.procedimento_id
       ${where}
       ORDER BY a.data_agendada ASC, a.created_at DESC`,
      params
    );

    return NextResponse.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar agendamentos' }, { status: 500 });
  }
}
