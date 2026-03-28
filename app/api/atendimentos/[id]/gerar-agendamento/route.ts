import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withAuth, AuthenticatedContext } from '@/lib/auth/middleware';
import { AgendamentoCompleto } from '@/lib/types';

interface AtendimentoBase {
  id: number;
  cliente_id: number;
  status: string;
}

// POST /api/atendimentos/[id]/gerar-agendamento - Gera agendamento de próxima sessão
export const POST = withAuth(async (
  request: NextRequest,
  context: AuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    const body = await request.json();

    const {
      procedimento_id,
      item_atendimento_id,
      executor_id,
      data_agendada,
      observacoes,
    } = body;

    if (!procedimento_id) {
      return NextResponse.json(
        { error: 'procedimento_id é obrigatório' },
        { status: 400 }
      );
    }

    // Verifica atendimento existe
    const atendimento = await queryOne<AtendimentoBase>(
      'SELECT id, cliente_id, status FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    if (!atendimento) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
    }

    // Verifica procedimento
    const procedimento = await queryOne<{ id: number }>(
      'SELECT id FROM procedimentos WHERE id = ? AND ativo = 1',
      [procedimento_id]
    );
    if (!procedimento) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    // Verifica executor se fornecido
    if (executor_id) {
      const executor = await queryOne<{ id: number }>(
        'SELECT id FROM usuarios WHERE id = ? AND ativo = 1',
        [executor_id]
      );
      if (!executor) {
        return NextResponse.json({ error: 'Executor não encontrado' }, { status: 404 });
      }
    }

    const statusInicial = data_agendada ? 'agendado' : 'pendente';

    const result = await execute(
      `INSERT INTO agendamentos
        (cliente_id, atendimento_origem_id, procedimento_id, item_atendimento_origem_id, executor_id, data_agendada, status, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        atendimento.cliente_id,
        atendimentoId,
        procedimento_id,
        item_atendimento_id || null,
        executor_id || null,
        data_agendada || null,
        statusInicial,
        observacoes || null,
      ]
    );

    const agendamento = await queryOne<AgendamentoCompleto>(
      `SELECT
        a.*,
        c.nome AS cliente_nome, c.telefone AS cliente_telefone,
        p.nome AS procedimento_nome,
        u.nome AS executor_nome,
        0 AS dias_desde_criacao
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      JOIN procedimentos p ON p.id = a.procedimento_id
      LEFT JOIN usuarios u ON u.id = a.executor_id
      WHERE a.id = ?`,
      [result.lastInsertRowid]
    );

    return NextResponse.json(agendamento, { status: 201 });
  } catch (error) {
    console.error('Erro ao gerar agendamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar agendamento' }, { status: 500 });
  }
});
