import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface AtendimentoRow {
  id: number;
  cliente_id: number;
  status: string;
}

// POST /api/atendimentos/[id]/gerar-agendamento — Schedule next session from within an atendimento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const atendimentoId = parseInt(id);
    const body = await request.json();

    const { procedimento_id, executor_id, data_agendada, observacoes } = body;

    if (!procedimento_id) {
      return NextResponse.json({ error: 'Procedimento é obrigatório' }, { status: 400 });
    }

    const rows = await query<AtendimentoRow>(
      'SELECT id, cliente_id, status FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
    }

    const atendimento = rows[0];

    const status = data_agendada ? 'agendado' : 'pendente';

    const result = await execute(
      `INSERT INTO agendamentos (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, observacoes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [atendimento.cliente_id, atendimentoId, procedimento_id, executor_id || null, data_agendada || null, observacoes || null, status]
    );

    return NextResponse.json({
      success: true,
      agendamento_id: result.lastInsertRowid,
    });
  } catch (error) {
    console.error('Erro ao gerar agendamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar agendamento' }, { status: 500 });
  }
}
