import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { clinicDateTimeInputToUtcIso } from '@/lib/time';
import {
  optionalPositiveInteger,
  optionalText,
  requireClinicDateTime,
  requirePositiveInteger,
  V2DomainError,
} from '@/lib/v2/domain';
import type { AgendaCompromissoItemInput } from '@/lib/v2/types';
import {
  domainEventStatement,
  getIdempotencyKey,
  prepared,
  readJsonObject,
  requireClientInUnit,
  requireProfessionalInUnit,
  uuid,
  withV2,
  type V2Context,
} from '../_shared';

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (request: NextRequest, context: V2Context) => {
    const url = new URL(request.url);
    const conditions = ['a.unidade_id = ?'];
    const params: unknown[] = [context.unidadeId];
    const dataInicio = url.searchParams.get('data_inicio');
    const dataFim = url.searchParams.get('data_fim');
    const status = url.searchParams.get('status');
    if (dataInicio) {
      conditions.push('a.data_agendada >= ?');
      params.push(clinicDateTimeInputToUtcIso(`${dataInicio}T00:00`) ?? dataInicio);
    }
    if (dataFim) {
      conditions.push('a.data_agendada <= ?');
      params.push(clinicDateTimeInputToUtcIso(`${dataFim}T23:59`) ?? dataFim);
    }
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    const items = await query(
      `SELECT a.*, c.nome AS cliente_nome,
        COUNT(DISTINCT ai.id) AS itens_count,
        GROUP_CONCAT(DISTINCT pc.nome_snapshot) AS procedimentos_resumo,
        GROUP_CONCAT(DISTINCT u.nome) AS profissionais_resumo,
        at.id AS atendimento_clinico_id
       FROM agenda_compromissos a
       JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN agenda_compromisso_itens ai ON ai.agenda_compromisso_id = a.id
       LEFT JOIN procedimentos_cliente pc ON pc.id = ai.procedimento_cliente_id
       LEFT JOIN usuarios u ON u.id = ai.profissional_id
       LEFT JOIN atendimentos_clinicos at ON at.agenda_compromisso_id = a.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.id ORDER BY a.data_agendada ASC LIMIT 200`,
      params,
    );
    return NextResponse.json(items);
  },
);

