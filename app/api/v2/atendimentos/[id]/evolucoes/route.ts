import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { getUserRoles } from '@/lib/auth/middleware';
import { validarDentesProcedimento } from '@/lib/helpers/dentesProcedimento';
import {
  assertCanExecute,
  calcularComissaoCentavos,
  calcularValorFinalCentavos,
  optionalText,
  requireInteger,
  requirePositiveInteger,
  requireText,
  V2DomainError,
} from '@/lib/v2/domain';
import {
  domainEventStatement,
  getIdempotencyKey,
  nowIso,
  prepared,
  readJsonObject,
  requireScopedEntity,
  uuid,
  withV2,
  type V2Context,
} from '../../../_shared';

interface LinkedProcedure {
  atendimento_procedimento_id: string;
  procedimento_cliente_id: string;
  procedimento_cliente_etapa_id: string | null;
  executor_id: number | null;
  status_atendimento_procedimento: string;
  cliente_id: number;
  origem: string;
  status_comercial: string;
  status_clinico: string;
  status_financeiro: string;
  valor_final_centavos: number;
  comissao_execucao_bps: number;
  etapa_valor_centavos: number | null;
  etapa_comissao_execucao_bps: number | null;
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
  tem_face: number;
}

export const GET = withV2(
  ['admin', 'avaliador', 'executor', 'ortodontista'],
  async (_request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    await requireScopedEntity('atendimentos_clinicos', id, context.unidadeId);
    return NextResponse.json(await query(
      `SELECT e.*, u.nome AS profissional_nome,
        GROUP_CONCAT(pc.nome_snapshot, ', ') AS procedimentos_resumo
       FROM evolucoes_clinicas e
       JOIN usuarios u ON u.id = e.profissional_id
       LEFT JOIN evolucao_procedimentos ep ON ep.evolucao_id = e.id
       LEFT JOIN procedimentos_cliente pc ON pc.id = ep.procedimento_cliente_id
       WHERE e.atendimento_clinico_id = ? GROUP BY e.id ORDER BY e.created_at DESC`,
      [id],
    ));
  },
);

