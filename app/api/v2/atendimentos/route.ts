import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import { optionalPositiveInteger, optionalText, requirePositiveInteger } from '@/lib/v2/domain';
import {
  domainEventStatement,
  getIdempotencyKey,
  nowIso,
  prepared,
  readJsonObject,
  requireClientInUnit,
  requireScopedEntity,
  uuid,
  withV2,
  type V2Context,
} from '../_shared';

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (request: NextRequest, context: V2Context) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const clienteId = Number(url.searchParams.get('cliente_id') || 0);
    const conditions = ['a.unidade_id = ?'];
    const params: unknown[] = [context.unidadeId];
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (clienteId > 0) {
      conditions.push('a.cliente_id = ?');
      params.push(clienteId);
    }
    const items = await query(
      `SELECT a.*, c.nome AS cliente_nome,
        av.id AS avaliacao_id, av.status AS avaliacao_status, u.nome AS avaliador_nome,
        COUNT(DISTINCT ap.id) AS procedimentos_count
       FROM atendimentos_clinicos a
       JOIN clientes c ON c.id = a.cliente_id
       LEFT JOIN avaliacoes av ON av.atendimento_clinico_id = a.id
       LEFT JOIN usuarios u ON u.id = av.avaliador_id
       LEFT JOIN atendimento_procedimentos ap ON ap.atendimento_clinico_id = a.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.id
       ORDER BY a.created_at DESC LIMIT 100`,
      params,
    );
    return NextResponse.json(items);
  },
);

export const POST = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (request: NextRequest, context: V2Context) => {
    const body = await readJsonObject(request);
    const idempotencyKey = getIdempotencyKey(request);
    const existing = await queryOne('SELECT * FROM atendimentos_clinicos WHERE unidade_id = ? AND idempotency_key = ?', [context.unidadeId, idempotencyKey]);
    if (existing) return NextResponse.json(existing);

    const clienteId = requirePositiveInteger(body.cliente_id, 'cliente_id');
    await requireClientInUnit(clienteId, context.unidadeId);
    const agendaId = typeof body.agenda_compromisso_id === 'string' ? body.agenda_compromisso_id : null;
    if (agendaId) {
      const agenda = await requireScopedEntity<{ id: string; cliente_id: number }>('agenda_compromissos', agendaId, context.unidadeId);
      if (agenda.cliente_id !== clienteId) {
        return NextResponse.json({ error: 'Agendamento pertence a outro paciente' }, { status: 409 });
      }
    }
    const categoriaId = optionalPositiveInteger(body.categoria_id, 'categoria_id');
    const iniciar = body.iniciar === true;
    const id = uuid();
    const now = nowIso();
    await getDb().batch([
      prepared(
        `INSERT INTO atendimentos_clinicos (
          id, cliente_id, unidade_id, agenda_compromisso_id, categoria_id, status,
          criado_por_id, checkin_em, iniciado_em, observacoes, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, clienteId, context.unidadeId, agendaId, categoriaId,
          iniciar ? 'em_andamento' : 'aguardando', context.user.sub, now,
          iniciar ? now : null, optionalText(body.observacoes, 'observacoes'), idempotencyKey,
        ],
      ),
      domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId,
        entityType: 'atendimento_clinico',
        entityId: id,
        eventType: iniciar ? 'atendimento_iniciado' : 'atendimento_criado',
        actorId: context.user.sub,
        idempotencyKey: `evento:${idempotencyKey}`,
      }),
    ]);
    return NextResponse.json({ id, cliente_id: clienteId, status: iniciar ? 'em_andamento' : 'aguardando' }, { status: 201 });
  },
);
