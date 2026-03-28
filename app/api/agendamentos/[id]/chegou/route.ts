import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

interface Agendamento {
  id: number;
  cliente_id: number;
  status: string;
}

interface AtendimentoAberto {
  id: number;
}

// POST /api/agendamentos/[id]/chegou - Marca chegada e cria novo atendimento
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agendamento = await queryOne<Agendamento>(
      'SELECT id, cliente_id, status FROM agendamentos WHERE id = ?',
      [id]
    );

    if (!agendamento) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    if (!['pendente', 'agendado'].includes(agendamento.status)) {
      return NextResponse.json(
        { error: 'Agendamento não está em status válido para registro de chegada' },
        { status: 400 }
      );
    }

    // Check if client already has an open atendimento today
    const atendimentoExistente = await queryOne<AtendimentoAberto>(
      `SELECT id FROM atendimentos
       WHERE cliente_id = ? AND status != 'finalizado'
       AND date(created_at) = date('now', 'localtime')`,
      [agendamento.cliente_id]
    );

    if (atendimentoExistente) {
      return NextResponse.json(
        {
          error: 'Este cliente já tem atendimento aberto hoje',
          atendimento_existente_id: atendimentoExistente.id,
        },
        { status: 409 }
      );
    }

    // Create new atendimento
    const result = await execute(
      `INSERT INTO atendimentos (cliente_id, status) VALUES (?, 'triagem')`,
      [agendamento.cliente_id]
    );

    const novoAtendimentoId = result.lastInsertRowid;

    // Update agendamento status to 'realizado'
    await execute(
      `UPDATE agendamentos SET status = 'realizado', updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [id]
    );

    return NextResponse.json({ id: novoAtendimentoId }, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar chegada:', error);
    return NextResponse.json(
      { error: 'Erro ao registrar chegada' },
      { status: 500 }
    );
  }
}
