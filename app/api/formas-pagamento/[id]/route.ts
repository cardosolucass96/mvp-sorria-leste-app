import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { withUnitRole } from '@/lib/auth/middleware';
import { nowUtcIso } from '@/lib/time';
import {
  buscarFormaPagamentoDaUnidade,
  garantirEsquemaFormasPagamento,
  isMetodoPagamentoValido,
  listarHistoricoFormaPagamento,
  normalizarGrupoFormaPagamento,
  normalizarSubgrupoFormaPagamento,
} from '@/lib/helpers/formasPagamento';

function parseNonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// GET /api/formas-pagamento/[id] - Detalhe com histórico
export const GET = withUnitRole(['admin', 'atendente'], async (_request, context) => {
  try {
    await garantirEsquemaFormasPagamento();
    const { id } = await context.params!;
    const formaId = Number(id);
    const forma = await buscarFormaPagamentoDaUnidade(formaId, context.unidadeId, { incluirInativas: true });

    if (!forma) {
      return NextResponse.json({ error: 'Forma de pagamento não encontrada' }, { status: 404 });
    }

    const historico = await listarHistoricoFormaPagamento(formaId);
    return NextResponse.json({ ...forma, historico });
  } catch (error) {
    console.error('Erro ao buscar forma de pagamento:', error);
    return NextResponse.json({ error: 'Erro ao buscar forma de pagamento' }, { status: 500 });
  }
});

// PUT /api/formas-pagamento/[id] - Atualiza forma e taxa
export const PUT = withUnitRole(['admin'], async (request: NextRequest, context) => {
  try {
    await garantirEsquemaFormasPagamento();
    const { id } = await context.params!;
    const formaId = Number(id);
    const body = await request.json();

    const existente = await buscarFormaPagamentoDaUnidade(formaId, context.unidadeId, { incluirInativas: true });
    if (!existente) {
      return NextResponse.json({ error: 'Forma de pagamento não encontrada' }, { status: 404 });
    }

    const grupo = body.grupo === undefined ? existente.grupo : normalizarGrupoFormaPagamento(body.grupo);
    const subgrupo = body.subgrupo === undefined ? existente.subgrupo : normalizarSubgrupoFormaPagamento(body.subgrupo);
    const metodoBase = body.metodo_base === undefined ? existente.metodo_base : body.metodo_base;
    const ativo = body.ativo === undefined ? existente.ativo : body.ativo ? 1 : 0;

    if (!grupo) {
      return NextResponse.json({ error: 'Grupo é obrigatório' }, { status: 400 });
    }

    if (!isMetodoPagamentoValido(metodoBase)) {
      return NextResponse.json({ error: 'Método base inválido' }, { status: 400 });
    }

    const taxaPercentual = body.taxa_percentual === undefined
      ? existente.taxa_percentual
      : parseNonNegativeNumber(body.taxa_percentual);
    const taxaFixa = body.taxa_fixa === undefined
      ? existente.taxa_fixa
      : parseNonNegativeNumber(body.taxa_fixa);

    if (!Number.isFinite(taxaPercentual) || taxaPercentual < 0 || taxaPercentual > 100) {
      return NextResponse.json({ error: 'Taxa percentual deve estar entre 0 e 100' }, { status: 400 });
    }

    if (!Number.isFinite(taxaFixa) || taxaFixa < 0) {
      return NextResponse.json({ error: 'Taxa fixa deve ser maior ou igual a zero' }, { status: 400 });
    }

    const duplicada = await queryOne<{ id: number }>(
      `SELECT id
       FROM formas_pagamento
       WHERE unidade_id = ?
         AND lower(grupo) = lower(?)
         AND lower(subgrupo) = lower(?)
         AND id <> ?`,
      [context.unidadeId, grupo, subgrupo, formaId]
    );

    if (duplicada) {
      return NextResponse.json({ error: 'Já existe uma forma com este grupo e subgrupo nesta unidade' }, { status: 409 });
    }

    const timestamp = nowUtcIso();
    await execute(
      `UPDATE formas_pagamento
       SET grupo = ?,
           subgrupo = ?,
           metodo_base = ?,
           ativo = ?,
           updated_at = ?
       WHERE id = ?`,
      [grupo, subgrupo, metodoBase, ativo, timestamp, formaId]
    );

    const taxaMudou = Number(taxaPercentual) !== Number(existente.taxa_percentual)
      || Number(taxaFixa) !== Number(existente.taxa_fixa);

    if (taxaMudou) {
      await execute(
        `UPDATE formas_pagamento_historico
         SET vigente_ate = ?
         WHERE forma_pagamento_id = ?
           AND vigente_ate IS NULL`,
        [timestamp, formaId]
      );

      await execute(
        `INSERT INTO formas_pagamento_historico (
           forma_pagamento_id,
           taxa_percentual,
           taxa_fixa,
           alterado_por_id
         ) VALUES (?, ?, ?, ?)`,
        [formaId, taxaPercentual, taxaFixa, context.user.sub]
      );
    }

    const forma = await buscarFormaPagamentoDaUnidade(formaId, context.unidadeId, { incluirInativas: true });
    const historico = await listarHistoricoFormaPagamento(formaId);
    return NextResponse.json({ ...forma, historico });
  } catch (error) {
    console.error('Erro ao atualizar forma de pagamento:', error);
    return NextResponse.json({ error: 'Erro ao atualizar forma de pagamento' }, { status: 500 });
  }
});
