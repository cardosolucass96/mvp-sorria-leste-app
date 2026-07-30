import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { batch, query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext, userHasAnyRole } from '@/lib/auth/middleware';
import { garantirProntuarioEvolucoesSchema } from '@/lib/helpers/garantirProntuarioEvolucoesSchema';
import { garantirSchemaComissoesOrigem, garantirSchemaProcedimentosComissaoAcrescimo } from '@/lib/helpers/garantirComissaoSchema';
import { nowUtcIso } from '@/lib/time';

const MIN_CARACTERES = 10;

interface ItemElegivelRow {
  id: number;
  atendimento_id: number;
  atendimento_status: string;
  unidade_id: number;
  executor_id: number | null;
  status: string;
  tem_etapas: number;
  evolucao_id: number | null;
  possui_agendamento_ativo: number;
}

interface AtendimentoStatusRow {
  id: number;
  status: string;
}

function normalizarIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

// POST /api/execucao/evolucoes - Cria evolução clínica e conclui itens em lote.
export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    await garantirProntuarioEvolucoesSchema();
    await garantirSchemaProcedimentosComissaoAcrescimo();
    await garantirSchemaComissoesOrigem();

    const body = await request.json();
    const itemIds = normalizarIds(body.item_ids);
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
    const observacoes = typeof body.observacoes === 'string' ? body.observacoes.trim() : '';

    if (itemIds.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos um procedimento' }, { status: 400 });
    }

    if (descricao.length < MIN_CARACTERES) {
      return NextResponse.json(
        { error: `A descrição da evolução deve ter no mínimo ${MIN_CARACTERES} caracteres` },
        { status: 400 }
      );
    }

    const idsSql = placeholders(itemIds.length);
    const itens = await query<ItemElegivelRow>(
      `SELECT
         i.id,
         i.atendimento_id,
         a.status as atendimento_status,
         a.unidade_id,
         i.executor_id,
         i.status,
         p.tem_etapas,
         pei.evolucao_id,
         CASE WHEN EXISTS (
           SELECT 1
           FROM agendamentos ag
           WHERE ag.item_atendimento_origem_id = i.id
             AND ag.unidade_id = a.unidade_id
             AND ag.status IN ('pendente', 'agendado')
         ) THEN 1 ELSE 0 END as possui_agendamento_ativo
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON a.id = i.atendimento_id
       INNER JOIN procedimentos p ON p.id = i.procedimento_id
       LEFT JOIN prontuario_evolucao_itens pei ON pei.item_atendimento_id = i.id
       WHERE i.id IN (${idsSql})`,
      itemIds
    );

    if (itens.length !== itemIds.length) {
      return NextResponse.json({ error: 'Um ou mais procedimentos não foram encontrados' }, { status: 404 });
    }

    const atendimentoIds = new Set(itens.map((item) => item.atendimento_id));
    if (atendimentoIds.size !== 1) {
      return NextResponse.json({ error: 'Todos os procedimentos devem pertencer ao mesmo atendimento' }, { status: 400 });
    }

    const atendimentoId = itens[0].atendimento_id;
    if (itens.some((item) => item.unidade_id !== context.unidadeId)) {
      return NextResponse.json({ error: 'Procedimento não pertence a esta unidade' }, { status: 403 });
    }

    if (itens.some((item) => item.atendimento_status !== 'em_execucao')) {
      return NextResponse.json({ error: 'O atendimento precisa estar em execução' }, { status: 400 });
    }

    if (itens.some((item) => item.executor_id === null)) {
      return NextResponse.json(
        { error: 'Todos os procedimentos precisam ter um executor definido' },
        { status: 400 }
      );
    }

    const executorIds = new Set(itens.map((item) => item.executor_id));
    if (executorIds.size !== 1) {
      return NextResponse.json(
        { error: 'Uma evolução só pode reunir procedimentos do mesmo executor' },
        { status: 400 }
      );
    }

    const executorId = itens[0].executor_id as number;
    const podeRegistrarEmNomeDoExecutor = userHasAnyRole(context.user, ['admin', 'atendente']);
    const executorResponsavelLogado = executorId === context.user.sub
      && userHasAnyRole(context.user, ['executor', 'ortodontista']);

    if (!podeRegistrarEmNomeDoExecutor && !executorResponsavelLogado) {
      return NextResponse.json(
        { error: 'Apenas o executor responsável, um administrador ou um atendente pode concluir estes procedimentos' },
        { status: 403 }
      );
    }

    if (itens.some((item) => item.status === 'concluido' || item.evolucao_id !== null)) {
      return NextResponse.json(
        { error: 'Um ou mais procedimentos já foram concluídos ou vinculados a uma evolução' },
        { status: 409 }
      );
    }

    if (itens.some((item) => !['pago', 'executando'].includes(item.status))) {
      return NextResponse.json(
        { error: 'Só é possível concluir procedimentos pagos ou em execução' },
        { status: 400 }
      );
    }

    if (itens.some((item) => Number(item.possui_agendamento_ativo) === 1)) {
      return NextResponse.json(
        { error: 'Um ou mais procedimentos possuem agendamento futuro ativo' },
        { status: 400 }
      );
    }

    const uuid = randomUUID();
    const now = nowUtcIso();
    const updateIdsSql = placeholders(itemIds.length);
    const statements = [
      {
        sql: `INSERT INTO prontuario_evolucoes
                (uuid, atendimento_id, usuario_id, descricao, observacoes, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [uuid, atendimentoId, context.user.sub, descricao, observacoes || null, now, now],
      },
      ...itemIds.map((itemId) => ({
        sql: `INSERT INTO prontuario_evolucao_itens (evolucao_id, item_atendimento_id, created_at)
              SELECT id, ?, ? FROM prontuario_evolucoes WHERE uuid = ?`,
        params: [itemId, now, uuid],
      })),
      {
        sql: `UPDATE itens_atendimento
              SET status = 'concluido', concluido_at = ?
              WHERE id IN (${updateIdsSql})`,
        params: [now, ...itemIds],
      },
      ...itemIds.map((itemId) => ({
        sql: `INSERT INTO comissoes
                (atendimento_id, item_atendimento_id, usuario_id, tipo, origem, percentual, valor_base, valor_comissao, created_at)
              SELECT
                ia.atendimento_id,
                ia.id,
                ia.executor_id,
                'execucao',
                'execucao',
                p.comissao_execucao,
                ia.valor,
                ROUND(ia.valor * (p.comissao_execucao / 100), 2),
                ?
              FROM itens_atendimento ia
              INNER JOIN procedimentos p ON p.id = ia.procedimento_id
              WHERE ia.id = ?
                AND ia.executor_id IS NOT NULL
                AND p.comissao_execucao > 0
                AND NOT EXISTS (
                  SELECT 1 FROM comissoes c
                  WHERE c.item_atendimento_id = ia.id AND c.tipo = 'execucao'
                )`,
        params: [now, itemId],
      })),
      {
        sql: `UPDATE atendimentos
              SET status = 'aguardando_pagamento',
                  liberado_por_id = NULL,
                  liberado_em = NULL
              WHERE id = ?
                AND status = 'em_execucao'
                AND NOT EXISTS (
                  SELECT 1 FROM itens_atendimento
                  WHERE atendimento_id = ? AND status != 'concluido'
                )
                AND EXISTS (
                  SELECT 1 FROM itens_atendimento
                  WHERE atendimento_id = ?
                    AND adicionado_em_execucao = 1
                    AND COALESCE(valor_pago, 0) + 0.001 < COALESCE(valor_final, valor)
                )`,
        params: [atendimentoId, atendimentoId, atendimentoId],
      },
      {
        sql: `UPDATE atendimentos
              SET status = 'finalizado', finalizado_at = ?
              WHERE id = ?
                AND status = 'em_execucao'
                AND NOT EXISTS (
                  SELECT 1 FROM itens_atendimento
                  WHERE atendimento_id = ? AND status != 'concluido'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM itens_atendimento
                  WHERE atendimento_id = ?
                    AND adicionado_em_execucao = 1
                    AND COALESCE(valor_pago, 0) + 0.001 < COALESCE(valor_final, valor)
                )`,
        params: [now, atendimentoId, atendimentoId, atendimentoId],
      },
    ];

    await batch(statements);

    const [atendimentoAtualizado] = await query<AtendimentoStatusRow>(
      'SELECT id, status FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    return NextResponse.json({
      success: true,
      evolucao_uuid: uuid,
      atendimento_id: atendimentoId,
      item_ids: itemIds,
      executor_id: executorId,
      registrado_por_id: context.user.sub,
      atendimento_finalizado: atendimentoAtualizado?.status === 'finalizado',
      atendimento_voltou_para_pagamento: atendimentoAtualizado?.status === 'aguardando_pagamento',
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return NextResponse.json(
        { error: 'Um ou mais procedimentos já estão vinculados a uma evolução' },
        { status: 409 }
      );
    }

    console.error('Erro ao criar evolução clínica:', error);
    return NextResponse.json(
      { error: 'Erro ao criar evolução clínica' },
      { status: 500 }
    );
  }
});
