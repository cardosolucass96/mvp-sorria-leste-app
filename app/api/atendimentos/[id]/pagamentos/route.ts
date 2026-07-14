import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { buscarEtapasComValor, recalcularFinanceiroItens, roundMoney } from '@/lib/helpers/pagamentoFlow';
import { nowUtcIso } from '@/lib/time';
import {
  buscarFormaPagamentoDaUnidade,
  calcularValorLiquido,
  calcularValorTaxa,
  garantirEsquemaFormasPagamento,
  isMetodoPagamentoValido,
} from '@/lib/helpers/formasPagamento';
import { gerarComissoesVendaPorAlocacoes } from '@/lib/helpers/gerarComissoes';
import { garantirEsquemaPagamentosGrupos } from '@/lib/helpers/pagamentosGrupos';

interface Pagamento {
  id: number;
  atendimento_id: number;
  pagamento_grupo_id: number | null;
  forma_pagamento_id: number | null;
  valor: number;
  metodo: string;
  forma_pagamento_grupo_snapshot: string | null;
  forma_pagamento_subgrupo_snapshot: string | null;
  taxa_percentual_snapshot: number | null;
  taxa_fixa_snapshot: number | null;
  valor_taxa: number | null;
  valor_liquido: number | null;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
}

interface AlocacaoPagamentoInput {
  item_id: number;
  etapa_modelo_id?: number | null;
  valor: number;
}

interface PagamentoFormaInput {
  forma_pagamento_id?: number;
  metodo?: string;
  valor: number;
}

interface PagamentoFormaResolvedInput {
  forma_pagamento_id: number | null;
  metodo: string;
  valor: number;
  forma_pagamento_grupo_snapshot: string | null;
  forma_pagamento_subgrupo_snapshot: string | null;
  taxa_percentual_snapshot: number;
  taxa_fixa_snapshot: number;
  valor_taxa: number;
  valor_liquido: number;
}

interface ItemPagamentoRow {
  id: number;
  procedimento_id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  etapas_valores: string | null;
  criado_por_id: number;
  adicionado_em_execucao: number;
  comissao_venda: number | null;
  comissao_acrescimo: number | null;
}

interface PagamentoAgrupadoRow extends Pagamento {
  recebido_por_nome: string | null;
  grupo_valor_total: number | null;
  grupo_observacoes: string | null;
  grupo_cancelado: number | null;
  grupo_motivo_cancelamento: string | null;
  grupo_created_at: string | null;
}

interface PagamentoAlocacaoResponse {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number | null;
  agendamento_id: number | null;
  etapa_modelo_id: number | null;
  valor_alocado: number;
  procedimento_nome: string;
  etapa_label: string | null;
  dentes: string | null;
  dente_unico: string | null;
  quantidade: number | null;
  data_agendada: string | null;
  agendamento_status: string | null;
}

interface PagamentoAgrupadoResponse {
  id: string;
  pagamento_grupo_id: number | null;
  pagamento_representante_id: number;
  valor_total: number;
  valor_taxa_total: number;
  valor_liquido_total: number;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  alocacoes: PagamentoAlocacaoResponse[];
  formas: Array<{
    id: number;
    valor: number;
    metodo: string;
    forma_pagamento_id: number | null;
    forma_pagamento_grupo_snapshot: string | null;
    forma_pagamento_subgrupo_snapshot: string | null;
    taxa_percentual_snapshot: number | null;
    taxa_fixa_snapshot: number | null;
    valor_taxa: number | null;
    valor_liquido: number | null;
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
    alocacoes: PagamentoAlocacaoResponse[];
  }>;
}

interface NormalizedAlocacao {
  item_id: number;
  etapa_modelo_id: number | null;
  valor: number;
}

async function verificarAtendimentoUnidade(atendimentoId: number, unidadeId: number) {
  const at = await queryOne<Atendimento>(
    'SELECT id, status, unidade_id FROM atendimentos WHERE id = ?',
    [atendimentoId]
  );
  if (!at) return { error: NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 }) };
  if (at.unidade_id !== unidadeId) return { error: NextResponse.json({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 }) };
  return { atendimento: at };
}

function normalizarAlocacoes(alocacoes: AlocacaoPagamentoInput[]): NormalizedAlocacao[] {
  return alocacoes.map((alocacao) => ({
    item_id: Number(alocacao.item_id),
    etapa_modelo_id: alocacao.etapa_modelo_id ? Number(alocacao.etapa_modelo_id) : null,
    valor: roundMoney(Number(alocacao.valor || 0)),
  }));
}

