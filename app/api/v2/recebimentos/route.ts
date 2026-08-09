import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import {
  calcularComissaoCentavos,
  optionalText,
  requireInteger,
  requirePositiveInteger,
  requireText,
  sumCentavos,
  V2DomainError,
} from '@/lib/v2/domain';
import type { CanalRecebimento, RecebimentoAlocacaoInput, RecebimentoFormaInput } from '@/lib/v2/types';
import {
  domainEventStatement,
  getIdempotencyKey,
  prepared,
  readJsonObject,
  requireClientInUnit,
  requireScopedEntity,
  uuid,
  withV2,
  type V2Context,
} from '../_shared';

interface ProcedureFinancial {
  id: string;
  cliente_id: number;
  origem: string;
  status_comercial: string;
  status_clinico: string;
  valor_final_centavos: number;
  valor_recebido_centavos: number;
  avaliador_id: number | null;
  comissao_avaliacao_bps: number;
  comissao_acrescimo_bps: number;
}

const CHANNELS = new Set<CanalRecebimento>(['presencial', 'remoto', 'link', 'importado']);

export const GET = withV2(['admin', 'atendente'], async (request: NextRequest, context: V2Context) => {
  const url = new URL(request.url);
  const clienteId = Number(url.searchParams.get('cliente_id') || 0);
  const conditions = ['r.unidade_id = ?'];
  const params: unknown[] = [context.unidadeId];
  if (clienteId > 0) {
    conditions.push('r.cliente_id = ?');
    params.push(clienteId);
  }
  const items = await query(
    `SELECT r.*, c.nome AS cliente_nome, u.nome AS recebido_por_nome,
      COALESCE((SELECT SUM(ra.valor_centavos - ra.valor_estornado_centavos) FROM recebimento_alocacoes ra WHERE ra.recebimento_id = r.id), 0) AS valor_alocado_centavos,
      (SELECT GROUP_CONCAT(fp.grupo || CASE WHEN fp.subgrupo <> '' THEN ' - ' || fp.subgrupo ELSE '' END, ', ')
       FROM recebimento_formas rf JOIN formas_pagamento fp ON fp.id = rf.forma_pagamento_id WHERE rf.recebimento_id = r.id) AS formas_resumo
     FROM recebimentos r
     JOIN clientes c ON c.id = r.cliente_id
     JOIN usuarios u ON u.id = r.recebido_por_id
     WHERE ${conditions.join(' AND ')} ORDER BY r.created_at DESC LIMIT 200`,
    params,
  );
  return NextResponse.json(items);
});

