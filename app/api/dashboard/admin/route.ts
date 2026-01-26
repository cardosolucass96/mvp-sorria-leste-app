import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

interface FaturamentoResult {
  total: number;
}

interface CountResult {
  count: number;
}

interface CanalResult {
  origem: string;
  total: number;
  count: number;
}

interface StatusResult {
  status: string;
  count: number;
}

interface ProcedimentoResult {
  nome: string;
  total: number;
  count: number;
}

interface MensalResult {
  mes: string;
  faturamento: number;
  atendimentos: number;
}

interface ComissaoResult {
  nome: string;
  tipo: string;
  total: number;
}

// GET /api/dashboard/admin - Estatísticas completas do dashboard admin
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    // Construir filtro de data
    let filtroData = '';
    const params: string[] = [];
    
    if (dataInicio && dataFim) {
      filtroData = " AND DATE(a.created_at) BETWEEN ? AND ?";
      params.push(dataInicio, dataFim);
    } else if (dataInicio) {
      filtroData = " AND DATE(a.created_at) >= ?";
      params.push(dataInicio);
    } else if (dataFim) {
      filtroData = " AND DATE(a.created_at) <= ?";
      params.push(dataFim);
    }

    // Filtro para pagamentos
    let filtroDataPag = '';
    const paramsPag: string[] = [];
    if (dataInicio && dataFim) {
      filtroDataPag = " AND DATE(p.created_at) BETWEEN ? AND ?";
      paramsPag.push(dataInicio, dataFim);
    } else if (dataInicio) {
      filtroDataPag = " AND DATE(p.created_at) >= ?";
      paramsPag.push(dataInicio);
    } else if (dataFim) {
      filtroDataPag = " AND DATE(p.created_at) <= ?";
      paramsPag.push(dataFim);
    }

    // 1. Faturamento Total (pagamentos recebidos)
    const faturamentoQuery = `
      SELECT COALESCE(SUM(p.valor), 0) as total
      FROM pagamentos p
      WHERE 1=1 ${filtroDataPag}
    `;
    const faturamento = queryOne<FaturamentoResult>(faturamentoQuery, paramsPag);

    // 2. A Receber (valor dos itens - valor pago)
    const aReceberQuery = `
      SELECT COALESCE(SUM(i.valor - i.valor_pago), 0) as total
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      WHERE i.valor_pago < i.valor AND a.status != 'finalizado'
    `;
    const aReceber = queryOne<FaturamentoResult>(aReceberQuery);

    // 3. Parcelas Vencidas
    const vencidasQuery = `
      SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as count
      FROM parcelas
      WHERE pago = 0 AND data_vencimento < DATE('now')
    `;
    const vencidas = queryOne<FaturamentoResult & CountResult>(vencidasQuery);

    // 4. Atendimentos por Status
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM atendimentos a
      WHERE 1=1 ${filtroData}
      GROUP BY status
      ORDER BY 
        CASE status 
          WHEN 'triagem' THEN 1
          WHEN 'avaliacao' THEN 2
          WHEN 'aguardando_pagamento' THEN 3
          WHEN 'em_execucao' THEN 4
          WHEN 'finalizado' THEN 5
        END
    `;
    const porStatus = query<StatusResult>(statusQuery, params);

    // 5. Faturamento por Canal de Aquisição
    const canaisQuery = `
      SELECT 
        c.origem,
        COALESCE(SUM(p.valor), 0) as total,
        COUNT(DISTINCT a.id) as count
      FROM clientes c
      INNER JOIN atendimentos a ON a.cliente_id = c.id
      LEFT JOIN pagamentos p ON p.atendimento_id = a.id
      GROUP BY c.origem
      ORDER BY total DESC
    `;
    const porCanal = query<CanalResult>(canaisQuery);

    // 6. Top 10 Procedimentos mais Realizados
    const procedimentosQuery = `
      SELECT 
        pr.nome,
        COALESCE(SUM(i.valor), 0) as total,
        COUNT(*) as count
      FROM itens_atendimento i
      INNER JOIN procedimentos pr ON i.procedimento_id = pr.id
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      WHERE 1=1 ${filtroData}
      GROUP BY pr.id, pr.nome
      ORDER BY total DESC
      LIMIT 10
    `;
    const topProcedimentos = query<ProcedimentoResult>(procedimentosQuery, params);

    // 7. Faturamento Mensal (últimos 6 meses)
    const mensalQuery = `
      SELECT 
        strftime('%Y-%m', p.created_at) as mes,
        SUM(p.valor) as faturamento,
        COUNT(DISTINCT p.atendimento_id) as atendimentos
      FROM pagamentos p
      WHERE p.created_at >= DATE('now', '-6 months')
      GROUP BY strftime('%Y-%m', p.created_at)
      ORDER BY mes ASC
    `;
    const faturamentoMensal = query<MensalResult>(mensalQuery);

    // 8. Total de Atendimentos
    const totalAtendimentosQuery = `
      SELECT COUNT(*) as count
      FROM atendimentos a
      WHERE 1=1 ${filtroData}
    `;
    const totalAtendimentos = queryOne<CountResult>(totalAtendimentosQuery, params);

    // 9. Total de Clientes
    const totalClientesQuery = `SELECT COUNT(*) as count FROM clientes`;
    const totalClientes = queryOne<CountResult>(totalClientesQuery);

    // 10. Ticket Médio
    const ticketMedioQuery = `
      SELECT COALESCE(AVG(total_atend), 0) as total
      FROM (
        SELECT a.id, SUM(i.valor) as total_atend
        FROM atendimentos a
        INNER JOIN itens_atendimento i ON i.atendimento_id = a.id
        WHERE a.status = 'finalizado'
        GROUP BY a.id
      )
    `;
    const ticketMedio = queryOne<FaturamentoResult>(ticketMedioQuery);

    // 11. Top Vendedores (por comissão de venda)
    const topVendedoresQuery = `
      SELECT 
        u.nome,
        'venda' as tipo,
        COALESCE(SUM(c.valor_comissao), 0) as total
      FROM comissoes c
      INNER JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.tipo = 'venda'
      GROUP BY u.id, u.nome
      ORDER BY total DESC
      LIMIT 5
    `;
    const topVendedores = query<ComissaoResult>(topVendedoresQuery);

    // 12. Top Executores (por comissão de execução)
    const topExecutoresQuery = `
      SELECT 
        u.nome,
        'execucao' as tipo,
        COALESCE(SUM(c.valor_comissao), 0) as total
      FROM comissoes c
      INNER JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.tipo = 'execucao'
      GROUP BY u.id, u.nome
      ORDER BY total DESC
      LIMIT 5
    `;
    const topExecutores = query<ComissaoResult>(topExecutoresQuery);

    // 13. Taxa de Conversão (finalizados / total)
    const finalizadosQuery = `
      SELECT COUNT(*) as count
      FROM atendimentos a
      WHERE status = 'finalizado' ${filtroData}
    `;
    const finalizados = queryOne<CountResult>(finalizadosQuery, params);
    const taxaConversao = totalAtendimentos?.count 
      ? ((finalizados?.count || 0) / totalAtendimentos.count * 100).toFixed(1)
      : '0';

    // 14. Comissões Totais
    const comissoesTotalQuery = `
      SELECT COALESCE(SUM(valor_comissao), 0) as total
      FROM comissoes
    `;
    const comissoesTotal = queryOne<FaturamentoResult>(comissoesTotalQuery);

    // Labels para origem
    const origemLabels: Record<string, string> = {
      fachada: 'Fachada',
      trafego_meta: 'Tráfego Meta',
      trafego_google: 'Tráfego Google',
      organico: 'Orgânico',
      indicacao: 'Indicação',
    };

    // Formatar canais com labels
    const canaisFormatados = porCanal.map(c => ({
      ...c,
      label: origemLabels[c.origem] || c.origem,
    }));

    return NextResponse.json({
      resumo: {
        faturamento: faturamento?.total || 0,
        aReceber: aReceber?.total || 0,
        vencidas: vencidas?.total || 0,
        parcelasVencidas: vencidas?.count || 0,
        totalAtendimentos: totalAtendimentos?.count || 0,
        totalClientes: totalClientes?.count || 0,
        ticketMedio: ticketMedio?.total || 0,
        taxaConversao: parseFloat(taxaConversao),
        comissoesTotal: comissoesTotal?.total || 0,
        atendimentosFinalizados: finalizados?.count || 0,
      },
      porStatus,
      porCanal: canaisFormatados,
      topProcedimentos,
      faturamentoMensal,
      topVendedores,
      topExecutores,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados do dashboard' },
      { status: 500 }
    );
  }
}