async function normalizarFormasPagamento(
  formas: PagamentoFormaInput[],
  unidadeId: number
): Promise<{ formas?: PagamentoFormaResolvedInput[]; error?: Response }> {
  const formasNormalizadas: PagamentoFormaResolvedInput[] = [];

  for (const forma of formas) {
    const valor = roundMoney(Number(forma.valor || 0));
    if (!Number.isFinite(valor) || valor <= 0) {
      return {
        error: NextResponse.json(
          { error: 'Cada forma de pagamento deve ter valor maior que zero' },
          { status: 400 }
        ),
      };
    }

    const formaPagamentoId = Number(forma.forma_pagamento_id ?? 0);
    if (Number.isFinite(formaPagamentoId) && formaPagamentoId > 0) {
      const configuracao = await buscarFormaPagamentoDaUnidade(formaPagamentoId, unidadeId);
      if (!configuracao || !configuracao.ativo) {
        return {
          error: NextResponse.json(
            { error: 'Forma de pagamento inválida, inativa ou de outra unidade' },
            { status: 400 }
          ),
        };
      }

      formasNormalizadas.push({
        forma_pagamento_id: configuracao.id,
        metodo: configuracao.metodo_base,
        valor,
        forma_pagamento_grupo_snapshot: configuracao.grupo,
        forma_pagamento_subgrupo_snapshot: configuracao.subgrupo,
        taxa_percentual_snapshot: roundMoney(Number(configuracao.taxa_percentual ?? 0)),
        taxa_fixa_snapshot: roundMoney(Number(configuracao.taxa_fixa ?? 0)),
        valor_taxa: calcularValorTaxa(valor, configuracao.taxa_percentual, configuracao.taxa_fixa),
        valor_liquido: calcularValorLiquido(valor, configuracao.taxa_percentual, configuracao.taxa_fixa),
      });
      continue;
    }

    if (!isMetodoPagamentoValido(forma.metodo)) {
      return {
        error: NextResponse.json({ error: 'Método de pagamento inválido' }, { status: 400 }),
      };
    }

    formasNormalizadas.push({
      forma_pagamento_id: null,
      metodo: forma.metodo,
      valor,
      forma_pagamento_grupo_snapshot: null,
      forma_pagamento_subgrupo_snapshot: '',
      taxa_percentual_snapshot: 0,
      taxa_fixa_snapshot: 0,
      valor_taxa: 0,
      valor_liquido: valor,
    });
  }

  return { formas: formasNormalizadas };
}

