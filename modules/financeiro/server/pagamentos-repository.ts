import 'server-only';
import { execute, query, queryOne } from '@/lib/db';
import { getSqlUtcInstantExpression, nowUtcIso } from '@/lib/time';
import { roundMoney } from '@/shared/money';
import type { Atendimento, Pagamento, PagamentoAgrupadoRow, PagamentoAlocacaoResponse, PagamentoFormaResolvedInput, NormalizedAlocacao, ItemPagamentoRow } from '../contracts/pagamentos';

export async function buscarAtendimentoPagamento(atendimentoId: number) {
  return queryOne<Atendimento>('SELECT id, status, unidade_id FROM atendimentos WHERE id = ?', [atendimentoId]);
}
export async function buscarPagamento(id: number) {
  return queryOne<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', [id]);
}
export async function buscarAlocacoesPagamentos(atendimentoId: number) {
  const alocacaoCreatedAtExpr = getSqlUtcInstantExpression('pa.created_at');
  const alocacoes = await query<PagamentoAlocacaoResponse>(
    `SELECT
       pa.id,
       pa.pagamento_id,
       pa.item_atendimento_id,
       pa.agendamento_id,
       pa.etapa_modelo_id,
       pa.valor_alocado,
       COALESCE(p_item.nome, p_ag.nome, 'Procedimento') as procedimento_nome,
       COALESCE(etapa.nome, i.etapa_label) as etapa_label,
       i.dentes,
       i.dente_unico,
       i.quantidade,
       ag.data_agendada,
       ag.status as agendamento_status
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
     LEFT JOIN itens_atendimento i ON i.id = pa.item_atendimento_id
     LEFT JOIN procedimentos p_item ON p_item.id = i.procedimento_id
     LEFT JOIN agendamentos ag ON ag.id = pa.agendamento_id
     LEFT JOIN procedimentos p_ag ON p_ag.id = ag.procedimento_id
     LEFT JOIN procedimento_etapas_modelo etapa ON etapa.id = COALESCE(pa.etapa_modelo_id, ag.etapa_modelo_id, i.etapa_modelo_id)
     WHERE pg.atendimento_id = ?
     ORDER BY ${alocacaoCreatedAtExpr} ASC, pa.id ASC`,
    [atendimentoId]
  );

  const porPagamento = new Map<number, PagamentoAlocacaoResponse[]>();
  for (const alocacao of alocacoes) {
    const lista = porPagamento.get(alocacao.pagamento_id) ?? [];
    lista.push(alocacao);
    porPagamento.set(alocacao.pagamento_id, lista);
  }
  return porPagamento;
}

