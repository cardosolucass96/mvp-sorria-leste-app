import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface AgendamentoRow {
  id: number;
  cliente_id: number;
  procedimento_id: number;
  executor_id: number | null;
  status: string;
}

// POST /api/agendamentos/[id]/chegou — Client arrived for scheduled session
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agendamentoId = parseInt(id);

    const rows = await query<AgendamentoRow>(
      'SELECT id, cliente_id, procedimento_id, executor_id, status FROM agendamentos WHERE id = ?',
      [agendamentoId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    const ag = rows[0];

    if (ag.status !== 'pendente' && ag.status !== 'agendado') {
      return NextResponse.json({ error: 'Agendamento já foi processado' }, { status: 400 });
    }

    // Create atendimento of type 'sessao'
    const result = await execute(
      `INSERT INTO atendimentos (cliente_id, status, tipo) VALUES (?, 'triagem', 'sessao')`,
      [ag.cliente_id]
    );

    const atendimentoId = result.lastInsertRowid;

    // Add procedure item to the new atendimento
    await execute(
      `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, valor, status)
       SELECT ?, ?, ?, p.valor, 'pendente'
       FROM procedimentos p WHERE p.id = ?`,
      [atendimentoId, ag.procedimento_id, ag.executor_id, ag.procedimento_id]
    );

    // Mark agendamento as arrived
    await execute(
      `UPDATE agendamentos SET status = 'chegou', atendimento_id = ? WHERE id = ?`,
      [atendimentoId, agendamentoId]
    );

    return NextResponse.json({
      success: true,
      atendimento_id: atendimentoId,
    });
  } catch (error) {
    console.error('Erro ao registrar chegada:', error);
    return NextResponse.json({ error: 'Erro ao registrar chegada' }, { status: 500 });
  }
}
