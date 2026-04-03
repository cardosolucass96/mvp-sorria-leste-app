import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { AgendamentoCompleto } from '@/lib/types';

// Mapeamento seguro de campos para ORDER BY
const SORT_FIELDS: Record<string, string> = {
  cliente_nome:        'c.nome',
  procedimento_nome:   'p.nome',
  data_agendada:       'a.data_agendada',
  dias_desde_criacao:  'a.created_at',
  status:              'a.status',
};

// GET /api/agendamentos - Lista agendamentos para a tela de Agenda
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pendente,agendado,faltou';
    const clienteId = searchParams.get('cliente_id');
    const busca = searchParams.get('busca');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const semData = searchParams.get('sem_data');
    const atendimentoOrigemId = searchParams.get('atendimento_origem_id');
    const executorId = searchParams.get('executor_id');

    // Paginação
    const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));
    const paginated = searchParams.has('page');

    // Ordenação
    const orderByRaw = searchParams.get('order_by') || 'data_agendada';
    const orderDir   = searchParams.get('order_dir') === 'desc' ? 'DESC' : 'ASC';
    const orderCol   = SORT_FIELDS[orderByRaw] ?? 'a.data_agendada';
    const nullsLast  = orderCol === 'a.data_agendada' ? ' NULLS LAST' : '';

    const conditions: string[] = ['a.unidade_id = ?'];
    const params: unknown[] = [context.unidadeId];

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

    if (executorId) {
      conditions.push('a.executor_id = ?');
      params.push(parseInt(executorId));
    }

    if (busca) {
      conditions.push('c.nome LIKE ?');
      params.push(`%${busca}%`);
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

    const whereClause = 'WHERE ' + conditions.join(' AND ');
    const orderClause = `ORDER BY ${orderCol} ${orderDir}${nullsLast}, a.created_at ASC`;

    const baseSql = `
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN procedimentos p ON p.id = a.procedimento_id
      LEFT JOIN procedimento_etapas_modelo em ON em.id = a.etapa_modelo_id
      LEFT JOIN usuarios u ON u.id = a.executor_id
      LEFT JOIN atendimentos at_sessao ON at_sessao.id = a.atendimento_sessao_id
      ${whereClause}
    `;

    const selectSql = `
      SELECT
        a.*,
        c.nome AS cliente_nome, c.telefone AS cliente_telefone,
        COALESCE(p.nome, 'Avaliação') AS procedimento_nome,
        em.nome AS etapa_modelo_nome,
        u.nome AS executor_nome,
        CAST((julianday('now') - julianday(a.created_at)) AS INTEGER) AS dias_desde_criacao,
        at_sessao.status AS atendimento_status,
        at_sessao.id AS atendimento_id
      ${baseSql}
      ${orderClause}
    `;

    if (!paginated) {
      // Retrocompatibilidade: sem ?page → retorna array simples
      const agendamentos = await query<AgendamentoCompleto>(selectSql, params);
      return NextResponse.json(agendamentos);
    }

    // Com paginação: retorna { items, total, page, pages }
    const countResult = await query<{ total: number }>(`SELECT COUNT(*) AS total ${baseSql}`, params);
    const total = countResult[0]?.total ?? 0;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const items = await query<AgendamentoCompleto>(
      `${selectSql} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({ items, total, page, pages });
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json({ error: 'Erro ao buscar agendamentos' }, { status: 500 });
  }
});

// POST /api/agendamentos - Cria agendamento
export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const body = await request.json();
    let {
      cliente_id,
      atendimento_origem_id,
      procedimento_id,
      item_atendimento_origem_id,
      executor_id,
      data_agendada,
      observacoes,
      reagendado_de_id,
      pago,
      tipo,
    } = body;

    const isAvaliacao = tipo === 'avaliacao';

    // Avaliador/Executor só pode criar agendamento para si mesmo
    const userRole = context.user.role;
    if (userRole === 'avaliador' || userRole === 'executor') {
      executor_id = context.user.sub;
    }

    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id é obrigatório' }, { status: 400 });
    }
    if (!isAvaliacao && !procedimento_id) {
      return NextResponse.json({ error: 'procedimento_id é obrigatório para agendamento de procedimento' }, { status: 400 });
    }

    // Não permite agendar no passado
    if (data_agendada) {
      const agora = new Date();
      const dataEscolhida = new Date(data_agendada);
      if (dataEscolhida < agora) {
        return NextResponse.json({ error: 'Não é possível agendar para uma data no passado' }, { status: 400 });
      }
    }

    // Verifica cliente
    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Verifica procedimento (se não for avaliação)
    if (!isAvaliacao) {
      const procedimento = await queryOne<{ id: number }>(
        'SELECT id FROM procedimentos WHERE id = ? AND ativo = 1',
        [procedimento_id]
      );
      if (!procedimento) {
        return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
      }
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

    const tipoAgendamento = isAvaliacao ? 'avaliacao' : 'procedimento';

    const result = await execute(
      `INSERT INTO agendamentos
        (cliente_id, atendimento_origem_id, procedimento_id, item_atendimento_origem_id, executor_id, tipo, data_agendada, status, observacoes, reagendado_de_id, pago, unidade_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        atendimento_origem_id || null,
        procedimento_id || null,
        item_atendimento_origem_id || null,
        executor_id || null,
        tipoAgendamento,
        data_agendada || null,
        statusInicial,
        observacoes || null,
        reagendado_de_id || null,
        pago ? 1 : 0,
        context.unidadeId,
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
      LEFT JOIN procedimentos p ON p.id = a.procedimento_id
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
