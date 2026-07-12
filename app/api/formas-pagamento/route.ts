import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { withUnitRole } from '@/lib/auth/middleware';
import {
  garantirEsquemaFormasPagamento,
  isMetodoPagamentoValido,
  listarFormasPagamentoDaUnidade,
  normalizarGrupoFormaPagamento,
  normalizarSubgrupoFormaPagamento,
} from '@/lib/helpers/formasPagamento';

function parseNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// GET /api/formas-pagamento - Lista formas da unidade atual
export const GET = withUnitRole(['admin', 'atendente'], async (request, context) => {
  try {
    await garantirEsquemaFormasPagamento();
    const incluirInativas = request.nextUrl.searchParams.get('inativos') === 'true';
    const formas = await listarFormasPagamentoDaUnidade(context.unidadeId, { incluirInativas });
    return NextResponse.json(formas);
  } catch (error) {
    console.error('Erro ao buscar formas de pagamento:', error);
    return NextResponse.json({ error: 'Erro ao buscar formas de pagamento' }, { status: 500 });
  }
});

// POST /api/formas-pagamento - Cria forma da unidade atual
export const POST = withUnitRole(['admin'], async (request: NextRequest, context) => {
  try {
    await garantirEsquemaFormasPagamento();
    const body = await request.json();
    const grupo = normalizarGrupoFormaPagamento(body.grupo);
    const subgrupo = normalizarSubgrupoFormaPagamento(body.subgrupo);
    const metodoBase = body.metodo_base;
    const taxaPercentual = parseNonNegativeNumber(body.taxa_percentual, 0);
    const taxaFixa = parseNonNegativeNumber(body.taxa_fixa, 0);
    const ativo = body.ativo === undefined ? 1 : body.ativo ? 1 : 0;

    if (!grupo) {
      return NextResponse.json({ error: 'Grupo é obrigatório' }, { status: 400 });
    }

    if (!isMetodoPagamentoValido(metodoBase)) {
      return NextResponse.json({ error: 'Método base inválido' }, { status: 400 });
    }

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
         AND lower(subgrupo) = lower(?)`,
      [context.unidadeId, grupo, subgrupo]
    );

    if (duplicada) {
      return NextResponse.json({ error: 'Já existe uma forma com este grupo e subgrupo nesta unidade' }, { status: 409 });
    }

    const insertForma = await execute(
      `INSERT INTO formas_pagamento (
         unidade_id,
         grupo,
         subgrupo,
         metodo_base,
         ativo
       ) VALUES (?, ?, ?, ?, ?)`,
      [context.unidadeId, grupo, subgrupo, metodoBase, ativo]
    );

    const formaId = Number(insertForma.lastInsertRowid);
    await execute(
      `INSERT INTO formas_pagamento_historico (
         forma_pagamento_id,
         taxa_percentual,
         taxa_fixa,
         alterado_por_id
       ) VALUES (?, ?, ?, ?)`,
      [formaId, taxaPercentual, taxaFixa, context.user.sub]
    );

    const formas = await listarFormasPagamentoDaUnidade(context.unidadeId, { incluirInativas: true });
    const criada = formas.find((forma) => forma.id === formaId);
    return NextResponse.json(criada, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar forma de pagamento:', error);
    return NextResponse.json({ error: 'Erro ao criar forma de pagamento' }, { status: 500 });
  }
});
