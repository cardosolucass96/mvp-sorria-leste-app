import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import {
  clinicDateTimeInputToUtcIso,
  clinicDateTimeInputToUtcIsoEndOfDay,
  getClinicMonthKey,
  getSqlUtcInstantExpression,
  parseStoredUtcInstant,
} from '@/lib/time';

interface MonetaryResult {
  total: number | null;
}

interface CountResult {
  count: number | null;
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
    throw new Error(`Nao foi possivel calcular o range de ${months} meses`);
  }
  return startUtc;
}

const ORIGEM_LABELS: Record<string, string> = {
  fachada: 'Fachada',
  trafego_meta: 'Tráfego Meta',
  trafego_google: 'Tráfego Google',
  organico: 'Orgânico',
  indicacao: 'Indicação',
};

export const GET = withUnitRole(['admin', 'atendente', 'avaliador'], async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const unidadeId = context.unidadeId;

    const atendimentoCreatedAtExpr = getSqlUtcInstantExpression('a.created_at');
    const itemCreatedAtExpr = getSqlUtcInstantExpression('i.created_at');
    const pagamentoCreatedAtExpr = getSqlUtcInstantExpression('p.created_at');
    const comissaoCreatedAtExpr = getSqlUtcInstantExpression('c.created_at');

    const filtroAtendimento = buildUtcColumnFilter(atendimentoCreatedAtExpr, dataInicio, dataFim);
    const filtroItem = buildUtcColumnFilter(itemCreatedAtExpr, dataInicio, dataFim);
    const filtroPagamento = buildUtcColumnFilter(pagamentoCreatedAtExpr, dataInicio, dataFim);
    const filtroQuitacao = buildUtcColumnFilter('pq.quitado_em', dataInicio, dataFim);
    const filtroComissao = buildUtcColumnFilter(comissaoCreatedAtExpr, dataInicio, dataFim);

    const [
      faturamentoTotal,
      atendimentosCriados,
      procedimentosPagos,
      valorOrcadoNaoPago,
      porStatus,
      porCanalRaw,
      topProcedimentos,
      pagamentosMensais,
      totalClientes,
      ticketMedio,
      topVendedores,
      topExecutores,
      atendimentosFinalizados,
      comissoesTotal,
    ] = await Promise.all([
      queryOne<MonetaryResult>(
        `
          /* resumo_operacional:faturamento_total */
          SELECT COALESCE(SUM(p.valor), 0) AS total
          FROM pagamentos p
          INNER JOIN atendimentos a ON a.id = p.atendimento_id
          WHERE a.unidade_id = ?
            AND COALESCE(p.cancelado, 0) = 0${filtroPagamento.sql}
        `,
        [unidadeId, ...filtroPagamento.params]
      ),
      queryOne<CountResult>(
        `
          /* resumo_operacional:atendimentos_criados */
          SELECT COUNT(*) AS count
          FROM atendimentos a
          WHERE a.unidade_id = ?${filtroAtendimento.sql}
        `,
        [unidadeId, ...filtroAtendimento.params]
      ),
      queryOne<CountResult>(
        `
          /* resumo_operacional:procedimentos_pagos */
          WITH alocacoes_ativas AS (
            SELECT
              i.id AS item_id,
              COALESCE(i.valor_final, i.valor) AS valor_item,
              ${pagamentoCreatedAtExpr} AS pagamento_em,
              COALESCE(pa.valor_alocado, 0) AS valor_alocado,
              pa.id AS alocacao_id
            FROM pagamentos_alocacoes pa
            INNER JOIN pagamentos p ON p.id = pa.pagamento_id
            INNER JOIN itens_atendimento i ON i.id = pa.item_atendimento_id
            INNER JOIN atendimentos a ON a.id = i.atendimento_id
            WHERE a.unidade_id = ?
              AND COALESCE(p.cancelado, 0) = 0
          ),
          quitacoes_item AS (
            SELECT
              item_id,
              pagamento_em,
              valor_item,
              SUM(valor_alocado) OVER (
                PARTITION BY item_id
                ORDER BY pagamento_em ASC, alocacao_id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS acumulado
            FROM alocacoes_ativas
          ),
          primeira_quitacao AS (
            SELECT
              item_id,
              MIN(pagamento_em) AS quitado_em
            FROM quitacoes_item
            WHERE acumulado + 0.001 >= valor_item
            GROUP BY item_id
          )
          SELECT COUNT(*) AS count
          FROM primeira_quitacao pq
          INNER JOIN itens_atendimento i ON i.id = pq.item_id
          WHERE COALESCE(i.valor_pago, 0) + 0.001 >= COALESCE(i.valor_final, i.valor)${filtroQuitacao.sql}
        `,
        [unidadeId, ...filtroQuitacao.params]
      ),
      queryOne<MonetaryResult>(
        `
          /* resumo_operacional:valor_orcado_nao_pago */
          SELECT COALESCE(SUM(
            CASE
              WHEN COALESCE(i.valor_pago, 0) + 0.001 < COALESCE(i.valor_final, i.valor)
                THEN COALESCE(i.valor_final, i.valor) - COALESCE(i.valor_pago, 0)
              ELSE 0
            END
          ), 0) AS total
          FROM itens_atendimento i
          INNER JOIN atendimentos a ON a.id = i.atendimento_id
          WHERE a.unidade_id = ?
            AND COALESCE(a.tipo, 'normal') != 'sessao'
            AND COALESCE(a.motivo_saida, '') != 'continuacao'
            AND COALESCE(i.adicionado_em_execucao, 0) = 0
            AND COALESCE(i.valor_pago, 0) + 0.001 < COALESCE(i.valor_final, i.valor)${filtroItem.sql}
        `,
        [unidadeId, ...filtroItem.params]
      ),
      query<StatusResult>(
        `
          /* complementar:por_status */
          SELECT status, COUNT(*) AS count
          FROM atendimentos a
          WHERE a.unidade_id = ?${filtroAtendimento.sql}
          GROUP BY status
          ORDER BY
            CASE status
              WHEN 'triagem' THEN 1
              WHEN 'avaliacao' THEN 2
              WHEN 'aguardando_pagamento' THEN 3
              WHEN 'em_execucao' THEN 4
              WHEN 'finalizado' THEN 5
              WHEN 'encerrado' THEN 6
              ELSE 7
            END
        `,
        [unidadeId, ...filtroAtendimento.params]
      ),
      query<CanalResult>(
        `
          /* complementar:por_canal */
          SELECT
            c.origem,
            COALESCE(SUM(p.valor), 0) AS total,
            COUNT(DISTINCT a.id) AS count
          FROM clientes c
          INNER JOIN atendimentos a ON a.cliente_id = c.id
          INNER JOIN pagamentos p ON p.atendimento_id = a.id
          WHERE a.unidade_id = ?
            AND COALESCE(p.cancelado, 0) = 0${filtroPagamento.sql}
          GROUP BY c.origem
          ORDER BY total DESC, count DESC
        `,
        [unidadeId, ...filtroPagamento.params]
      ),
      query<ProcedimentoResult>(
        `
          /* complementar:top_procedimentos */
          SELECT
            pr.nome,
            COALESCE(SUM(COALESCE(i.valor_final, i.valor)), 0) AS total,
            COUNT(*) AS count
          FROM itens_atendimento i
          INNER JOIN procedimentos pr ON pr.id = i.procedimento_id
          INNER JOIN atendimentos a ON a.id = i.atendimento_id
          WHERE a.unidade_id = ?
            AND COALESCE(a.tipo, 'normal') != 'sessao'
            AND COALESCE(a.motivo_saida, '') != 'continuacao'
            AND COALESCE(i.adicionado_em_execucao, 0) = 0${filtroItem.sql}
          GROUP BY pr.id, pr.nome
          ORDER BY total DESC, count DESC, pr.nome ASC
          LIMIT 10
        `,
        [unidadeId, ...filtroItem.params]
      ),
      query<PagamentoMensalRow>(
        `
          /* complementar:faturamento_mensal */
          SELECT
            p.created_at,
            p.valor,
            p.atendimento_id
          FROM pagamentos p
          INNER JOIN atendimentos a ON a.id = p.atendimento_id
          WHERE ${pagamentoCreatedAtExpr} >= ?
            AND a.unidade_id = ?
            AND COALESCE(p.cancelado, 0) = 0
          ORDER BY ${pagamentoCreatedAtExpr} ASC
        `,
        [getTrailingMonthsStartUtc(6), unidadeId]
      ),
      queryOne<CountResult>(
        `
          /* resumo_analitico:total_clientes */
          SELECT COUNT(DISTINCT a.cliente_id) AS count
          FROM atendimentos a
          WHERE a.unidade_id = ?${filtroAtendimento.sql}
        `,
        [unidadeId, ...filtroAtendimento.params]
      ),
      queryOne<MonetaryResult>(
        `
          /* resumo_analitico:ticket_medio */
          SELECT COALESCE(AVG(total_orcado), 0) AS total
          FROM (
            SELECT
              a.id,
              SUM(COALESCE(i.valor_final, i.valor)) AS total_orcado
            FROM atendimentos a
            INNER JOIN itens_atendimento i ON i.atendimento_id = a.id
            WHERE a.unidade_id = ?
              AND COALESCE(a.tipo, 'normal') != 'sessao'
              AND COALESCE(a.motivo_saida, '') != 'continuacao'
              AND COALESCE(i.adicionado_em_execucao, 0) = 0${filtroAtendimento.sql}
            GROUP BY a.id
          ) base
        `,
        [unidadeId, ...filtroAtendimento.params]
      ),
      query<ComissaoResult>(
        `
          /* complementar:top_vendedores */
          SELECT
            u.nome,
            'venda' AS tipo,
            COALESCE(SUM(c.valor_comissao), 0) AS total
          FROM comissoes c
          INNER JOIN usuarios u ON u.id = c.usuario_id
          INNER JOIN atendimentos a ON a.id = c.atendimento_id
          WHERE a.unidade_id = ?
            AND c.tipo = 'venda'${filtroComissao.sql}
          GROUP BY u.id, u.nome
          ORDER BY total DESC, u.nome ASC
          LIMIT 5
        `,
        [unidadeId, ...filtroComissao.params]
      ),
      query<ComissaoResult>(
        `
          /* complementar:top_executores */
          SELECT
            u.nome,
            'execucao' AS tipo,
            COALESCE(SUM(c.valor_comissao), 0) AS total
          FROM comissoes c
          INNER JOIN usuarios u ON u.id = c.usuario_id
          INNER JOIN atendimentos a ON a.id = c.atendimento_id
          WHERE a.unidade_id = ?
            AND c.tipo = 'execucao'${filtroComissao.sql}
          GROUP BY u.id, u.nome
          ORDER BY total DESC, u.nome ASC
          LIMIT 5
        `,
        [unidadeId, ...filtroComissao.params]
      ),
      queryOne<CountResult>(
        `
          /* resumo_analitico:atendimentos_finalizados */
          SELECT COUNT(*) AS count
          FROM atendimentos a
          WHERE a.unidade_id = ?
            AND a.status IN ('finalizado', 'encerrado')
            AND COALESCE(a.motivo_saida, '') != 'continuacao'${filtroAtendimento.sql}
        `,
        [unidadeId, ...filtroAtendimento.params]
      ),
      queryOne<MonetaryResult>(
        `
          /* resumo_analitico:comissoes_total */
          SELECT COALESCE(SUM(c.valor_comissao), 0) AS total
          FROM comissoes c
          INNER JOIN atendimentos a ON a.id = c.atendimento_id
          WHERE a.unidade_id = ?${filtroComissao.sql}
        `,
        [unidadeId, ...filtroComissao.params]
      ),
    ]);

    const faturamentoMensalMap = new Map<string, { faturamento: number; atendimentoIds: Set<number> }>();
    for (const pagamento of pagamentosMensais) {
      const createdAt = parseStoredUtcInstant(pagamento.created_at);
      if (!createdAt) continue;

      const mes = getClinicMonthKey(createdAt);
      const entry = faturamentoMensalMap.get(mes) ?? { faturamento: 0, atendimentoIds: new Set<number>() };
      entry.faturamento += Number(pagamento.valor ?? 0);
      entry.atendimentoIds.add(pagamento.atendimento_id);
      faturamentoMensalMap.set(mes, entry);
    }

    const faturamentoMensal: MensalResult[] = Array.from(faturamentoMensalMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([mes, values]) => ({
        mes,
        faturamento: values.faturamento,
        atendimentos: values.atendimentoIds.size,
      }));

    const atendimentosCriadosCount = Number(atendimentosCriados?.count ?? 0);
    const atendimentosFinalizadosCount = Number(atendimentosFinalizados?.count ?? 0);
    const taxaConversao = atendimentosCriadosCount > 0
      ? Number(((atendimentosFinalizadosCount / atendimentosCriadosCount) * 100).toFixed(1))
      : 0;

    return NextResponse.json({
      resumo_operacional: {
        faturamento_total: Number(faturamentoTotal?.total ?? 0),
        atendimentos_criados: atendimentosCriadosCount,
        procedimentos_pagos: Number(procedimentosPagos?.count ?? 0),
        valor_orcado_nao_pago: Number(valorOrcadoNaoPago?.total ?? 0),
      },
      resumo_analitico: {
        total_clientes: Number(totalClientes?.count ?? 0),
        ticket_medio: Number(ticketMedio?.total ?? 0),
        taxa_conversao: taxaConversao,
        comissoes_total: Number(comissoesTotal?.total ?? 0),
        atendimentos_finalizados: atendimentosFinalizadosCount,
      },
      porStatus,
      porCanal: porCanalRaw.map((canal) => ({
        ...canal,
        label: ORIGEM_LABELS[canal.origem] ?? canal.origem,
      })),
      topProcedimentos,
      faturamentoMensal,
      topVendedores,
      topExecutores,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard admin:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados do dashboard' },
      { status: 500 }
    );
  }
});
