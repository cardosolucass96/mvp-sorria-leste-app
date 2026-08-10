import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/middleware';
import { validarDentesProcedimento } from '@/lib/helpers/dentesProcedimento';
import {
  calcularValorFinalCentavos,
  optionalPositiveInteger,
  optionalText,
  requireInteger,
  requirePositiveInteger,
  V2DomainError,
} from '@/lib/v2/domain';
import type { ProcedimentoClienteInput } from '@/lib/v2/types';
import { domainEventStatement, prepared, readJsonObject, requireProfessionalInUnit, uuid, withV2, type V2Context } from '../../../_shared';

interface EvaluationBudget {
  avaliacao_id: string;
  atendimento_clinico_id: string;
  cliente_id: number;
  unidade_id: number;
  avaliador_id: number;
  avaliacao_status: string;
  orcamento_id: string;
  orcamento_status: string;
}

interface CatalogProcedure {
  id: number;
  nome: string;
  descricao: string | null;
  valor: number;
  comissao_venda: number;
  comissao_acrescimo: number;
  comissao_execucao: number;
  por_dente: number;
  tem_etapas: number;
  tem_face: number;
}

interface StageModel {
  id: number;
  procedimento_id: number;
  nome: string;
  valor: number | null;
  comissao_venda: number;
  comissao_acrescimo: number;
  comissao_execucao: number;
  ordem: number;
}

async function getEvaluationBudget(id: string, unidadeId: number): Promise<EvaluationBudget> {
  const evaluation = await queryOne<EvaluationBudget>(
    `SELECT av.id AS avaliacao_id, av.atendimento_clinico_id, av.cliente_id, av.unidade_id,
      av.avaliador_id, av.status AS avaliacao_status,
      o.id AS orcamento_id, o.status AS orcamento_status
     FROM avaliacoes av JOIN orcamentos o ON o.avaliacao_id = av.id
     WHERE av.id = ? AND av.unidade_id = ?`,
    [id, unidadeId],
  );
  if (!evaluation) throw new V2DomainError('Avaliação não encontrada.', 404, 'avaliacao_nao_encontrada');
  return evaluation;
}

export const GET = withV2(
  ['admin', 'atendente', 'avaliador'],
  async (_request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const evaluation = await getEvaluationBudget(id, context.unidadeId);
    const [budget, procedures] = await Promise.all([
      queryOne<Record<string, unknown>>('SELECT * FROM orcamentos WHERE id = ?', [evaluation.orcamento_id]),
      query(
        'SELECT * FROM v_procedimentos_cliente_operacional WHERE orcamento_id = ? ORDER BY created_at',
        [evaluation.orcamento_id],
      ),
    ]);
    return NextResponse.json({ ...(budget ?? {}), procedimentos: procedures });
  },
);