export const POST = withV2(['admin', 'atendente'], async (request: NextRequest, context: V2Context) => {
  const idempotencyKey = getIdempotencyKey(request)!;
  const existing = await queryOne('SELECT * FROM recebimentos WHERE unidade_id = ? AND idempotency_key = ?', [context.unidadeId, idempotencyKey]);
  if (existing) return NextResponse.json(existing);
  const body = await readJsonObject(request);
  const clienteId = requirePositiveInteger(body.cliente_id, 'cliente_id');
  await requireClientInUnit(clienteId, context.unidadeId);
  const canal = requireText(body.canal, 'canal', 20) as CanalRecebimento;
  if (!CHANNELS.has(canal)) throw new V2DomainError('Canal de recebimento inválido.');
  const atendimentoId = typeof body.atendimento_clinico_id === 'string' ? body.atendimento_clinico_id : null;
  if (atendimentoId) {
    const attendance = await requireScopedEntity<{ id: string; cliente_id: number }>('atendimentos_clinicos', atendimentoId, context.unidadeId);
    if (attendance.cliente_id !== clienteId) throw new V2DomainError('Atendimento pertence a outro paciente.', 409, 'atendimento_outro_paciente');
  }

  const rawForms = Array.isArray(body.formas) ? body.formas as unknown[] : [];
  const rawAllocations = Array.isArray(body.alocacoes) ? body.alocacoes as unknown[] : [];
  if (rawForms.length === 0) throw new V2DomainError('Informe ao menos uma forma de recebimento.');
  const forms: RecebimentoFormaInput[] = rawForms.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new V2DomainError(`Forma ${index + 1} inválida.`);
    const item = raw as Record<string, unknown>;
    return {
      forma_pagamento_id: requirePositiveInteger(item.forma_pagamento_id, `formas[${index}].forma_pagamento_id`),
      valor_centavos: requirePositiveInteger(item.valor_centavos, `formas[${index}].valor_centavos`),
      taxa_bps: item.taxa_bps === undefined ? 0 : requireInteger(item.taxa_bps, `formas[${index}].taxa_bps`),
      taxa_fixa_centavos: item.taxa_fixa_centavos === undefined ? 0 : requireInteger(item.taxa_fixa_centavos, `formas[${index}].taxa_fixa_centavos`),
      parcelas: item.parcelas === undefined ? 1 : requirePositiveInteger(item.parcelas, `formas[${index}].parcelas`),
      referencia_externa: optionalText(item.referencia_externa, `formas[${index}].referencia_externa`, 200),
    };
  });
  const allocations: RecebimentoAlocacaoInput[] = rawAllocations.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new V2DomainError(`Alocação ${index + 1} inválida.`);
    const item = raw as Record<string, unknown>;
    return {
      procedimento_cliente_id: requireText(item.procedimento_cliente_id, `alocacoes[${index}].procedimento_cliente_id`, 60),
      procedimento_cliente_etapa_id: typeof item.procedimento_cliente_etapa_id === 'string' ? item.procedimento_cliente_etapa_id : null,
      valor_centavos: requirePositiveInteger(item.valor_centavos, `alocacoes[${index}].valor_centavos`),
    };
  });
  const total = sumCentavos(forms.map((item) => item.valor_centavos));
  const allocatedTotal = sumCentavos(allocations.map((item) => item.valor_centavos));
  if (allocatedTotal > total) throw new V2DomainError('O total alocado não pode superar o total recebido.');

  const formIds = [...new Set(forms.map((item) => item.forma_pagamento_id))];
  const validForms = await query<{ id: number }>(
    `SELECT id FROM formas_pagamento WHERE unidade_id = ? AND ativo = 1 AND id IN (${formIds.map(() => '?').join(',')})`,
    [context.unidadeId, ...formIds],
  );
  if (validForms.length !== formIds.length) throw new V2DomainError('Há forma de pagamento inválida para esta unidade.', 403, 'forma_pagamento_invalida');

  const procIds = [...new Set(allocations.map((item) => item.procedimento_cliente_id))];
  const procedures = procIds.length > 0
    ? await query<ProcedureFinancial>(
        `SELECT p.id, p.cliente_id, p.origem, p.status_comercial, p.status_clinico,
          p.valor_final_centavos, op.valor_recebido_centavos, p.avaliador_id,
          p.comissao_avaliacao_bps, p.comissao_acrescimo_bps
         FROM procedimentos_cliente p JOIN v_procedimentos_cliente_operacional op ON op.id = p.id
         WHERE p.unidade_id = ? AND p.id IN (${procIds.map(() => '?').join(',')})`,
        [context.unidadeId, ...procIds],
      )
    : [];
  if (procedures.length !== procIds.length || procedures.some((item) => item.cliente_id !== clienteId)) {
    throw new V2DomainError('Há procedimento inválido ou de outro paciente/unidade.', 403, 'procedimento_fora_do_contexto');
  }
  const procedureMap = new Map(procedures.map((item) => [item.id, item]));
  const allocatedByProcedure = new Map<string, number>();
  for (const allocation of allocations) {
    const procedure = procedureMap.get(allocation.procedimento_cliente_id)!;
    if (procedure.status_comercial !== 'aceito') {
      throw new V2DomainError('Recebimentos só podem ser alocados a procedimentos aceitos.', 409, 'procedimento_nao_aceito');
    }
    if (allocation.procedimento_cliente_etapa_id) {
      const stage = await queryOne<{ id: string }>(
        'SELECT id FROM procedimento_cliente_etapas WHERE id = ? AND procedimento_cliente_id = ?',
        [allocation.procedimento_cliente_etapa_id, procedure.id],
      );
      if (!stage) throw new V2DomainError('Etapa não pertence ao procedimento informado.', 409, 'etapa_invalida');
    }
    allocatedByProcedure.set(procedure.id, (allocatedByProcedure.get(procedure.id) ?? 0) + allocation.valor_centavos);
  }
  for (const [procedureId, value] of allocatedByProcedure) {
    const procedure = procedureMap.get(procedureId)!;
    const saldo = procedure.valor_final_centavos - procedure.valor_recebido_centavos;
    if (value > saldo) throw new V2DomainError(`Alocação excede o saldo do procedimento ${procedureId}.`, 409, 'alocacao_excede_saldo');
  }

  const recebimentoId = uuid();
  const statements = [
    prepared(
      `INSERT INTO recebimentos (
        id, cliente_id, unidade_id, atendimento_clinico_id, recebido_por_id,
        canal, valor_total_centavos, observacoes, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recebimentoId, clienteId, context.unidadeId, atendimentoId, context.user.sub, canal, total, optionalText(body.observacoes, 'observacoes'), idempotencyKey],
    ),
    ...forms.map((form) => prepared(
      `INSERT INTO recebimento_formas (
        id, recebimento_id, forma_pagamento_id, valor_centavos, taxa_bps,
        taxa_fixa_centavos, parcelas, referencia_externa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(), recebimentoId, form.forma_pagamento_id, form.valor_centavos, form.taxa_bps ?? 0,
        form.taxa_fixa_centavos ?? 0, form.parcelas ?? 1, form.referencia_externa ?? null,
      ],
    )),
    prepared(
      `INSERT INTO cliente_saldo_movimentos (
        id, cliente_id, unidade_id, recebimento_id, tipo, valor_centavos, criado_por_id, motivo, idempotency_key
      ) VALUES (?, ?, ?, ?, 'credito', ?, ?, ?, ?)`,
      [uuid(), clienteId, context.unidadeId, recebimentoId, total, context.user.sub, 'Crédito gerado pelo recebimento', `credito:${idempotencyKey}`],
    ),
  ];

  for (const allocation of allocations) {
    const allocationId = uuid();
    const procedure = procedureMap.get(allocation.procedimento_cliente_id)!;
    statements.push(
      prepared(
        `INSERT INTO recebimento_alocacoes (
          id, recebimento_id, procedimento_cliente_id, procedimento_cliente_etapa_id, valor_centavos
        ) VALUES (?, ?, ?, ?, ?)`,
        [allocationId, recebimentoId, procedure.id, allocation.procedimento_cliente_etapa_id ?? null, allocation.valor_centavos],
      ),
      prepared(
        `INSERT INTO cliente_saldo_movimentos (
          id, cliente_id, unidade_id, recebimento_id, procedimento_cliente_id,
          tipo, valor_centavos, criado_por_id, motivo
        ) VALUES (?, ?, ?, ?, ?, 'alocacao', ?, ?, ?)`,
        [uuid(), clienteId, context.unidadeId, recebimentoId, procedure.id, -allocation.valor_centavos, context.user.sub, 'Crédito alocado ao procedimento'],
      ),
    );
    if (procedure.avaliador_id) {
      const commissionType = procedure.origem === 'acrescimo_execucao' ? 'acrescimo' : 'avaliacao';
      const rate = procedure.origem === 'acrescimo_execucao'
        ? procedure.comissao_acrescimo_bps
        : procedure.comissao_avaliacao_bps;
      const commissionValue = calcularComissaoCentavos(allocation.valor_centavos, rate);
      if (commissionValue > 0) {
        statements.push(prepared(
          `INSERT INTO comissoes_v2 (
            id, procedimento_cliente_id, recebimento_alocacao_id, unidade_id, usuario_id,
            tipo, evento, base_centavos, taxa_bps, valor_centavos, criado_por_id
          ) VALUES (?, ?, ?, ?, ?, ?, 'credito', ?, ?, ?, ?)`,
          [uuid(), procedure.id, allocationId, context.unidadeId, procedure.avaliador_id, commissionType, allocation.valor_centavos, rate, commissionValue, context.user.sub],
        ));
      }
    }
    const projected = procedure.valor_recebido_centavos + (allocatedByProcedure.get(procedure.id) ?? 0);
    if (projected >= procedure.valor_final_centavos) {
      statements.push(prepared(
        `UPDATE procedimento_cliente_followups
         SET status = 'concluido', concluido_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             concluido_por_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE procedimento_cliente_id = ? AND tipo = 'cobranca' AND status = 'aberto'`,
        [context.user.sub, procedure.id],
      ));
    }
  }
  statements.push(domainEventStatement({
    unidadeId: context.unidadeId,
    clienteId,
    entityType: 'recebimento',
    entityId: recebimentoId,
    eventType: 'recebimento_confirmado',
    actorId: context.user.sub,
    data: { canal, totalCentavos: total, alocadoCentavos: allocatedTotal, atendimentoId },
    idempotencyKey: `evento:${idempotencyKey}`,
  }));
  await getDb().batch(statements);
  return NextResponse.json({
    id: recebimentoId,
    cliente_id: clienteId,
    atendimento_clinico_id: atendimentoId,
    canal,
    valor_total_centavos: total,
    valor_alocado_centavos: allocatedTotal,
    saldo_credito_centavos: total - allocatedTotal,
    status: 'confirmado',
  }, { status: 201 });
});