async function buscarAlocacoesPagamentos(atendimentoId: number) {
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
     ORDER BY pa.created_at ASC, pa.id ASC`,
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

function agruparPagamentos(
  rows: PagamentoAgrupadoRow[],
  alocacoesPorPagamento = new Map<number, PagamentoAlocacaoResponse[]>()
): PagamentoAgrupadoResponse[] {
  const grupos = new Map<string, PagamentoAgrupadoResponse>();

  for (const row of rows) {
    const key = row.pagamento_grupo_id ? `grupo:${row.pagamento_grupo_id}` : `pagamento:${row.id}`;
    const grupoExistente = grupos.get(key);

    if (!grupoExistente) {
      grupos.set(key, {
        id: key,
        pagamento_grupo_id: row.pagamento_grupo_id,
        pagamento_representante_id: row.id,
        valor_total: roundMoney(row.grupo_valor_total ?? row.valor),
        valor_taxa_total: 0,
        valor_liquido_total: 0,
        observacoes: row.grupo_observacoes ?? row.observacoes,
        cancelado: row.grupo_cancelado ?? row.cancelado,
        motivo_cancelamento: row.grupo_motivo_cancelamento ?? row.motivo_cancelamento,
        created_at: row.grupo_created_at ?? row.created_at,
        recebido_por_nome: row.recebido_por_nome,
        alocacoes: [],
        formas: [],
      });
    }

    const alocacoes = alocacoesPorPagamento.get(row.id) ?? [];
    const grupo = grupos.get(key)!;
    grupo.alocacoes.push(...alocacoes);
    grupo.valor_taxa_total = roundMoney(grupo.valor_taxa_total + Number(row.valor_taxa ?? 0));
    grupo.valor_liquido_total = roundMoney(grupo.valor_liquido_total + Number(row.valor_liquido ?? row.valor));
    grupos.get(key)!.formas.push({
      id: row.id,
      valor: row.valor,
      metodo: row.metodo,
      forma_pagamento_id: row.forma_pagamento_id,
      forma_pagamento_grupo_snapshot: row.forma_pagamento_grupo_snapshot,
      forma_pagamento_subgrupo_snapshot: row.forma_pagamento_subgrupo_snapshot,
      taxa_percentual_snapshot: row.taxa_percentual_snapshot,
      taxa_fixa_snapshot: row.taxa_fixa_snapshot,
      valor_taxa: row.valor_taxa,
      valor_liquido: row.valor_liquido,
      observacoes: row.observacoes,
      cancelado: row.cancelado,
      motivo_cancelamento: row.motivo_cancelamento,
      created_at: row.created_at,
      alocacoes,
    });
  }

  return Array.from(grupos.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function validarAlocacoes(
  atendimentoId: number,
  alocacoes: NormalizedAlocacao[]
) {
  if (alocacoes.length === 0) {
    return { error: NextResponse.json({ error: 'Informe ao menos uma alocação de pagamento' }, { status: 400 }) };
  }

  const itemIds = [...new Set(alocacoes.map((alocacao) => alocacao.item_id).filter(Number.isFinite))];
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
  const itensMap = new Map(itens.map((item) => [item.id, item]));

  for (const alocacao of alocacoes) {
    if (!Number.isFinite(alocacao.valor) || alocacao.valor <= 0) {
      return { error: NextResponse.json({ error: 'Valor de alocação inválido' }, { status: 400 }) };
    }

    const item = itensMap.get(alocacao.item_id);
    if (!item) {
      return { error: NextResponse.json({ error: 'Item de atendimento inválido na alocação' }, { status: 400 }) };
    }

    if (alocacao.etapa_modelo_id) {
      const etapas = await buscarEtapasComValor(item);
      const etapa = etapas.find((et) => et.id === alocacao.etapa_modelo_id);
      if (!etapa) {
        return { error: NextResponse.json({ error: 'Sessão inválida na alocação' }, { status: 400 }) };
      }
    }
  }

  return { itemIds, itensMap };
}

async function criarGrupoDePagamentos({
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

// GET /api/atendimentos/[id]/pagamentos - Lista pagamentos do atendimento
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    await garantirEsquemaPagamentosGrupos();
    await garantirEsquemaFormasPagamento();
    const result = await verificarAtendimentoUnidade(atendimentoId, context.unidadeId);
    if ('error' in result) return result.error;

    const grouped = request.nextUrl.searchParams.get('grouped') === '1';

    if (!grouped) {
      const alocacoesPorPagamento = await buscarAlocacoesPagamentos(atendimentoId);
      const pagamentos = await query<Pagamento & { recebido_por_nome: string | null }>(
        `SELECT p.*, u.nome as recebido_por_nome
         FROM pagamentos p
         LEFT JOIN usuarios u ON p.recebido_por_id = u.id
         WHERE p.atendimento_id = ?
         ORDER BY p.created_at DESC`,
        [atendimentoId]
      );

      return NextResponse.json(pagamentos.map((pagamento) => ({
        ...pagamento,
        alocacoes: alocacoesPorPagamento.get(pagamento.id) ?? [],
      })));
    }

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
       ORDER BY COALESCE(pg.created_at, p.created_at) DESC, p.created_at DESC, p.id DESC`,
      [atendimentoId]
    );

    const alocacoesPorPagamento = await buscarAlocacoesPagamentos(atendimentoId);
    return NextResponse.json(agruparPagamentos(pagamentos, alocacoesPorPagamento));
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar pagamentos' },
      { status: 500 }
    );
  }
});