export const POST = withV2(
  ['admin', 'atendente', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const body = await readJsonObject(request);
    const idempotencyKey = getIdempotencyKey(request, false);
    if (idempotencyKey) {
      const existing = await queryOne('SELECT * FROM agenda_compromissos WHERE unidade_id = ? AND idempotency_key = ?', [context.unidadeId, idempotencyKey]);
      if (existing) return NextResponse.json(existing);
    }
    const clienteId = requirePositiveInteger(body.cliente_id, 'cliente_id');
    await requireClientInUnit(clienteId, context.unidadeId);
    const rawDate = requireClinicDateTime(body.data_agendada);
    const dataAgendada = /(?:Z|[+-]\d{2}:\d{2})$/.test(rawDate)
      ? new Date(rawDate).toISOString()
      : clinicDateTimeInputToUtcIso(rawDate);
    if (!dataAgendada) throw new V2DomainError('data_agendada é inválida.');

    const finalidadeAvaliacao = body.finalidade_avaliacao === true;
    const avaliadorId = optionalPositiveInteger(body.avaliador_id, 'avaliador_id');
    if (finalidadeAvaliacao && !avaliadorId) {
      throw new V2DomainError('avaliador_id é obrigatório em agendamentos de avaliação.');
    }
    if (avaliadorId) {
      await requireProfessionalInUnit(avaliadorId, context.unidadeId, ['avaliador']);
    }
    const rawItems = Array.isArray(body.itens) ? body.itens as unknown[] : [];
    if (!finalidadeAvaliacao && rawItems.length === 0) {
      throw new V2DomainError('Informe ao menos um procedimento ou marque a finalidade como avaliação.');
    }
    if (rawItems.length > 50) throw new V2DomainError('Um compromisso aceita no máximo 50 itens.');
    const itens: AgendaCompromissoItemInput[] = rawItems.map((raw, index) => {
      if (!raw || typeof raw !== 'object') throw new V2DomainError(`Item ${index + 1} inválido.`);
      const item = raw as Record<string, unknown>;
      return {
        procedimento_cliente_id: typeof item.procedimento_cliente_id === 'string' ? item.procedimento_cliente_id : '',
        procedimento_cliente_etapa_id: typeof item.procedimento_cliente_etapa_id === 'string' ? item.procedimento_cliente_etapa_id : null,
        profissional_id: optionalPositiveInteger(item.profissional_id, `itens[${index}].profissional_id`),
        observacoes: optionalText(item.observacoes, `itens[${index}].observacoes`, 500),
      };
    });
    if (itens.some((item) => !item.procedimento_cliente_id)) {
      throw new V2DomainError('Todos os itens devem informar procedimento_cliente_id.');
    }
    const ids = [...new Set(itens.map((item) => item.procedimento_cliente_id))];
    const procedures = ids.length > 0
      ? await query<{ id: string; cliente_id: number; status_comercial: string; status_clinico: string }>(
          `SELECT id, cliente_id, status_comercial, status_clinico FROM procedimentos_cliente
           WHERE unidade_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
          [context.unidadeId, ...ids],
        )
      : [];
    if (procedures.length !== ids.length || procedures.some((p) => p.cliente_id !== clienteId)) {
      throw new V2DomainError('Há procedimento inválido ou pertencente a outro paciente/unidade.', 403, 'procedimento_fora_do_contexto');
    }
    if (procedures.some((p) => p.status_comercial !== 'aceito' || ['concluido', 'cancelado'].includes(p.status_clinico))) {
      throw new V2DomainError('Só é possível agendar procedimentos aceitos e ainda não concluídos.', 409, 'procedimento_nao_agendavel');
    }
    for (const item of itens) {
      if (item.profissional_id) {
        await requireProfessionalInUnit(item.profissional_id, context.unidadeId, ['avaliador', 'executor', 'ortodontista']);
      }
      if (item.procedimento_cliente_etapa_id) {
        const etapa = await queryOne<{ id: string }>(
          'SELECT id FROM procedimento_cliente_etapas WHERE id = ? AND procedimento_cliente_id = ?',
          [item.procedimento_cliente_etapa_id, item.procedimento_cliente_id],
        );
        if (!etapa) throw new V2DomainError('Etapa não pertence ao procedimento informado.', 409, 'etapa_invalida');
      }
    }

    const agendaId = uuid();
    const statements = [
      prepared(
        `INSERT INTO agenda_compromissos (
          id, cliente_id, unidade_id, finalidade_avaliacao, avaliador_id, data_agendada,
          duracao_minutos, observacoes, criado_por_id, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          agendaId, clienteId, context.unidadeId, finalidadeAvaliacao ? 1 : 0, avaliadorId, dataAgendada,
          requirePositiveInteger(body.duracao_minutos ?? 60, 'duracao_minutos'),
          optionalText(body.observacoes, 'observacoes'), context.user.sub, idempotencyKey,
        ],
      ),
      ...itens.map((item) => prepared(
        `INSERT INTO agenda_compromisso_itens (
          id, agenda_compromisso_id, procedimento_cliente_id,
          procedimento_cliente_etapa_id, profissional_id, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid(), agendaId, item.procedimento_cliente_id, item.procedimento_cliente_etapa_id, item.profissional_id, item.observacoes],
      )),
      domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId,
        entityType: 'agenda_compromisso',
        entityId: agendaId,
        eventType: 'compromisso_agendado',
        actorId: context.user.sub,
        data: { dataAgendada, finalidadeAvaliacao, avaliadorId, procedimentos: ids },
        idempotencyKey: idempotencyKey ? `evento:${idempotencyKey}` : null,
      }),
    ];
    await getDb().batch(statements);
    return NextResponse.json({ id: agendaId, data_agendada: dataAgendada, status: 'agendado', itens: itens.length }, { status: 201 });
  },
);