export const POST = withV2(
  ['admin', 'executor', 'ortodontista'],
  async (request: NextRequest, context: V2Context) => {
    const { id: atendimentoId } = (await context.params) as { id: string };
    const idempotencyKey = getIdempotencyKey(request)!;
    const existing = await queryOne('SELECT * FROM evolucoes_clinicas WHERE unidade_id = ? AND idempotency_key = ?', [context.unidadeId, idempotencyKey]);
    if (existing) return NextResponse.json(existing);
    const attendance = await requireScopedEntity<{ id: string; cliente_id: number; status: string }>('atendimentos_clinicos', atendimentoId, context.unidadeId);
    if (attendance.status !== 'em_andamento') {
      throw new V2DomainError('O atendimento precisa estar em andamento.', 409, 'atendimento_nao_iniciado');
    }
    const body = await readJsonObject(request);
    const text = requireText(body.texto, 'texto', 10_000);
    const linkedIds = Array.isArray(body.procedimento_ids)
      ? [...new Set(body.procedimento_ids.filter((value): value is string => typeof value === 'string' && value.length > 0))]
      : [];
    const startIds = new Set(Array.isArray(body.iniciar_procedimento_ids)
      ? body.iniciar_procedimento_ids.filter((value): value is string => typeof value === 'string')
      : []);
    const finishIds = new Set(Array.isArray(body.concluir_procedimento_ids)
      ? body.concluir_procedimento_ids.filter((value): value is string => typeof value === 'string')
      : []);
    const allExistingIds = [...new Set([...linkedIds, ...startIds, ...finishIds])];
    const procedures = allExistingIds.length > 0
      ? await query<LinkedProcedure>(
          `SELECT ap.id AS atendimento_procedimento_id,
            ap.procedimento_cliente_id, ap.procedimento_cliente_etapa_id, ap.executor_id,
            ap.status AS status_atendimento_procedimento,
            pc.cliente_id, pc.origem, pc.status_comercial, pc.status_clinico,
            op.status_financeiro, pc.valor_final_centavos, pc.comissao_execucao_bps,
            pe.valor_centavos AS etapa_valor_centavos,
            pe.comissao_execucao_bps AS etapa_comissao_execucao_bps
           FROM atendimento_procedimentos ap
           JOIN procedimentos_cliente pc ON pc.id = ap.procedimento_cliente_id
           JOIN v_procedimentos_cliente_operacional op ON op.id = pc.id
           LEFT JOIN procedimento_cliente_etapas pe ON pe.id = ap.procedimento_cliente_etapa_id
           WHERE ap.atendimento_clinico_id = ? AND pc.unidade_id = ?
             AND pc.id IN (${allExistingIds.map(() => '?').join(',')})`,
          [atendimentoId, context.unidadeId, ...allExistingIds],
        )
      : [];
    const foundIds = new Set(procedures.map((procedure) => procedure.procedimento_cliente_id));
    if (allExistingIds.some((id) => !foundIds.has(id))) {
      throw new V2DomainError('Há procedimento que não está vinculado a este atendimento.', 403, 'procedimento_fora_atendimento');
    }
    const isAdmin = getUserRoles(context.user).includes('admin');
    for (const procedure of procedures) {
      if (!isAdmin && procedure.executor_id !== null && procedure.executor_id !== context.user.sub) {
        throw new V2DomainError('Há procedimento atribuído a outro executor.', 403, 'executor_nao_responsavel');
      }
      if (startIds.has(procedure.procedimento_cliente_id) || finishIds.has(procedure.procedimento_cliente_id)) {
        const release = await queryOne<{ id: string }>(
          `SELECT id FROM liberacoes_execucao
           WHERE procedimento_cliente_id = ? AND atendimento_clinico_id = ? AND revogada_em IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [procedure.procedimento_cliente_id, atendimentoId],
        );
        assertCanExecute({
          statusComercial: procedure.status_comercial,
          statusFinanceiro: procedure.status_financeiro,
          hasAdminRelease: Boolean(release),
          origem: procedure.origem,
        });
      }
      if (finishIds.has(procedure.procedimento_cliente_id) && procedure.status_clinico === 'concluido') {
        throw new V2DomainError('Um dos procedimentos já está concluído.', 409, 'procedimento_ja_concluido');
      }
    }

    const rawExtras = Array.isArray(body.acrescimos) ? body.acrescimos as unknown[] : [];
    if (rawExtras.length > 20) throw new V2DomainError('Uma evolução aceita no máximo 20 acréscimos.');
    const catalogIds = rawExtras.map((raw, index) => {
      if (!raw || typeof raw !== 'object') throw new V2DomainError(`Acréscimo ${index + 1} inválido.`);
      return requirePositiveInteger((raw as Record<string, unknown>).procedimento_catalogo_id, `acrescimos[${index}].procedimento_catalogo_id`);
    });
    const uniqueCatalogIds = [...new Set(catalogIds)];
    const catalog = uniqueCatalogIds.length > 0
      ? await query<CatalogProcedure>(
          `SELECT id, nome, descricao, valor, comissao_venda, comissao_acrescimo,
            comissao_execucao, por_dente, tem_face
           FROM procedimentos WHERE ativo = 1 AND id IN (${uniqueCatalogIds.map(() => '?').join(',')})`,
          uniqueCatalogIds,
        )
      : [];
    if (catalog.length !== uniqueCatalogIds.length) throw new V2DomainError('Há acréscimo com procedimento de catálogo inválido.');
    const catalogMap = new Map(catalog.map((item) => [item.id, item]));
    const evolutionId = uuid();
    const now = nowIso();
    const statements = [
      prepared(
        `INSERT INTO evolucoes_clinicas (
          id, atendimento_clinico_id, cliente_id, unidade_id, profissional_id, texto, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [evolutionId, atendimentoId, attendance.cliente_id, context.unidadeId, context.user.sub, text, idempotencyKey],
      ),
    ];

    for (const procedure of procedures) {
      statements.push(prepared(
        `INSERT INTO evolucao_procedimentos (id, evolucao_id, procedimento_cliente_id, procedimento_cliente_etapa_id)
         VALUES (?, ?, ?, ?)`,
        [uuid(), evolutionId, procedure.procedimento_cliente_id, procedure.procedimento_cliente_etapa_id],
      ));
      if (startIds.has(procedure.procedimento_cliente_id)) {
        statements.push(
          prepared(
            "UPDATE atendimento_procedimentos SET status = 'em_execucao', iniciado_em = COALESCE(iniciado_em, ?), executor_id = COALESCE(executor_id, ?), updated_at = ? WHERE id = ?",
            [now, context.user.sub, now, procedure.atendimento_procedimento_id],
          ),
          prepared(
            "UPDATE procedimentos_cliente SET status_clinico = 'em_execucao', updated_at = ? WHERE id = ?",
            [now, procedure.procedimento_cliente_id],
          ),
        );
      }
      if (finishIds.has(procedure.procedimento_cliente_id)) {
        const executorId = procedure.executor_id ?? context.user.sub;
        const base = procedure.etapa_valor_centavos ?? procedure.valor_final_centavos;
        const rate = procedure.etapa_comissao_execucao_bps ?? procedure.comissao_execucao_bps;
        const commissionValue = calcularComissaoCentavos(base, rate);
        statements.push(
          prepared(
            "UPDATE atendimento_procedimentos SET status = 'realizado', iniciado_em = COALESCE(iniciado_em, ?), concluido_em = ?, executor_id = ?, updated_at = ? WHERE id = ?",
            [now, now, executorId, now, procedure.atendimento_procedimento_id],
          ),
          prepared(
            `UPDATE procedimentos_cliente SET status_clinico =
              CASE WHEN EXISTS (
                SELECT 1 FROM procedimento_cliente_etapas pe
                WHERE pe.procedimento_cliente_id = procedimentos_cliente.id
                  AND pe.id <> COALESCE(?, '') AND pe.status_clinico NOT IN ('concluida', 'cancelada')
              ) THEN 'em_execucao' ELSE 'concluido' END,
              concluido_em = CASE WHEN NOT EXISTS (
                SELECT 1 FROM procedimento_cliente_etapas pe
                WHERE pe.procedimento_cliente_id = procedimentos_cliente.id
                  AND pe.id <> COALESCE(?, '') AND pe.status_clinico NOT IN ('concluida', 'cancelada')
              ) THEN ? ELSE concluido_em END,
              updated_at = ? WHERE id = ?`,
            [procedure.procedimento_cliente_etapa_id, procedure.procedimento_cliente_etapa_id, now, now, procedure.procedimento_cliente_id],
          ),
        );
        if (procedure.procedimento_cliente_etapa_id) {
          statements.push(prepared(
            "UPDATE procedimento_cliente_etapas SET status_clinico = 'concluida', iniciado_em = COALESCE(iniciado_em, ?), concluido_em = ?, executor_id = ?, updated_at = ? WHERE id = ?",
            [now, now, executorId, now, procedure.procedimento_cliente_etapa_id],
          ));
        }
        if (commissionValue > 0) {
          statements.push(prepared(
            `INSERT INTO comissoes_v2 (
              id, procedimento_cliente_id, atendimento_procedimento_id, unidade_id,
              usuario_id, tipo, evento, base_centavos, taxa_bps, valor_centavos, criado_por_id
            ) VALUES (?, ?, ?, ?, ?, 'execucao', 'credito', ?, ?, ?, ?)`,
            [uuid(), procedure.procedimento_cliente_id, procedure.atendimento_procedimento_id, context.unidadeId, executorId, base, rate, commissionValue, context.user.sub],
          ));
        }
      }
    }

    const extrasCreated: string[] = [];
    for (let index = 0; index < rawExtras.length; index += 1) {
      const raw = rawExtras[index] as Record<string, unknown>;
      const definition = catalogMap.get(catalogIds[index])!;
      const aceiteObservacao = requireText(raw.aceite_observacao, `acrescimos[${index}].aceite_observacao`, 1_000);
      let quantidade = raw.quantidade === undefined ? 1 : requirePositiveInteger(raw.quantidade, `acrescimos[${index}].quantidade`);
      let teeth: Array<{ dente: string; faces: string[] }> = [];
      if (definition.por_dente === 1) {
        const validated = validarDentesProcedimento(raw.dentes, { exigirFaces: definition.tem_face === 1 });
        if (!validated.ok) throw new V2DomainError(`${definition.nome}: ${validated.error}`);
        teeth = validated.dentes;
        quantidade = teeth.length;
      }
      const valorTabela = raw.valor_tabela_centavos === undefined
        ? Math.round(Number(definition.valor) * 100) * quantidade
        : requireInteger(raw.valor_tabela_centavos, `acrescimos[${index}].valor_tabela_centavos`);
      const desconto = raw.desconto_centavos === undefined ? 0 : requireInteger(raw.desconto_centavos, `acrescimos[${index}].desconto_centavos`);
      const descontoMotivo = optionalText(raw.desconto_motivo, `acrescimos[${index}].desconto_motivo`, 500);
      if (desconto > 0 && !descontoMotivo) {
        throw new V2DomainError(`Informe o motivo do desconto em ${definition.nome}.`);
      }
      const valorFinal = calcularValorFinalCentavos(valorTabela, desconto);
      const extraId = uuid();
      const attendanceProcedureId = uuid();
      extrasCreated.push(extraId);
      statements.push(
        prepared(
          `INSERT INTO procedimentos_cliente (
            id, cliente_id, unidade_id, procedimento_catalogo_id, atendimento_origem_id,
            origem, criado_por_id, avaliador_id, executor_preferencial_id,
            nome_snapshot, descricao_snapshot, quantidade, valor_tabela_centavos,
            desconto_centavos, valor_final_centavos, desconto_motivo,
            comissao_avaliacao_bps, comissao_acrescimo_bps, comissao_execucao_bps,
            status_comercial, status_clinico, aceite_tipo, aceite_observacao,
            aceito_por_id, aceito_em, concluido_em
          ) VALUES (?, ?, ?, ?, ?, 'acrescimo_execucao', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'aceito', 'concluido', 'verbal_execucao', ?, ?, ?, ?)`,
          [
            extraId, attendance.cliente_id, context.unidadeId, definition.id, atendimentoId,
            context.user.sub, context.user.sub, context.user.sub, definition.nome, definition.descricao,
            quantidade, valorTabela, desconto, valorFinal, descontoMotivo,
            Math.round(Number(definition.comissao_venda) * 100), Math.round(Number(definition.comissao_acrescimo) * 100),
            Math.round(Number(definition.comissao_execucao) * 100), aceiteObservacao, context.user.sub, now, now,
          ],
        ),
        prepared(
          `INSERT INTO atendimento_procedimentos (
            id, atendimento_clinico_id, procedimento_cliente_id, executor_id,
            status, iniciado_em, concluido_em, observacoes
          ) VALUES (?, ?, ?, ?, 'realizado', ?, ?, ?)`,
          [attendanceProcedureId, atendimentoId, extraId, context.user.sub, now, now, aceiteObservacao],
        ),
        prepared(
          'INSERT INTO evolucao_procedimentos (id, evolucao_id, procedimento_cliente_id) VALUES (?, ?, ?)',
          [uuid(), evolutionId, extraId],
        ),
        prepared(
          `INSERT INTO procedimento_cliente_followups (
            id, procedimento_cliente_id, cliente_id, unidade_id, tipo,
            criado_por_id, descricao
          ) VALUES (?, ?, ?, ?, 'cobranca', ?, ?)`,
          [uuid(), extraId, attendance.cliente_id, context.unidadeId, context.user.sub, 'Acréscimo executado com saldo em aberto'],
        ),
      );
      for (const tooth of teeth) {
        statements.push(prepared(
          'INSERT INTO procedimento_cliente_dentes (id, procedimento_cliente_id, dente, faces_json) VALUES (?, ?, ?, ?)',
          [uuid(), extraId, tooth.dente, JSON.stringify(tooth.faces)],
        ));
      }
      const executionCommission = calcularComissaoCentavos(valorFinal, Math.round(Number(definition.comissao_execucao) * 100));
      if (executionCommission > 0) {
        statements.push(prepared(
          `INSERT INTO comissoes_v2 (
            id, procedimento_cliente_id, atendimento_procedimento_id, unidade_id,
            usuario_id, tipo, evento, base_centavos, taxa_bps, valor_centavos, criado_por_id
          ) VALUES (?, ?, ?, ?, ?, 'execucao', 'credito', ?, ?, ?, ?)`,
          [
            uuid(), extraId, attendanceProcedureId, context.unidadeId, context.user.sub,
            valorFinal, Math.round(Number(definition.comissao_execucao) * 100), executionCommission, context.user.sub,
          ],
        ));
      }
      statements.push(domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId: attendance.cliente_id,
        entityType: 'procedimento_cliente',
        entityId: extraId,
        eventType: 'acrescimo_executado_com_aceite_verbal',
        actorId: context.user.sub,
        data: { atendimentoId, aceiteObservacao, valorFinal },
      }));
    }

    statements.push(domainEventStatement({
      unidadeId: context.unidadeId,
      clienteId: attendance.cliente_id,
      entityType: 'evolucao_clinica',
      entityId: evolutionId,
      eventType: 'evolucao_registrada',
      actorId: context.user.sub,
      data: { atendimentoId, procedimentos: allExistingIds, acrescimos: extrasCreated },
      idempotencyKey: `evento:${idempotencyKey}`,
    }));
    await getDb().batch(statements);
    return NextResponse.json({ id: evolutionId, procedimentos: allExistingIds, acrescimos: extrasCreated }, { status: 201 });
  },
);
