import { NextRequest, NextResponse } from 'next/server';
import { getDb, query, queryOne } from '@/lib/db';
import {
  assertProcedureCanBeEdited,
  calcularValorFinalCentavos,
  optionalPositiveInteger,
  optionalText,
  requireInteger,
  requirePositiveInteger,
  V2DomainError,
} from '@/lib/v2/domain';
import { domainEventStatement, nowIso, prepared, readJsonObject, requireProfessionalInUnit, requireScopedEntity, withV2, type V2Context } from '../../_shared';
import type { ProcedimentoClienteOperacional } from '@/lib/v2/types';

interface RouteParams { id: string }

async function paramsOf(context: V2Context): Promise<RouteParams> {
  return (await context.params) as unknown as RouteParams;
}

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (_request: NextRequest, context: V2Context) => {
    const { id } = await paramsOf(context);
    const procedimento = await requireScopedEntity<ProcedimentoClienteOperacional>(
      'procedimentos_cliente',
      id,
      context.unidadeId,
    );
    const operacional = await queryOne<ProcedimentoClienteOperacional>(
      'SELECT * FROM v_procedimentos_cliente_operacional WHERE id = ? AND unidade_id = ?',
      [id, context.unidadeId],
    );
    const [dentes, etapas, agenda, atendimentos, eventos] = await Promise.all([
      query('SELECT * FROM procedimento_cliente_dentes WHERE procedimento_cliente_id = ? ORDER BY dente', [id]),
      query('SELECT * FROM procedimento_cliente_etapas WHERE procedimento_cliente_id = ? ORDER BY ordem', [id]),
      query(
        `SELECT ac.*, aci.profissional_id, u.nome AS profissional_nome
         FROM agenda_compromisso_itens aci
         JOIN agenda_compromissos ac ON ac.id = aci.agenda_compromisso_id
         LEFT JOIN usuarios u ON u.id = aci.profissional_id
         WHERE aci.procedimento_cliente_id = ? ORDER BY ac.data_agendada DESC`,
        [id],
      ),
      query(
        `SELECT ap.*, ac.status AS atendimento_status, ac.created_at AS atendimento_created_at, u.nome AS executor_nome
         FROM atendimento_procedimentos ap
         JOIN atendimentos_clinicos ac ON ac.id = ap.atendimento_clinico_id
         LEFT JOIN usuarios u ON u.id = ap.executor_id
         WHERE ap.procedimento_cliente_id = ? ORDER BY ac.created_at DESC`,
        [id],
      ),
      query(
        `SELECT evento_tipo, autor_id, dados_json, created_at
         FROM eventos_dominio
         WHERE entidade_tipo = 'procedimento_cliente' AND entidade_id = ?
         ORDER BY created_at DESC LIMIT 100`,
        [id],
      ),
    ]);
    return NextResponse.json({ ...procedimento, ...operacional, dentes, etapas, agenda, atendimentos, eventos });
  },
);

export const PATCH = withV2(
  ['admin', 'atendente', 'avaliador'],
  async (request: NextRequest, context: V2Context) => {
    const { id } = await paramsOf(context);
    const current = await queryOne<ProcedimentoClienteOperacional>(
      'SELECT * FROM v_procedimentos_cliente_operacional WHERE id = ? AND unidade_id = ?',
      [id, context.unidadeId],
    );
    if (!current) return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    assertProcedureCanBeEdited(current.status_comercial, current.valor_recebido_centavos);

    const body = await readJsonObject(request);
    const quantidade = body.quantidade === undefined
      ? current.quantidade
      : requirePositiveInteger(body.quantidade, 'quantidade');
    const desconto = body.desconto_centavos === undefined
      ? current.desconto_centavos
      : requireInteger(body.desconto_centavos, 'desconto_centavos');
    const valorTabela = body.valor_tabela_centavos === undefined
      ? current.valor_tabela_centavos
      : requireInteger(body.valor_tabela_centavos, 'valor_tabela_centavos');
    const executorId = body.executor_preferencial_id === undefined
      ? current.executor_preferencial_id
      : optionalPositiveInteger(body.executor_preferencial_id, 'executor_preferencial_id');
    if (executorId) {
      await requireProfessionalInUnit(executorId, context.unidadeId, ['executor', 'ortodontista']);
    }
    const motivoDesconto = body.desconto_motivo === undefined
      ? current.desconto_motivo
      : optionalText(body.desconto_motivo, 'desconto_motivo', 500);
    if (desconto > 0 && !motivoDesconto) {
      throw new V2DomainError('desconto_motivo é obrigatório quando há desconto.');
    }
    const valorFinal = calcularValorFinalCentavos(valorTabela, desconto);
    const now = nowIso();

    await getDb().batch([
      prepared(
        `UPDATE procedimentos_cliente
         SET quantidade = ?, valor_tabela_centavos = ?, desconto_centavos = ?,
             valor_final_centavos = ?, desconto_motivo = ?, executor_preferencial_id = ?, updated_at = ?
         WHERE id = ? AND unidade_id = ?`,
        [quantidade, valorTabela, desconto, valorFinal, motivoDesconto, executorId, now, id, context.unidadeId],
      ),
      domainEventStatement({
        unidadeId: context.unidadeId,
        clienteId: current.cliente_id,
        entityType: 'procedimento_cliente',
        entityId: id,
        eventType: 'procedimento_editado',
        actorId: context.user.sub,
        data: { quantidade, valorTabela, desconto, valorFinal, executorId },
      }),
    ]);
    return NextResponse.json({ id, quantidade, valor_tabela_centavos: valorTabela, desconto_centavos: desconto, valor_final_centavos: valorFinal });
  },
);
