import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface AgendamentoRow {
  id: number;
  cliente_id: number;
  procedimento_id: number | null;
  data_agendada: string | null;
  status: string;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  created_at: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  procedimento_nome: string | null;
  dias_desde_criacao: number;
}

// GET /api/agendamentos - Lista agendamentos com filtros
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const busca = searchParams.get('busca');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    let sql = `
      SELECT
        ag.*,
        c.nome as cliente_nome,
        c.telefone as cliente_telefone,
        p.nome as procedimento_nome,
        CAST(julianday('now', 'localtime') - julianday(ag.created_at) AS INTEGER) as dias_desde_criacao
      FROM agendamentos ag
      INNER JOIN clientes c ON ag.cliente_id = c.id
      LEFT JOIN procedimentos p ON ag.procedimento_id = p.id
    `;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      conditions.push(`ag.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    if (busca) {
      conditions.push('c.nome LIKE ?');
      params.push(`%${busca}%`);
    }

    if (dataInicio) {
      conditions.push('ag.data_agendada >= ?');
      params.push(dataInicio);
    }

    if (dataFim) {
      conditions.push('ag.data_agendada <= ?');
      params.push(dataFim);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY ag.data_agendada IS NULL, ag.data_agendada ASC, ag.created_at DESC';

    const agendamentos = await query<AgendamentoRow>(sql, params);

    return NextResponse.json(agendamentos);
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar agendamentos' },
      { status: 500 }
    );
  }
}