export const POST = withV2(
  ['admin', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const evaluation = await getEvaluationBudget(id, context.unidadeId);
    const isAdmin = getUserRoles(context.user).includes('admin');
    if (!isAdmin && evaluation.avaliador_id !== context.user.sub) {
      throw new V2DomainError('Somente o avaliador responsável pode editar este orçamento.', 403, 'avaliador_nao_responsavel');
    }
    if (evaluation.avaliacao_status !== 'em_andamento' || !['rascunho', 'apresentado'].includes(evaluation.orcamento_status)) {
      throw new V2DomainError('A avaliação ou o orçamento não aceita novos procedimentos.', 409, 'orcamento_bloqueado');
    }

    const body = await readJsonObject(request);
    const rawItems = Array.isArray(body.procedimentos) ? body.procedimentos as unknown[] : [];
    if (rawItems.length === 0 || rawItems.length > 50) {
      throw new V2DomainError('Informe entre 1 e 50 procedimentos.');
    }
    const inputs: ProcedimentoClienteInput[] = rawItems.map((raw, index) => {
      if (!raw || typeof raw !== 'object') throw new V2DomainError(`Procedimento ${index + 1} inválido.`);
      const item = raw as Record<string, unknown>;
      return {
        procedimento_catalogo_id: requirePositiveInteger(item.procedimento_catalogo_id, `procedimentos[${index}].procedimento_catalogo_id`),
        quantidade: item.quantidade === undefined ? 1 : requirePositiveInteger(item.quantidade, `procedimentos[${index}].quantidade`),
        desconto_centavos: item.desconto_centavos === undefined ? 0 : requireInteger(item.desconto_centavos, `procedimentos[${index}].desconto_centavos`),
        desconto_motivo: optionalText(item.desconto_motivo, `procedimentos[${index}].desconto_motivo`, 500),
        executor_preferencial_id: optionalPositiveInteger(item.executor_preferencial_id, `procedimentos[${index}].executor_preferencial_id`),
        dentes: Array.isArray(item.dentes) ? item.dentes as Array<{ dente: string; faces?: string[] }> : undefined,
      };
    });
    const catalogIds = [...new Set(inputs.map((item) => item.procedimento_catalogo_id))];
    const catalog = await query<CatalogProcedure>(
      `SELECT id, nome, descricao, valor, comissao_venda, comissao_acrescimo,
        comissao_execucao, por_dente, tem_etapas, tem_face
       FROM procedimentos WHERE ativo = 1 AND id IN (${catalogIds.map(() => '?').join(',')})`,
      catalogIds,
    );
    if (catalog.length !== catalogIds.length) {
      throw new V2DomainError('Há procedimento de catálogo inexistente ou inativo.', 409, 'catalogo_invalido');
    }
    const catalogMap = new Map(catalog.map((item) => [item.id, item]));
    const stageModels = await query<StageModel>(
      `SELECT * FROM procedimento_etapas_modelo
       WHERE procedimento_id IN (${catalogIds.map(() => '?').join(',')}) ORDER BY procedimento_id, ordem`,
      catalogIds,
    );
    const statements = [];
    const created: Array<{ id: string; nome: string; valor_final_centavos: number }> = [];

    for (const input of inputs) {
      const definition = catalogMap.get(input.procedimento_catalogo_id)!;
      if (input.executor_preferencial_id) {
        await requireProfessionalInUnit(input.executor_preferencial_id, context.unidadeId, ['executor', 'ortodontista']);
      }
      let quantidade = input.quantidade ?? 1;
      let teeth: Array<{ dente: string; faces: string[] }> = [];
      if (definition.por_dente === 1) {
        const validated = validarDentesProcedimento(input.dentes, { exigirFaces: definition.tem_face === 1 });
        if (!validated.ok) throw new V2DomainError(`${definition.nome}: ${validated.error}`);
        teeth = validated.dentes;
        quantidade = teeth.length;
      }
      const valorTabela = Math.round(Number(definition.valor) * 100) * quantidade;
      const desconto = input.desconto_centavos ?? 0;
      if (desconto > 0 && !input.desconto_motivo) {
        throw new V2DomainError(`Informe o motivo do desconto em ${definition.nome}.`);
      }
      const valorFinal = calcularValorFinalCentavos(valorTabela, desconto);
      const procedureId = uuid();
      statements.push(prepared(
        `INSERT INTO procedimentos_cliente (
          id, cliente_id, unidade_id, orcamento_id, avaliacao_id, procedimento_catalogo_id,
          origem, criado_por_id, avaliador_id, executor_preferencial_id,
          nome_snapshot, descricao_snapshot, quantidade, valor_tabela_centavos,
          desconto_centavos, valor_final_centavos, desconto_motivo,
          comissao_avaliacao_bps, comissao_acrescimo_bps, comissao_execucao_bps
        ) VALUES (?, ?, ?, ?, ?, ?, 'avaliacao', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          procedureId, evaluation.cliente_id, context.unidadeId, evaluation.orcamento_id, id,
          definition.id, context.user.sub, evaluation.avaliador_id, input.executor_preferencial_id ?? null,
          definition.nome, definition.descricao, quantidade, valorTabela, desconto, valorFinal,
          input.desconto_motivo ?? null, Math.round(Number(definition.comissao_venda) * 100),
          Math.round(Number(definition.comissao_acrescimo) * 100), Math.round(Number(definition.comissao_execucao) * 100),
        ],
      ));
      for (const tooth of teeth) {
        statements.push(prepared(
          'INSERT INTO procedimento_cliente_dentes (id, procedimento_cliente_id, dente, faces_json) VALUES (?, ?, ?, ?)',
          [uuid(), procedureId, tooth.dente, JSON.stringify(tooth.faces)],
        ));
      }
      const models = stageModels.filter((stage) => stage.procedimento_id === definition.id);
      models.forEach((stage, index) => {
        const fallback = models.length > 0
          ? Math.floor(valorFinal / models.length) + (index < valorFinal % models.length ? 1 : 0)
          : valorFinal;
        const stageValue = stage.valor === null ? fallback : Math.round(Number(stage.valor) * 100);
        statements.push(prepared(
          `INSERT INTO procedimento_cliente_etapas (
            id, procedimento_cliente_id, etapa_modelo_id, nome_snapshot, ordem, valor_centavos,
            comissao_avaliacao_bps, comissao_acrescimo_bps, comissao_execucao_bps
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(), procedureId, stage.id, stage.nome, stage.ordem, stageValue,
            Math.round(Number(stage.comissao_venda) * 100), Math.round(Number(stage.comissao_acrescimo) * 100),
            Math.round(Number(stage.comissao_execucao) * 100),
          ],
        ));
      });
      statements.push(domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId: evaluation.cliente_id,
        entityType: 'procedimento_cliente',
        entityId: procedureId,
        eventType: 'procedimento_proposto',
        actorId: context.user.sub,
        data: { orcamentoId: evaluation.orcamento_id, catalogoId: definition.id, valorFinal },
      }));
      created.push({ id: procedureId, nome: definition.nome, valor_final_centavos: valorFinal });
    }

    await getDb().batch(statements);
    return NextResponse.json({ orcamento_id: evaluation.orcamento_id, procedimentos: created }, { status: 201 });
  },
);
