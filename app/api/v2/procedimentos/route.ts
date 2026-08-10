import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withV2, type V2Context } from '../_shared';
import type { ProcedimentoClienteOperacional } from '@/lib/v2/types';

const ROLES = ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'] as const;
const QUEUES = new Set([
  'aguardando_decisao',
  'aguardando_pagamento',
  'aguardando_agendamento',
  'agendados',
  'em_execucao',
  'executados_com_saldo',
  'concluidos',
]);

export const GET = withV2([...ROLES], async (request: NextRequest, context: V2Context) => {
  const { searchParams } = new URL(request.url);
  const fila = searchParams.get('fila') || '';
  const clienteId = Number(searchParams.get('cliente_id') || 0);
  const busca = searchParams.get('busca')?.trim() || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 25)));
  const conditions = ['p.unidade_id = ?'];
  const params: unknown[] = [context.unidadeId];

  if (fila && QUEUES.has(fila)) {
    switch (fila) {
      case 'aguardando_decisao':
        conditions.push("p.status_comercial = 'proposto'");
        break;
      case 'aguardando_pagamento':
        conditions.push("p.status_comercial = 'aceito' AND p.status_financeiro IN ('nao_pago', 'parcial', 'estornado')");
        break;
      case 'aguardando_agendamento':
        conditions.push("p.status_comercial = 'aceito' AND p.status_agenda = 'sem_agendamento' AND p.status_clinico IN ('nao_iniciado', 'em_execucao')");
        break;
      case 'agendados':
        conditions.push("p.status_agenda = 'agendado'");
        break;
      case 'em_execucao':
        conditions.push("p.status_clinico = 'em_execucao'");
        break;
      case 'executados_com_saldo':
        conditions.push("p.status_clinico = 'concluido' AND p.status_financeiro <> 'quitado'");
        break;
      case 'concluidos':
        conditions.push("p.status_clinico = 'concluido' AND p.status_financeiro = 'quitado'");
        break;
    }
  }

  if (clienteId > 0) {
    conditions.push('p.cliente_id = ?');
    params.push(clienteId);
  }
  if (busca) {
    conditions.push('(p.cliente_nome LIKE ? OR p.nome_snapshot LIKE ?)');
    params.push(`%${busca}%`, `%${busca}%`);
  }

  const where = conditions.join(' AND ');
  const total = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM v_procedimentos_cliente_operacional p WHERE ${where}`,
    params,
  );
  const items = await query<ProcedimentoClienteOperacional>(
    `SELECT p.*
     FROM v_procedimentos_cliente_operacional p
     WHERE ${where}
     ORDER BY
       CASE p.status_comercial WHEN 'proposto' THEN 0 WHEN 'aceito' THEN 1 ELSE 2 END,
       p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );

  return NextResponse.json({ items, total: total?.total ?? 0, page, pages: Math.ceil((total?.total ?? 0) / limit) });
});
