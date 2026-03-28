import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface AgendamentoRow {
  id: number;
  cliente_id: number;
  atendimento_origem_id: number;
  procedimento_id: number;
  executor_id: number | null;
  data_agendada: string | null;
  observacoes: string | null;
  status: string;
  created_at: string;
  procedimento_nome: string;
  executor_nome: string | null;
  cliente_nome: string;
}

// GET /api/agendamentos?atendimento_origem_id=X
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const atendimentoOrigemId = searchParams.get('atendimento_origem_id');

    if (!atendimentoOrigemId) {
      return NextResponse.json(
        { error: 'atendimento_origem_id é obrigatório' },
        { status: 400 }
      );
    }

    const agendamentos = await query<AgendamentoRow>(
      `SELECT
        a.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome,
        c.nome as cliente_nome
      FROM agendamentos a
      INNER JOIN procedimentos p ON a.procedimento_id = p.id
      LEFT JOIN usuarios u ON a.executor_id = u.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      WHERE a.atendimento_origem_id = ?
      ORDER BY a.created_at ASC`,
      [parseInt(atendimentoOrigemId)]
    );

    return NextResponse.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar agendamentos' },
      { status: 500 }
    );
  }
}

// POST /api/agendamentos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      cliente_id,
      atendimento_origem_id,
      procedimento_id,
      executor_id,
      data_agendada,
      observacoes,
    } = body;

    if (!cliente_id || !atendimento_origem_id || !procedimento_id) {
      return NextResponse.json(
        { error: 'cliente_id, atendimento_origem_id e procedimento_id são obrigatórios' },
        { status: 400 }
      );
    }

    const result = await execute(
      `INSERT INTO agendamentos
        (cliente_id, atendimento_origem_id, procedimento_id, executor_id, data_agendada, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        atendimento_origem_id,
        procedimento_id,
        executor_id || null,
        data_agendada || null,
        observacoes || null,
      ]
    );

    return NextResponse.json(
      { id: result.lastInsertRowid, message: 'Agendamento criado' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar agendamento' },
      { status: 500 }
    );
  }
}
