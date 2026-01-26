import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface DashboardStats {
  totalClientes: number;
  atendimentosHoje: number;
  aguardandoPagamento: number;
  finalizadosHoje: number;
  emExecucao: number;
  emAvaliacao: number;
  parcelasVencidas: number;
  minhasComissoes: number;
  meusProcedimentos: number;
  procedimentosDisponiveis: number;
  meusAtendimentosAvaliacao: number;
  atendimentosDisponiveisAvaliacao: number;
}

// GET /api/dashboard?usuario_id=X&role=Y - Dados do dashboard por role
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const usuarioId = searchParams.get('usuario_id');
    const role = searchParams.get('role');

    const hoje = new Date().toISOString().split('T')[0];

    // Stats gerais
    const totalClientes = query<{ count: number }>(
      'SELECT COUNT(*) as count FROM clientes'
    )[0]?.count || 0;

    const atendimentosHoje = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE DATE(created_at) = DATE('now', 'localtime')`
    )[0]?.count || 0;

    const aguardandoPagamento = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE status = 'aguardando_pagamento'`
    )[0]?.count || 0;

    const finalizadosHoje = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE status = 'finalizado' AND DATE(finalizado_at) = DATE('now', 'localtime')`
    )[0]?.count || 0;

    const emExecucao = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE status = 'em_execucao'`
    )[0]?.count || 0;

    const emAvaliacao = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM atendimentos 
       WHERE status IN ('triagem', 'avaliacao')`
    )[0]?.count || 0;

    const parcelasVencidas = query<{ count: number }>(
      `SELECT COUNT(*) as count FROM parcelas 
       WHERE pago = 0 AND DATE(data_vencimento) < DATE('now', 'localtime')`
    )[0]?.count || 0;

    // Stats específicas por role
    let minhasComissoes = 0;
    let meusProcedimentos = 0;
    let procedimentosDisponiveis = 0;
    let meusAtendimentosAvaliacao = 0;
    let atendimentosDisponiveisAvaliacao = 0;

    if (usuarioId) {
      // Comissões do usuário
      minhasComissoes = query<{ total: number }>(
        `SELECT COALESCE(SUM(valor_comissao), 0) as total FROM comissoes 
         WHERE usuario_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`,
        [parseInt(usuarioId)]
      )[0]?.total || 0;

      // Para Executor: procedimentos
      if (role === 'executor' || role === 'admin') {
        meusProcedimentos = query<{ count: number }>(
          `SELECT COUNT(*) as count FROM itens_atendimento i
           INNER JOIN atendimentos a ON i.atendimento_id = a.id
           WHERE a.status = 'em_execucao' 
           AND i.status IN ('pago', 'executando')
           AND i.executor_id = ?`,
          [parseInt(usuarioId)]
        )[0]?.count || 0;

        procedimentosDisponiveis = query<{ count: number }>(
          `SELECT COUNT(*) as count FROM itens_atendimento i
           INNER JOIN atendimentos a ON i.atendimento_id = a.id
           WHERE a.status = 'em_execucao' 
           AND i.status IN ('pago', 'executando')
           AND i.executor_id IS NULL`
        )[0]?.count || 0;
      }

      // Para Avaliador: atendimentos
      if (role === 'avaliador' || role === 'admin') {
        meusAtendimentosAvaliacao = query<{ count: number }>(
          `SELECT COUNT(*) as count FROM atendimentos 
           WHERE status IN ('triagem', 'avaliacao') AND avaliador_id = ?`,
          [parseInt(usuarioId)]
        )[0]?.count || 0;

        atendimentosDisponiveisAvaliacao = query<{ count: number }>(
          `SELECT COUNT(*) as count FROM atendimentos 
           WHERE status IN ('triagem', 'avaliacao') AND avaliador_id IS NULL`
        )[0]?.count || 0;
      }
    }

    const stats: DashboardStats = {
      totalClientes,
      atendimentosHoje,
      aguardandoPagamento,
      finalizadosHoje,
      emExecucao,
      emAvaliacao,
      parcelasVencidas,
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
}
