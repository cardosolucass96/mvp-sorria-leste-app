import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import {
  clinicDateTimeInputToUtcIso,
  clinicDateTimeInputToUtcIsoEndOfDay,
  getClinicMonthKey,
  parseStoredUtcInstant,
} from '@/lib/time';

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

interface PagamentoMensalRow {
  created_at: string;
  valor: number;
  atendimento_id: number;
}

function buildUtcColumnFilter(
  column: string,
  dataInicio: string | null,
  dataFim: string | null,
): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];

  const inicioUtc = clinicDateTimeInputToUtcIso(dataInicio);
  if (inicioUtc) {
    clauses.push(`${column} >= ?`);
    params.push(inicioUtc);
  }

  const fimUtc = clinicDateTimeInputToUtcIsoEndOfDay(dataFim);
  if (fimUtc) {
    clauses.push(`${column} <= ?`);
    params.push(fimUtc);
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  };
}

function getTrailingMonthsStartUtc(months: number, now: Date = new Date()): string {
  const monthKey = getClinicMonthKey(now);
  const [year, month] = monthKey.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, 1, 12));
  base.setUTCMonth(base.getUTCMonth() - (months - 1));

  const startKey = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00`;
  const startUtc = clinicDateTimeInputToUtcIso(startKey);
  if (!startUtc) {
    throw new Error(`Não foi possível calcular o range de ${months} meses`);
  }
  return startUtc;
}

// GET /api/dashboard/admin - Estatísticas completas do dashboard admin (filtrado por unidade)
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const uid = context.unidadeId;

    const filtroData = buildUtcColumnFilter('a.created_at', dataInicio, dataFim);
    const filtroDataPag = buildUtcColumnFilter('p.created_at', dataInicio, dataFim);

    // 1. Faturamento Total (pagamentos recebidos, filtrado por unidade)
    const faturamentoQuery = `
      SELECT COALESCE(SUM(p.valor), 0) as total
      FROM pagamentos p
      INNER JOIN atendimentos a ON p.atendimento_id = a.id
      WHERE a.unidade_id = ?${filtroDataPag.sql}
    `;
    const faturamento = await queryOne<FaturamentoResult>(faturamentoQuery, [uid, ...filtroDataPag.params]);

    // 2. A Receber (valor dos itens - valor pago)
    const aReceberQuery = `
      SELECT COALESCE(SUM(i.valor - i.valor_pago), 0) as total
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      WHERE i.valor_pago < i.valor AND a.status NOT IN ('finalizado', 'encerrado') AND a.unidade_id = ?
    `;
    const aReceber = await queryOne<FaturamentoResult>(aReceberQuery, [uid]);

    // 3. Atendimentos por Status
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM atendimentos a
      WHERE a.unidade_id = ?${filtroData.sql}
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'triagem' THEN 1
          WHEN 'avaliacao' THEN 2
          WHEN 'aguardando_pagamento' THEN 3
          WHEN 'em_execucao' THEN 4
          WHEN 'finalizado' THEN 5
          WHEN 'encerrado' THEN 6
        END
    `;
    const porStatus = await query<StatusResult>(statusQuery, [uid, ...filtroData.params]);

    // 5. Faturamento por Canal de Aquisição
    const canaisQuery = `
      SELECT
        c.origem,
        COALESCE(SUM(p.valor), 0) as total,
        COUNT(DISTINCT a.id) as count
      FROM clientes c
      INNER JOIN atendimentos a ON a.cliente_id = c.id
      LEFT JOIN pagamentos p ON p.atendimento_id = a.id
      WHERE a.unidade_id = ?
      GROUP BY c.origem
      ORDER BY total DESC
    `;
    const porCanal = await query<CanalResult>(canaisQuery, [uid]);

    // 6. Top 10 Procedimentos mais Realizados
    const procedimentosQuery = `
      SELECT
        pr.nome,
        COALESCE(SUM(i.valor), 0) as total,
        COUNT(*) as count
      FROM itens_atendimento i
      INNER JOIN procedimentos pr ON i.procedimento_id = pr.id
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      WHERE a.unidade_id = ?${filtroData.sql}
      GROUP BY pr.id, pr.nome
      ORDER BY total DESC
      LIMIT 10
    `;
    const topProcedimentos = await query<ProcedimentoResult>(procedimentosQuery, [uid, ...filtroData.params]);

    // 7. Faturamento Mensal (últimos 6 meses)
    const mensalQuery = `
      SELECT
        p.created_at,
        p.valor,
        p.atendimento_id
      FROM pagamentos p
      INNER JOIN atendimentos a ON p.atendimento_id = a.id
      WHERE p.created_at >= ? AND a.unidade_id = ?
      ORDER BY p.created_at ASC
    `;
    const pagamentosMensais = await query<PagamentoMensalRow>(mensalQuery, [getTrailingMonthsStartUtc(6), uid]);
    const mensalMap = new Map<string, { faturamento: number; atendimentoIds: Set<number> }>();

    for (const pagamento of pagamentosMensais) {
      const createdAt = parseStoredUtcInstant(pagamento.created_at);
      if (!createdAt) continue;

      const mes = getClinicMonthKey(createdAt);
      const entry = mensalMap.get(mes) ?? { faturamento: 0, atendimentoIds: new Set<number>() };
      entry.faturamento += Number(pagamento.valor ?? 0);
      entry.atendimentoIds.add(pagamento.atendimento_id);
      mensalMap.set(mes, entry);
    }

    const faturamentoMensal: MensalResult[] = Array.from(mensalMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mes, values]) => ({
        mes,
        faturamento: values.faturamento,
        atendimentos: values.atendimentoIds.size,
      }));

    // 8. Total de Atendimentos
    const totalAtendimentosQuery = `
      SELECT COUNT(*) as count
      FROM atendimentos a
      WHERE a.unidade_id = ?${filtroData.sql}
    `;
    const totalAtendimentos = await queryOne<CountResult>(totalAtendimentosQuery, [uid, ...filtroData.params]);

    // 9. Total de Clientes (compartilhado entre unidades)
    const totalClientesQuery = `SELECT COUNT(*) as count FROM clientes`;
    const totalClientes = await queryOne<CountResult>(totalClientesQuery);

    // 10. Ticket Médio
    const ticketMedioQuery = `
      SELECT COALESCE(AVG(total_atend), 0) as total
      FROM (
        SELECT a.id, SUM(i.valor) as total_atend
        FROM atendimentos a
        INNER JOIN itens_atendimento i ON i.atendimento_id = a.id
        WHERE a.status IN ('finalizado', 'encerrado')
          AND a.unidade_id = ?
          AND COALESCE(a.motivo_saida, '') != 'continuacao'
        GROUP BY a.id
      )
    `;
    const ticketMedio = await queryOne<FaturamentoResult>(ticketMedioQuery, [uid]);

    // 11. Top Vendedores (por comissão de venda)
    const topVendedoresQuery = `
      SELECT
        u.nome,
        'venda' as tipo,
        COALESCE(SUM(c.valor_comissao), 0) as total
      FROM comissoes c
      INNER JOIN usuarios u ON c.usuario_id = u.id
      INNER JOIN atendimentos a ON c.atendimento_id = a.id
      WHERE c.tipo = 'venda' AND a.unidade_id = ?
      GROUP BY u.id, u.nome
      ORDER BY total DESC
      LIMIT 5
    `;
    const topVendedores = await query<ComissaoResult>(topVendedoresQuery, [uid]);

    // 12. Top Executores (por comissão de execução)
    const topExecutoresQuery = `
      SELECT
        u.nome,
        'execucao' as tipo,
        COALESCE(SUM(c.valor_comissao), 0) as total
      FROM comissoes c
      INNER JOIN usuarios u ON c.usuario_id = u.id
      INNER JOIN atendimentos a ON c.atendimento_id = a.id
      WHERE c.tipo = 'execucao' AND a.unidade_id = ?
      GROUP BY u.id, u.nome
      ORDER BY total DESC
      LIMIT 5
    `;
    const topExecutores = await query<ComissaoResult>(topExecutoresQuery, [uid]);

    // 13. Taxa de Conversão (finalizados / total)
    const finalizadosQuery = `
      SELECT COUNT(*) as count
      FROM atendimentos a
      WHERE status IN ('finalizado', 'encerrado')
        AND a.unidade_id = ?
        AND COALESCE(a.motivo_saida, '') != 'continuacao'${filtroData.sql}
    `;
    const finalizados = await queryOne<CountResult>(finalizadosQuery, [uid, ...filtroData.params]);
    const taxaConversao = totalAtendimentos?.count
      ? ((finalizados?.count || 0) / totalAtendimentos.count * 100).toFixed(1)
      : '0';

    // 14. Comissões Totais
    const comissoesTotalQuery = `
      SELECT COALESCE(SUM(c.valor_comissao), 0) as total
      FROM comissoes c
      INNER JOIN atendimentos a ON c.atendimento_id = a.id
      WHERE a.unidade_id = ?
    `;
    const comissoesTotal = await queryOne<FaturamentoResult>(comissoesTotalQuery, [uid]);

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
});
