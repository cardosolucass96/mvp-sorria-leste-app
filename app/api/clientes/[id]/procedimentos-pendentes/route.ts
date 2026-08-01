import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface ProcedimentoPendenteRow {
  item_id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  status: string;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  valor_pendente: number;
  etapa_label: string | null;
  atendimento_status: string;
  motivo_saida: string | null;
  atendimento_created_at: string;
  item_created_at: string;
}

export const GET = withUnit(async (
  _request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const clienteId = parseInt(id as string);

    if (!Number.isFinite(clienteId)) {
      return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
    }

    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [clienteId]
    );

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const procedimentos = await query<ProcedimentoPendenteRow>(
      `SELECT
         i.id as item_id,
         i.atendimento_id,
         i.procedimento_id,
         p.nome as procedimento_nome,
         i.status,
         COALESCE(i.valor_final, i.valor) as valor,
         i.valor_final,
         i.valor_pago,
         ROUND(MAX(0, COALESCE(i.valor_final, i.valor) - i.valor_pago), 2) as valor_pendente,
         i.etapa_label,
         a.status as atendimento_status,
         a.motivo_saida,
         a.created_at as atendimento_created_at,
         i.created_at as item_created_at
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON a.id = i.atendimento_id
       INNER JOIN procedimentos p ON p.id = i.procedimento_id
       WHERE a.cliente_id = ?
         AND a.unidade_id = ?
         AND i.status IN ('pendente', 'pago')
         AND NOT EXISTS (
           SELECT 1
           FROM agendamentos ag
           WHERE ag.item_atendimento_origem_id = i.id
             AND ag.unidade_id = ?
             AND ag.status IN ('pendente', 'agendado')
         )
       ORDER BY
         CASE
           WHEN a.status = 'finalizado' AND COALESCE(a.motivo_saida, '') = 'continuacao' THEN 0
           ELSE 1
         END,
         i.created_at DESC`,
      [clienteId, context.unidadeId, context.unidadeId]
    );

    return NextResponse.json(procedimentos);
  } catch (error) {
    console.error('Erro ao buscar procedimentos pendentes do cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar procedimentos pendentes do cliente' },
      { status: 500 }
    );
  }
});