export async function criarGrupoDePagamentos({
  atendimentoId,
  recebidoPorId,
  observacoes,
  valorTotal,
  formas,
  alocacoes,
  itensMap,
}: {
  atendimentoId: number;
  recebidoPorId: number;
  observacoes: string | null;
  valorTotal: number;
  formas: PagamentoFormaResolvedInput[];
  alocacoes: NormalizedAlocacao[];
  itensMap: Map<number, ItemPagamentoRow>;
}) {
  const createdAt = nowUtcIso();
  const grupoResult = await execute(
    `INSERT INTO pagamentos_grupos (
      atendimento_id,
      recebido_por_id,
      valor_total,
      observacoes,
      created_at
    ) VALUES (?, ?, ?, ?, ?)`,
    [atendimentoId, recebidoPorId, valorTotal, observacoes, createdAt]
  );

  const pagamentoGrupoId = Number(grupoResult.lastInsertRowid);
  const alocacoesRestantes = alocacoes.map((alocacao) => ({
    ...alocacao,
    restante: alocacao.valor,
  }));

  let pagamentoRepresentanteId: number | null = null;
  const alocacaoIdsGeradas: number[] = [];

  for (const forma of formas) {
    const pagamentoResult = await execute(
      `INSERT INTO pagamentos (
        atendimento_id,
        pagamento_grupo_id,
        forma_pagamento_id,
        recebido_por_id,
        valor,
        metodo,
        forma_pagamento_grupo_snapshot,
        forma_pagamento_subgrupo_snapshot,
        taxa_percentual_snapshot,
        taxa_fixa_snapshot,
        valor_taxa,
        valor_liquido,
        observacoes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        atendimentoId,
        pagamentoGrupoId,
        forma.forma_pagamento_id,
        recebidoPorId,
        roundMoney(forma.valor),
        forma.metodo,
        forma.forma_pagamento_grupo_snapshot,
        forma.forma_pagamento_subgrupo_snapshot,
        forma.taxa_percentual_snapshot,
        forma.taxa_fixa_snapshot,
        forma.valor_taxa,
        forma.valor_liquido,
        observacoes,
        createdAt,
      ]
    );

    const pagamentoId = Number(pagamentoResult.lastInsertRowid);
    if (!pagamentoRepresentanteId) {
      pagamentoRepresentanteId = pagamentoId;
    }

    let saldoDaForma = roundMoney(forma.valor);
    for (const alocacao of alocacoesRestantes) {
      if (saldoDaForma <= 0.01) break;
      if (alocacao.restante <= 0.01) continue;

      const valorAlocado = roundMoney(Math.min(saldoDaForma, alocacao.restante));
      if (valorAlocado <= 0) continue;

      const item = itensMap.get(alocacao.item_id);
      const origemComissao = item?.adicionado_em_execucao ? 'acrescimo' : 'avaliacao';
      const percentualComissao = roundMoney(Number(
        origemComissao === 'acrescimo'
          ? item?.comissao_acrescimo ?? 0
          : item?.comissao_venda ?? 0
      ));

      const alocacaoResult = await execute(
        `INSERT INTO pagamentos_alocacoes (
           pagamento_id,
           item_atendimento_id,
           etapa_modelo_id,
           valor_alocado,
           criado_por_id,
           origem_comissao,
           percentual_comissao,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagamentoId,
          alocacao.item_id,
          alocacao.etapa_modelo_id,
          valorAlocado,
          item?.criado_por_id ?? null,
          origemComissao,
          percentualComissao,
          createdAt,
        ]
      );
      alocacaoIdsGeradas.push(Number(alocacaoResult.lastInsertRowid));

      alocacao.restante = roundMoney(alocacao.restante - valorAlocado);
      saldoDaForma = roundMoney(saldoDaForma - valorAlocado);
    }

    if (saldoDaForma > 0.01) {
      throw new Error('Não foi possível distribuir o valor informado entre as alocações selecionadas');
    }
  }

  const saldoResidual = alocacoesRestantes.some((alocacao) => alocacao.restante > 0.01);
  if (saldoResidual || pagamentoRepresentanteId === null) {
    throw new Error('A distribuição automática do pagamento não fechou o total selecionado');
  }

  return { pagamentoGrupoId, pagamentoRepresentanteId, alocacaoIdsGeradas };
}


export async function buscarPagamentosSimples(atendimentoId: number) {
  const pagamentoCreatedAtExpr = getSqlUtcInstantExpression('p.created_at');
  const pagamentos = await query<Pagamento & { recebido_por_nome: string | null }>(
    `SELECT p.*, u.nome as recebido_por_nome
     FROM pagamentos p
     LEFT JOIN usuarios u ON p.recebido_por_id = u.id
     WHERE p.atendimento_id = ?
     ORDER BY ${pagamentoCreatedAtExpr} DESC, p.id DESC`,
    [atendimentoId]
  );
  return pagamentos;
}

export async function buscarPagamentosAgrupados(atendimentoId: number) {
    const pagamentoCreatedAtExpr = getSqlUtcInstantExpression('p.created_at');
    const pagamentoGrupoCreatedAtExpr = getSqlUtcInstantExpression('pg.created_at');
    const pagamentos = await query<PagamentoAgrupadoRow>(
      `SELECT
         p.*,
         u.nome as recebido_por_nome,
         pg.valor_total as grupo_valor_total,
         pg.observacoes as grupo_observacoes,
         pg.cancelado as grupo_cancelado,
         pg.motivo_cancelamento as grupo_motivo_cancelamento,
         pg.created_at as grupo_created_at
       FROM pagamentos p
       LEFT JOIN usuarios u ON p.recebido_por_id = u.id
       LEFT JOIN pagamentos_grupos pg ON pg.id = p.pagamento_grupo_id
       WHERE p.atendimento_id = ?
       ORDER BY COALESCE(${pagamentoGrupoCreatedAtExpr}, ${pagamentoCreatedAtExpr}) DESC, ${pagamentoCreatedAtExpr} DESC, p.id DESC`,
      [atendimentoId]
    );
  return pagamentos;
}

export async function buscarItensPagamento(atendimentoId: number, itemIds: number[]) {
  const placeholders = itemIds.map(() => '?').join(',');
  const itens = itemIds.length > 0
    ? await query<ItemPagamentoRow>(
        `SELECT
           i.id,
           i.procedimento_id,
           i.valor,
           i.valor_final,
           i.valor_pago,
           i.etapas_valores,
           i.criado_por_id,
           i.adicionado_em_execucao,
           p.comissao_venda,
           p.comissao_acrescimo
         FROM itens_atendimento i
         LEFT JOIN procedimentos p ON p.id = i.procedimento_id
         WHERE i.atendimento_id = ? AND i.id IN (${placeholders})`,
        [atendimentoId, ...itemIds]
      )
    : [];
  return itens;
}
