import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withAuth, AuthenticatedContext } from '@/lib/auth/middleware';
import { AgendamentoCompleto } from '@/lib/types';

// GET /api/agendamentos - Lista agendamentos para a tela de Agenda
export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pendente,agendado,faltou';
    const clienteId = searchParams.get('cliente_id');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const semData = searchParams.get('sem_data');
    const atendimentoOrigemId = searchParams.get('atendimento_origem_id');

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Filtro por status (lista separada por vírgula)
    const statusList = status.split(',').map(s => s.trim()).filter(Boolean);
    if (statusList.length > 0) {
      const placeholders = statusList.map(() => '?').join(', ');
      conditions.push(`a.status IN (${placeholders})`);
      params.push(...statusList);
    }

    if (clienteId) {
      conditions.push('a.cliente_id = ?');
      params.push(parseInt(clienteId));
    }

    if (atendimentoOrigemId) {
      conditions.push('a.atendimento_origem_id = ?');
      params.push(parseInt(atendimentoOrigemId));
    }

    if (semData === 'true') {
      conditions.push('a.data_agendada IS NULL');
    } else {
      if (dataInicio) {
        conditions.push('a.data_agendada >= ?');
        params.push(dataInicio);
      }
      if (dataFim) {
        conditions.push('a.data_agendada <= ?');
        params.push(dataFim);
      }
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT
        a.*,
        c.nome AS cliente_nome, c.telefone AS cliente_telefone,
        p.nome AS procedimento_nome,
        u.nome AS executor_nome,
        CAST((julianday('now') - julianday(a.created_at)) AS INTEGER) AS dias_desde_criacao
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      JOIN procedimentos p ON p.id = a.procedimento_id
      LEFT JOIN usuarios u ON u.id = a.executor_id
      ${whereClause}
      ORDER BY a.data_agendada ASC NULLS LAST, a.created_at ASC
    `;

    const agendamentos = await query<AgendamentoCompleto>(sql, params);
    return NextResponse.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar agendamentos' }, { status: 500 });
  }
});

// POST /api/agendamentos - Cria agendamento
export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      cliente_id,
      atendimento_origem_id,
      procedimento_id,
      item_atendimento_origem_id,
      executor_id,
      data_agendada,
      observacoes,
    } = body;

    if (!cliente_id || !procedimento_id) {
      return NextResponse.json(
        { error: 'cliente_id e procedimento_id são obrigatórios' },
        { status: 400 }
      );
    }

    // Verifica cliente
    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
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
        cliente_id,
        atendimento_origem_id || null,
        procedimento_id,
        item_atendimento_origem_id || null,
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
    console.error('Erro ao criar agendamento:', error);
    return NextResponse.json({ error: 'Erro ao criar agendamento' }, { status: 500 });
  }
});