// POST /api/atendimentos/[id]/pagamentos - Registra novo pagamento com alocação explícita.
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    const body = await request.json();
    const {
      valor,
      metodo,
      forma_pagamento_id: formaPagamentoIdSimples,
      observacoes,
      alocacoes,
      valor_total: valorTotalComposto,
      formas,
    } = body as {
      valor?: number;
      metodo?: string;
      forma_pagamento_id?: number;
      observacoes?: string | null;
      alocacoes?: AlocacaoPagamentoInput[];
      valor_total?: number;
      formas?: PagamentoFormaInput[];
    };

    const check = await verificarAtendimentoUnidade(atendimentoId, context.unidadeId);
    if ('error' in check) return check.error;
    const atendimento = check.atendimento;

    if (!['aguardando_pagamento', 'em_execucao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Não é possível registrar pagamento neste status' },
        { status: 400 }
      );
    }

    const alocacoesNormalizadas = Array.isArray(alocacoes) ? normalizarAlocacoes(alocacoes) : [];
    const recebidoPorId = context.user.sub;
    const modoComposto = Array.isArray(formas);

    if (modoComposto && (metodo || formaPagamentoIdSimples)) {
      return NextResponse.json(
        { error: 'Envie a forma simples ou formas[]/valor_total, mas não os dois formatos ao mesmo tempo' },
        { status: 400 }
      );
    }

    if (modoComposto) {
      const valorTotal = roundMoney(Number(valorTotalComposto || 0));
      if (!valorTotal || valorTotal <= 0) {
        return NextResponse.json(
          { error: 'Valor total do pagamento composto é obrigatório e deve ser maior que zero' },
          { status: 400 }
        );
      }

      if (formas.length === 0) {
        return NextResponse.json(
          { error: 'Informe ao menos uma forma de pagamento' },
          { status: 400 }
        );
      }

      await garantirEsquemaPagamentosGrupos();
      await garantirEsquemaFormasPagamento();

      const formasResolvidas = await normalizarFormasPagamento(formas, context.unidadeId);
      if (formasResolvidas.error) return formasResolvidas.error;
      const formasNormalizadas = formasResolvidas.formas ?? [];

      const validacaoAlocacoes = await validarAlocacoes(atendimentoId, alocacoesNormalizadas);
      if ('error' in validacaoAlocacoes) return validacaoAlocacoes.error;
      const somaAlocacoes = roundMoney(alocacoesNormalizadas.reduce((sum, alocacao) => sum + alocacao.valor, 0));

      const somaFormas = roundMoney(formasNormalizadas.reduce((sum, forma) => sum + forma.valor, 0));
      if (Math.abs(somaFormas - valorTotal) > 0.01) {
        return NextResponse.json(
          { error: 'A soma das formas de pagamento deve ser igual ao total selecionado' },
          { status: 400 }
        );
      }

      if (Math.abs(somaAlocacoes - valorTotal) > 0.01) {
        return NextResponse.json(
          { error: 'O valor total do pagamento deve ser igual à soma das alocações' },
          { status: 400 }
        );
      }

      const { pagamentoRepresentanteId, alocacaoIdsGeradas } = await criarGrupoDePagamentos({
        atendimentoId,
        recebidoPorId,
        observacoes: observacoes || null,
        valorTotal,
        formas: formasNormalizadas,
        alocacoes: alocacoesNormalizadas,
        itensMap: validacaoAlocacoes.itensMap,
      });

      await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);
      await gerarComissoesVendaPorAlocacoes(alocacaoIdsGeradas);

      const novoPagamento = await queryOne<Pagamento>(
        'SELECT * FROM pagamentos WHERE id = ?',
        [pagamentoRepresentanteId]
      );

      return NextResponse.json(novoPagamento, { status: 201 });
    }

    if (!valor || valor <= 0) {
      return NextResponse.json(
        { error: 'Valor do pagamento é obrigatório e deve ser maior que zero' },
        { status: 400 }
      );
    }

    const valorNormalizado = roundMoney(Number(valor));
    const formaSimplesInput: PagamentoFormaInput = formaPagamentoIdSimples
      ? { forma_pagamento_id: Number(formaPagamentoIdSimples), valor: valorNormalizado }
      : { metodo, valor: valorNormalizado };

    await garantirEsquemaPagamentosGrupos();
    await garantirEsquemaFormasPagamento();

    const formasResolvidas = await normalizarFormasPagamento([formaSimplesInput], context.unidadeId);
    if (formasResolvidas.error) return formasResolvidas.error;
    const formasNormalizadas = formasResolvidas.formas ?? [];

    const validacaoAlocacoes = await validarAlocacoes(atendimentoId, alocacoesNormalizadas);
    if ('error' in validacaoAlocacoes) return validacaoAlocacoes.error;
    const somaAlocacoes = roundMoney(alocacoesNormalizadas.reduce((sum, alocacao) => sum + alocacao.valor, 0));

    if (Math.abs(somaAlocacoes - valorNormalizado) > 0.01) {
      return NextResponse.json(
        { error: 'O valor do pagamento deve ser igual à soma das alocações' },
        { status: 400 }
      );
    }

    const { pagamentoRepresentanteId, alocacaoIdsGeradas } = await criarGrupoDePagamentos({
      atendimentoId,
      recebidoPorId,
      observacoes: observacoes || null,
      valorTotal: valorNormalizado,
      formas: formasNormalizadas,
      alocacoes: alocacoesNormalizadas,
      itensMap: validacaoAlocacoes.itensMap,
    });

    await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);
    await gerarComissoesVendaPorAlocacoes(alocacaoIdsGeradas);

    const novoPagamento = await queryOne<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ?',
      [pagamentoRepresentanteId]
    );

    return NextResponse.json(novoPagamento, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao registrar pagamento' },
      { status: 500 }
    );
  }
});
