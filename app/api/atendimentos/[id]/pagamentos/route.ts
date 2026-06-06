import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { buscarEtapasComValor, recalcularFinanceiroItens, roundMoney } from '@/lib/helpers/pagamentoFlow';
import { garantirEsquemaPagamentosGrupos } from '@/lib/helpers/pagamentosGrupos';

interface Pagamento {
  id: number;
  atendimento_id: number;
  pagamento_grupo_id: number | null;
  valor: number;
  metodo: string;
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
  metodo: string;
  valor: number;
}

interface ItemPagamentoRow {
  id: number;
  procedimento_id: number;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  etapas_valores: string | null;
}

interface PagamentoAgrupadoRow extends Pagamento {
  recebido_por_nome: string | null;
  grupo_valor_total: number | null;
  grupo_observacoes: string | null;
  grupo_cancelado: number | null;
  grupo_motivo_cancelamento: string | null;
  grupo_created_at: string | null;
}

interface PagamentoAgrupadoResponse {
  id: string;
  pagamento_grupo_id: number | null;
  pagamento_representante_id: number;
  valor_total: number;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  formas: Array<{
    id: number;
    valor: number;
    metodo: string;
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
    created_at: string;
  }>;
}

interface NormalizedAlocacao {
  item_id: number;
  etapa_modelo_id: number | null;
  valor: number;
}

const METODOS_VALIDOS = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria'];

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

function agruparPagamentos(rows: PagamentoAgrupadoRow[]): PagamentoAgrupadoResponse[] {
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
        observacoes: row.grupo_observacoes ?? row.observacoes,
        cancelado: row.grupo_cancelado ?? row.cancelado,
        motivo_cancelamento: row.grupo_motivo_cancelamento ?? row.motivo_cancelamento,
        created_at: row.grupo_created_at ?? row.created_at,
        recebido_por_nome: row.recebido_por_nome,
        formas: [],
      });
    }

    grupos.get(key)!.formas.push({
      id: row.id,
      valor: row.valor,
      metodo: row.metodo,
      observacoes: row.observacoes,
      cancelado: row.cancelado,
      motivo_cancelamento: row.motivo_cancelamento,
      created_at: row.created_at,
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
        `SELECT id, procedimento_id, valor, valor_final, valor_pago, etapas_valores
         FROM itens_atendimento
         WHERE atendimento_id = ? AND id IN (${placeholders})`,
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

  return { itemIds };
}

async function criarGrupoDePagamentos({
  atendimentoId,
  recebidoPorId,
  observacoes,
  valorTotal,
  formas,
  alocacoes,
}: {
  atendimentoId: number;
  recebidoPorId: number;
  observacoes: string | null;
  valorTotal: number;
  formas: PagamentoFormaInput[];
  alocacoes: NormalizedAlocacao[];
}) {
  const grupoResult = await execute(
    `INSERT INTO pagamentos_grupos (
      atendimento_id,
      recebido_por_id,
      valor_total,
      observacoes
    ) VALUES (?, ?, ?, ?)`,
    [atendimentoId, recebidoPorId, valorTotal, observacoes]
  );

  const pagamentoGrupoId = Number(grupoResult.lastInsertRowid);
  const alocacoesRestantes = alocacoes.map((alocacao) => ({
    ...alocacao,
    restante: alocacao.valor,
  }));

  let pagamentoRepresentanteId: number | null = null;

  for (const forma of formas) {
    const pagamentoResult = await execute(
      `INSERT INTO pagamentos (
        atendimento_id,
        pagamento_grupo_id,
        recebido_por_id,
        valor,
        metodo,
        observacoes
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        atendimentoId,
        pagamentoGrupoId,
        recebidoPorId,
        roundMoney(forma.valor),
        forma.metodo,
        observacoes,
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

      await execute(
        `INSERT INTO pagamentos_alocacoes (pagamento_id, item_atendimento_id, etapa_modelo_id, valor_alocado)
         VALUES (?, ?, ?, ?)`,
        [pagamentoId, alocacao.item_id, alocacao.etapa_modelo_id, valorAlocado]
      );

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

  return { pagamentoGrupoId, pagamentoRepresentanteId };
}

// GET /api/atendimentos/[id]/pagamentos - Lista pagamentos do atendimento
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);
    const result = await verificarAtendimentoUnidade(atendimentoId, context.unidadeId);
    if ('error' in result) return result.error;

    const grouped = request.nextUrl.searchParams.get('grouped') === '1';
    if (grouped) {
      await garantirEsquemaPagamentosGrupos();
    }

    if (!grouped) {
      const pagamentos = await query(
        `SELECT p.*, u.nome as recebido_por_nome
         FROM pagamentos p
         LEFT JOIN usuarios u ON p.recebido_por_id = u.id
         WHERE p.atendimento_id = ?
         ORDER BY p.created_at DESC`,
        [atendimentoId]
      );

      return NextResponse.json(pagamentos);
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

    return NextResponse.json(agruparPagamentos(pagamentos));
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
      observacoes,
      alocacoes,
      valor_total: valorTotalComposto,
      formas,
    } = body as {
      valor?: number;
      metodo?: string;
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

    if (modoComposto && metodo) {
      return NextResponse.json(
        { error: 'Envie metodo/valor simples ou formas[]/valor_total, mas não os dois formatos ao mesmo tempo' },
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

      const formasNormalizadas = formas.map((forma) => ({
        metodo: forma.metodo,
        valor: roundMoney(Number(forma.valor || 0)),
      }));

      for (const forma of formasNormalizadas) {
        if (!METODOS_VALIDOS.includes(forma.metodo)) {
          return NextResponse.json({ error: 'Método de pagamento inválido' }, { status: 400 });
        }

        if (!Number.isFinite(forma.valor) || forma.valor <= 0) {
          return NextResponse.json(
            { error: 'Cada forma de pagamento deve ter valor maior que zero' },
            { status: 400 }
          );
        }
      }

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

      await garantirEsquemaPagamentosGrupos();

      const { pagamentoRepresentanteId } = await criarGrupoDePagamentos({
        atendimentoId,
        recebidoPorId,
        observacoes: observacoes || null,
        valorTotal,
        formas: formasNormalizadas,
        alocacoes: alocacoesNormalizadas,
      });

      await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);

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

    if (!metodo || !METODOS_VALIDOS.includes(metodo)) {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      );
    }

    const validacaoAlocacoes = await validarAlocacoes(atendimentoId, alocacoesNormalizadas);
    if ('error' in validacaoAlocacoes) return validacaoAlocacoes.error;
    const somaAlocacoes = roundMoney(alocacoesNormalizadas.reduce((sum, alocacao) => sum + alocacao.valor, 0));

    const valorNormalizado = roundMoney(Number(valor));
    if (Math.abs(somaAlocacoes - valorNormalizado) > 0.01) {
      return NextResponse.json(
        { error: 'O valor do pagamento deve ser igual à soma das alocações' },
        { status: 400 }
      );
    }

    await garantirEsquemaPagamentosGrupos();

    const { pagamentoRepresentanteId } = await criarGrupoDePagamentos({
      atendimentoId,
      recebidoPorId,
      observacoes: observacoes || null,
      valorTotal: valorNormalizado,
      formas: [{ metodo, valor: valorNormalizado }],
      alocacoes: alocacoesNormalizadas,
    });

    await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);

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
