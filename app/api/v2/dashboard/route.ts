import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { clinicDateTimeInputToUtcIso, getClinicMonthKey } from '@/lib/time';
import { withV2, type V2Context } from '../_shared';

interface MetricsRow {
  atendimentos_clinicos_realizados: number;
  avaliacoes_concluidas: number;
  avaliacoes_com_orcamento: number;
  orcamentos_apresentados: number;
  avaliacoes_convertidas: number;
  valor_proposto_centavos: number;
  valor_aceito_centavos: number;
  valor_recebido_centavos: number;
  valor_executado_centavos: number;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

export const GET = withV2(
  ['admin', 'atendente', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const url = new URL(request.url);
    const month = getClinicMonthKey();
    const fromDate = url.searchParams.get('data_inicio') || `${month}-01`;
    const toDate = url.searchParams.get('data_fim') || '9999-12-31';
    const from = clinicDateTimeInputToUtcIso(`${fromDate}T00:00`) ?? `${fromDate}T00:00:00.000Z`;
    const to = clinicDateTimeInputToUtcIso(`${toDate}T23:59`) ?? `${toDate}T23:59:59.999Z`;
    const params = [context.unidadeId, from, to];

    const metrics = await queryOne<MetricsRow>(
      `SELECT
        (SELECT COUNT(DISTINCT a.id) FROM atendimentos_clinicos a
          WHERE a.unidade_id = ?1 AND a.status = 'finalizado' AND a.finalizado_em BETWEEN ?2 AND ?3) AS atendimentos_clinicos_realizados,
        (SELECT COUNT(DISTINCT av.id) FROM avaliacoes av
          WHERE av.unidade_id = ?1 AND av.status = 'concluida' AND av.concluida_em BETWEEN ?2 AND ?3) AS avaliacoes_concluidas,
        (SELECT COUNT(DISTINCT av.id) FROM avaliacoes av
          WHERE av.unidade_id = ?1 AND av.status = 'concluida' AND av.concluida_em BETWEEN ?2 AND ?3
            AND EXISTS (SELECT 1 FROM procedimentos_cliente pc WHERE pc.avaliacao_id = av.id AND pc.status_comercial <> 'cancelado')) AS avaliacoes_com_orcamento,
        (SELECT COUNT(DISTINCT o.id) FROM orcamentos o
          WHERE o.unidade_id = ?1 AND o.apresentado_em BETWEEN ?2 AND ?3) AS orcamentos_apresentados,
        (SELECT COUNT(DISTINCT av.id) FROM avaliacoes av
          JOIN orcamentos o ON o.avaliacao_id = av.id
          WHERE av.unidade_id = ?1 AND o.apresentado_em BETWEEN ?2 AND ?3
            AND EXISTS (SELECT 1 FROM procedimentos_cliente pc WHERE pc.avaliacao_id = av.id AND pc.status_comercial = 'aceito')) AS avaliacoes_convertidas,
        (SELECT COALESCE(SUM(pc.valor_final_centavos), 0) FROM procedimentos_cliente pc
          WHERE pc.unidade_id = ?1 AND pc.origem = 'avaliacao' AND pc.status_comercial <> 'cancelado' AND pc.created_at BETWEEN ?2 AND ?3) AS valor_proposto_centavos,
        (SELECT COALESCE(SUM(pc.valor_final_centavos), 0) FROM procedimentos_cliente pc
          WHERE pc.unidade_id = ?1 AND pc.status_comercial = 'aceito' AND pc.aceito_em BETWEEN ?2 AND ?3) AS valor_aceito_centavos,
        (SELECT COALESCE(SUM(ra.valor_centavos - ra.valor_estornado_centavos), 0)
          FROM recebimento_alocacoes ra JOIN recebimentos r ON r.id = ra.recebimento_id
          WHERE r.unidade_id = ?1 AND r.status <> 'estornado' AND r.created_at BETWEEN ?2 AND ?3) AS valor_recebido_centavos,
        (SELECT COALESCE(SUM(pc.valor_final_centavos), 0) FROM procedimentos_cliente pc
          WHERE pc.unidade_id = ?1 AND pc.status_clinico = 'concluido' AND pc.concluido_em BETWEEN ?2 AND ?3) AS valor_executado_centavos`,
      params,
    );
    const safe: MetricsRow = metrics ?? {
      atendimentos_clinicos_realizados: 0,
      avaliacoes_concluidas: 0,
      avaliacoes_com_orcamento: 0,
      orcamentos_apresentados: 0,
      avaliacoes_convertidas: 0,
      valor_proposto_centavos: 0,
      valor_aceito_centavos: 0,
      valor_recebido_centavos: 0,
      valor_executado_centavos: 0,
    };
    const [filas, semOrcamentoPorMotivo, porAvaliador, porExecutor, porOrigem] = await Promise.all([
      queryOne<{
        aguardando_decisao: number;
        aguardando_pagamento: number;
        aguardando_agendamento: number;
        agendados: number;
        em_execucao: number;
        executados_com_saldo: number;
        concluidos: number;
      }>(
        `SELECT
          SUM(CASE WHEN status_comercial = 'proposto' THEN 1 ELSE 0 END) AS aguardando_decisao,
          SUM(CASE WHEN status_comercial = 'aceito' AND status_financeiro <> 'quitado' THEN 1 ELSE 0 END) AS aguardando_pagamento,
          SUM(CASE WHEN status_comercial = 'aceito' AND status_agenda = 'sem_agendamento' AND status_clinico IN ('nao_iniciado', 'em_execucao') THEN 1 ELSE 0 END) AS aguardando_agendamento,
          SUM(CASE WHEN status_agenda = 'agendado' THEN 1 ELSE 0 END) AS agendados,
          SUM(CASE WHEN status_clinico = 'em_execucao' THEN 1 ELSE 0 END) AS em_execucao,
          SUM(CASE WHEN status_clinico = 'concluido' AND status_financeiro <> 'quitado' THEN 1 ELSE 0 END) AS executados_com_saldo,
          SUM(CASE WHEN status_clinico = 'concluido' AND status_financeiro = 'quitado' THEN 1 ELSE 0 END) AS concluidos
         FROM v_procedimentos_cliente_operacional WHERE unidade_id = ?`,
        [context.unidadeId],
      ),
      query(
        `SELECT motivo_sem_orcamento AS motivo, COUNT(DISTINCT id) AS total
         FROM avaliacoes WHERE unidade_id = ? AND status = 'concluida'
           AND concluida_em BETWEEN ? AND ? AND motivo_sem_orcamento IS NOT NULL
         GROUP BY motivo_sem_orcamento ORDER BY total DESC`,
        params,
      ),
      query(
        `SELECT u.id, u.nome,
          COUNT(DISTINCT av.id) AS avaliacoes_concluidas,
          COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM procedimentos_cliente pc WHERE pc.avaliacao_id = av.id AND pc.status_comercial <> 'cancelado') THEN av.id END) AS avaliacoes_com_orcamento,
          COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM procedimentos_cliente pc WHERE pc.avaliacao_id = av.id AND pc.status_comercial = 'aceito') THEN av.id END) AS avaliacoes_convertidas
         FROM avaliacoes av JOIN usuarios u ON u.id = av.avaliador_id
         WHERE av.unidade_id = ? AND av.status = 'concluida' AND av.concluida_em BETWEEN ? AND ?
         GROUP BY u.id ORDER BY avaliacoes_concluidas DESC`,
        params,
      ),
      query(
        `SELECT u.id, u.nome, COUNT(DISTINCT ap.procedimento_cliente_id) AS procedimentos_executados,
          COALESCE(SUM(CASE WHEN ap.status = 'realizado' THEN pc.valor_final_centavos ELSE 0 END), 0) AS valor_executado_centavos
         FROM atendimento_procedimentos ap
         JOIN atendimentos_clinicos a ON a.id = ap.atendimento_clinico_id
         JOIN procedimentos_cliente pc ON pc.id = ap.procedimento_cliente_id
         JOIN usuarios u ON u.id = ap.executor_id
         WHERE a.unidade_id = ? AND ap.status = 'realizado' AND ap.concluido_em BETWEEN ? AND ?
         GROUP BY u.id ORDER BY procedimentos_executados DESC`,
        params,
      ),
      query(
        `SELECT c.origem, COUNT(DISTINCT av.id) AS avaliacoes,
          COUNT(DISTINCT CASE WHEN pc.status_comercial = 'aceito' THEN av.id END) AS convertidas
         FROM avaliacoes av JOIN clientes c ON c.id = av.cliente_id
         LEFT JOIN procedimentos_cliente pc ON pc.avaliacao_id = av.id
         WHERE av.unidade_id = ? AND av.status = 'concluida' AND av.concluida_em BETWEEN ? AND ?
         GROUP BY c.origem ORDER BY avaliacoes DESC`,
        params,
      ),
    ]);

    return NextResponse.json({
      periodo: { data_inicio: fromDate, data_fim: toDate },
      ...safe,
      taxa_geracao: rate(safe.avaliacoes_com_orcamento, safe.avaliacoes_concluidas),
      taxa_apresentacao: rate(safe.orcamentos_apresentados, safe.avaliacoes_com_orcamento),
      conversao_comercial: rate(safe.avaliacoes_convertidas, safe.orcamentos_apresentados),
      filas,
      avaliacoes_sem_orcamento_por_motivo: semOrcamentoPorMotivo,
      por_avaliador: porAvaliador,
      por_executor: porExecutor,
      por_origem: porOrigem,
    });
  },
);
