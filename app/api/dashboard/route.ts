import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { getClinicDayUtcRange, getClinicMonthUtcRange } from '@/lib/time';

interface DashboardStats {
  totalClientes: number;
  atendimentosHoje: number;
  aguardandoPagamento: number;
  finalizadosHoje: number;
  emExecucao: number;
  emAvaliacao: number;
  minhasComissoes: number;
  meusProcedimentos: number;
  procedimentosDisponiveis: number;
  meusAtendimentosAvaliacao: number;
  atendimentosDisponiveisAvaliacao: number;
}

// GET /api/dashboard?usuario_id=X&role=Y - Dados do dashboard por role (filtrado por unidade)
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const usuarioId = searchParams.get('usuario_id');
    const role = searchParams.get('role');
    const uid = context.unidadeId;
    const hojeRange = getClinicDayUtcRange();
    const mesAtualRange = getClinicMonthUtcRange();

    // Stats gerais (clientes são compartilhados, sem filtro de unidade)
    const totalClientes = (await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM clientes'
    ))[0]?.count || 0;

    const atendimentosHoje = (await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE created_at >= ? AND created_at < ? AND unidade_id = ?`,
      [hojeRange.start, hojeRange.endExclusive, uid]
    ))[0]?.count || 0;

    const aguardandoPagamento = (await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE status = 'aguardando_pagamento' AND unidade_id = ?`,
      [uid]
    ))[0]?.count || 0;

    const finalizadosHoje = (await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE status = 'finalizado'
         AND unidade_id = ?
         AND COALESCE(motivo_saida, '') != 'continuacao'
         AND finalizado_at >= ?
         AND finalizado_at < ?`,
      [uid, hojeRange.start, hojeRange.endExclusive]
    ))[0]?.count || 0;

    const emExecucao = (await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE status = 'em_execucao' AND unidade_id = ?`,
      [uid]
    ))[0]?.count || 0;

    const emAvaliacao = (await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE status = 'avaliacao' AND unidade_id = ?`,
      [uid]
    ))[0]?.count || 0;

    // Stats específicas por role
    let minhasComissoes = 0;
    let meusProcedimentos = 0;
    let procedimentosDisponiveis = 0;
    let meusAtendimentosAvaliacao = 0;
    let atendimentosDisponiveisAvaliacao = 0;

    if (usuarioId) {
      // Comissões do usuário (filtrado por unidade via atendimento)
      minhasComissoes = (await query<{ total: number }>(
        `SELECT COALESCE(SUM(co.valor_comissao), 0) as total FROM comissoes co
         INNER JOIN atendimentos a ON co.atendimento_id = a.id
         WHERE co.usuario_id = ? AND a.unidade_id = ?
         AND co.created_at >= ? AND co.created_at < ?`,
        [parseInt(usuarioId), uid, mesAtualRange.start, mesAtualRange.endExclusive]
      ))[0]?.total || 0;

      // Para Executor: procedimentos
      if (role === 'executor' || role === 'admin') {
        meusProcedimentos = (await query<{ count: number }>(
          `SELECT COUNT(*) as count FROM itens_atendimento i
           INNER JOIN atendimentos a ON i.atendimento_id = a.id
           WHERE a.status = 'em_execucao' AND a.unidade_id = ?
           AND i.status IN ('pago', 'executando')
           AND i.executor_id = ?`,
          [uid, parseInt(usuarioId)]
        ))[0]?.count || 0;

        procedimentosDisponiveis = (await query<{ count: number }>(
          `SELECT COUNT(*) as count FROM itens_atendimento i
           INNER JOIN atendimentos a ON i.atendimento_id = a.id
           WHERE a.status = 'em_execucao' AND a.unidade_id = ?
           AND i.status IN ('pago', 'executando')
           AND i.executor_id IS NULL`,
          [uid]
        ))[0]?.count || 0;
      }

      // Para Avaliador: atendimentos
      if (role === 'avaliador' || role === 'admin') {
        meusAtendimentosAvaliacao = (await query<{ count: number }>(
          `SELECT COUNT(*) as count FROM atendimentos
           WHERE status = 'avaliacao' AND unidade_id = ? AND avaliador_id = ?`,
          [uid, parseInt(usuarioId)]
        ))[0]?.count || 0;

        atendimentosDisponiveisAvaliacao = (await query<{ count: number }>(
          `SELECT COUNT(*) as count FROM atendimentos
           WHERE status = 'avaliacao' AND unidade_id = ? AND avaliador_id IS NULL`,
          [uid]
        ))[0]?.count || 0;
      }
    }

    const stats: DashboardStats = {
      totalClientes,
      atendimentosHoje,
      aguardandoPagamento,
      finalizadosHoje,
      emExecucao,
      emAvaliacao,
      minhasComissoes,
      meusProcedimentos,
      procedimentosDisponiveis,
      meusAtendimentosAvaliacao,
      atendimentosDisponiveisAvaliacao,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Erro ao buscar dados do dashboard:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados do dashboard' },
      { status: 500 }
    );
  }
});
