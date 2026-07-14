import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { buscarEtapasComValor, roundMoney, somarAlocacoesAtivasDaEtapa } from '@/lib/helpers/pagamentoFlow';
import { resolverExecutorDestinoId } from '@/lib/utils/destinoExecutor';
import { clinicDateTimeInputToUtcIso, nowUtcIso } from '@/lib/time';

type DestinoStatus = 'fazer_hoje' | 'agendar' | 'pago_sem_data' | 'nao_pago_sem_data';
type AcaoFinal = 'liberar_execucao' | 'finalizar_continuacao';

interface AtendimentoRow {
  id: number;
  cliente_id: number;
  unidade_id: number;
  categoria_id: number | null;
  status: string;
}

interface ItemRow {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number;
  valor: number;
  valor_original: number | null;
  valor_final: number | null;
  valor_pago: number;
  dentes: string | null;
  quantidade: number;
  group_id: string | null;
  dente_unico: string | null;
  observacoes: string | null;
  status: string;
  etapas_valores: string | null;
}

interface DestinoInput {
  item_id: number;
  etapa_modelo_id?: number | null;
  destino_status: DestinoStatus;
  data_agendada?: string | null;
  executor_id?: number | null;
}

interface ItensHojeProjetadosResult {
  itensHoje: number;
}

function inferirStatusAgendamento(destino: DestinoStatus, dataAgendada?: string | null) {
  if (destino === 'agendar' && dataAgendada) return 'agendado';
  return 'pendente';
}

async function carregarRolesUsuarioAtivo(usuarioId: number): Promise<string[] | null> {
  const usuario = await queryOne<{ id: number; role: string }>(
    'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
    [usuarioId]
  );

  if (!usuario) return null;

  let roles = [usuario.role];
  try {
    const rolesRows = await query<{ role: string }>(
      'SELECT role FROM usuario_roles WHERE usuario_id = ?',
      [usuarioId]
    );
    if (rolesRows.length > 0) {
      roles = Array.from(new Set([usuario.role, ...rolesRows.map((row) => row.role)]));
    }
  } catch {
    // Bancos legados podem ainda não ter `usuario_roles`.
  }

  return roles;
}

async function validarExecutorSelecionado(
  executorId: number,
  categoriaId: number | null
): Promise<'not_found' | 'ok' | 'invalid'> {
  const roles = await carregarRolesUsuarioAtivo(executorId);
  if (!roles) return 'not_found';
  if (roles.includes('admin')) return 'ok';

  if (categoriaId) {
    try {
      const categoriaRoles = await query<{ role: string }>(
        'SELECT role FROM categoria_roles WHERE categoria_id = ?',
        [categoriaId]
      );
      const allowedRoles = categoriaRoles
        .map((row) => row.role)
        .filter((role) => role !== 'admin');

      if (allowedRoles.length > 0) {
        return roles.some((role) => allowedRoles.includes(role)) ? 'ok' : 'invalid';
      }
    } catch {
      // Bancos legados podem ainda não ter `categoria_roles`.
    }
  }

  return roles.some((role) => ['executor', 'ortodontista'].includes(role)) ? 'ok' : 'invalid';
}

async function criarAgendamentoFuturo({
  atendimento,
  item,
  etapaModeloId,
  itemAtendimentoOrigemId,
  executorId,
  dataAgendada,
  destinoStatus,
  valor,
  valorPago,
}: {
  atendimento: AtendimentoRow;
  item: ItemRow;
  etapaModeloId: number | null;
  itemAtendimentoOrigemId: number | null;
  executorId: number | null | undefined;
  dataAgendada?: string | null;
  destinoStatus: DestinoStatus;
  valor: number;
  valorPago: number;
}) {
  const result = await execute(
    `INSERT INTO agendamentos
      (cliente_id, atendimento_origem_id, procedimento_id, item_atendimento_origem_id, executor_id, data_agendada, status, etapa_modelo_id, pago, valor, valor_pago, unidade_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      atendimento.cliente_id,
      atendimento.id,
      item.procedimento_id,
      itemAtendimentoOrigemId,
      resolverExecutorDestinoId(executorId, item.executor_id),
      dataAgendada ?? null,
      inferirStatusAgendamento(destinoStatus, dataAgendada),
      etapaModeloId,
      valorPago >= valor ? 1 : 0,
      valor,
      valorPago,
      atendimento.unidade_id,
    ]
  );

  return result.lastInsertRowid as number;
}

export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params;
    const atendimentoId = parseInt(params!.id as string);
    const body = await request.json();
    const destinos = (body.destinos ?? []) as DestinoInput[];
    const destinosNormalizados = destinos.map((destino) => {
      const dataAgendadaUtc = clinicDateTimeInputToUtcIso(destino.data_agendada);
      if (destino.data_agendada && !dataAgendadaUtc) {
        throw new Error(`Data agendada inválida para o item ${destino.item_id}`);
      }

      return {
        ...destino,
        data_agendada: dataAgendadaUtc,
      };
    });
    const acaoFinal = (body.acao_final ?? 'liberar_execucao') as AcaoFinal;

    if (!Array.isArray(destinos) || destinos.length === 0) {
      return NextResponse.json({ error: 'destinos é obrigatório' }, { status: 400 });
    }

    if (!['liberar_execucao', 'finalizar_continuacao'].includes(acaoFinal)) {
      return NextResponse.json({ error: 'acao_final inválida' }, { status: 400 });
    }

    const atendimento = await queryOne<AtendimentoRow>(
      'SELECT id, cliente_id, unidade_id, categoria_id, status FROM atendimentos WHERE id = ? AND unidade_id = ?',
      [atendimentoId, context.unidadeId]
    );

    if (!atendimento) {
      return NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 });
    }

    if (atendimento.status !== 'aguardando_pagamento') {
      return NextResponse.json({ error: 'Atendimento não está em aguardando_pagamento' }, { status: 400 });
    }

    const executorIds = [...new Set(
      destinosNormalizados
        .map((destino) => destino.executor_id)
        .filter((executorId): executorId is number => typeof executorId === 'number' && Number.isFinite(executorId))
    )];

    for (const executorId of executorIds) {
      const validacaoExecutor = await validarExecutorSelecionado(executorId, atendimento.categoria_id);
      if (validacaoExecutor === 'not_found') {
        return NextResponse.json({ error: 'Executor não encontrado' }, { status: 404 });
      }
      if (validacaoExecutor === 'invalid') {
        return NextResponse.json({ error: 'Executor não tem permissão para esta categoria' }, { status: 400 });
      }
    }

    await execute('DELETE FROM itens_atendimento_destinos WHERE atendimento_id = ?', [atendimentoId]);

    for (const destino of destinosNormalizados) {
      await execute(
        `INSERT INTO itens_atendimento_destinos
          (atendimento_id, item_atendimento_id, etapa_modelo_id, destino_status, data_agendada, executor_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          atendimentoId,
          destino.item_id,
          destino.etapa_modelo_id ?? null,
          destino.destino_status,
          destino.data_agendada ?? null,
          destino.executor_id ?? null,
        ]
      );
    }

    const itens = await query<ItemRow>(
      'SELECT * FROM itens_atendimento WHERE atendimento_id = ? ORDER BY id ASC',
      [atendimentoId]
    );
    const destinosPorItem = new Map<number, DestinoInput[]>();
    for (const destino of destinosNormalizados) {
      const atual = destinosPorItem.get(destino.item_id) ?? [];
      atual.push(destino);
      destinosPorItem.set(destino.item_id, atual);
    }

    const calcularItensHojeProjetados = async (): Promise<ItensHojeProjetadosResult> => {
      let itensHojeProjetados = 0;

      for (const item of itens) {
        const destinosItem = destinosPorItem.get(item.id) ?? [];
        const temEtapas = !!(await queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM procedimento_etapas_modelo WHERE procedimento_id = ?',
          [item.procedimento_id]
        ))?.count;

        if (!temEtapas) {
          const destino = destinosItem[0];
          if (!destino || destino.destino_status === 'fazer_hoje') {
            itensHojeProjetados += 1;
          }
          continue;
        }

        const etapas = await buscarEtapasComValor(item);
        if (etapas.length === 0) {
          itensHojeProjetados += 1;
          continue;
        }

        const destinoPorEtapa = new Map<number, DestinoInput>(
          destinosItem
            .filter((destino) => destino.etapa_modelo_id != null)
            .map((destino) => [Number(destino.etapa_modelo_id), destino])
        );

        for (const etapa of etapas) {
          const destino = destinoPorEtapa.get(etapa.id);
          if (!destino || destino.destino_status === 'fazer_hoje') {
            itensHojeProjetados += 1;
          }
        }
      }

      return { itensHoje: itensHojeProjetados };
    };

    const { itensHoje: itensHojeProjetados } = await calcularItensHojeProjetados();
    if (acaoFinal === 'finalizar_continuacao' && itensHojeProjetados > 0) {
      return NextResponse.json(
        { error: 'Não é possível finalizar como continuação enquanto houver procedimento previsto para hoje' },
        { status: 400 }
      );
    }

    let agendamentosCriados = 0;
    let itensHoje = 0;
    const preservarItensOriginais = acaoFinal === 'finalizar_continuacao';

    for (const item of itens) {
      const destinosItem = destinosPorItem.get(item.id) ?? [];
      const temEtapas = !!(await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM procedimento_etapas_modelo WHERE procedimento_id = ?',
        [item.procedimento_id]
      ))?.count;

      if (!temEtapas) {
        const destino = destinosItem[0];
        if (!destino || destino.destino_status === 'fazer_hoje') {
          if (destino && destino.executor_id !== undefined && (destino.executor_id ?? null) !== (item.executor_id ?? null)) {
            await execute(
              'UPDATE itens_atendimento SET executor_id = ? WHERE id = ?',
              [destino.executor_id ?? null, item.id]
            );
          }
          itensHoje += 1;
          continue;
        }

        const executorDestinoId = resolverExecutorDestinoId(destino.executor_id, item.executor_id);
        if (
          preservarItensOriginais &&
          destino.executor_id !== undefined &&
          executorDestinoId !== (item.executor_id ?? null)
        ) {
          await execute(
            'UPDATE itens_atendimento SET executor_id = ? WHERE id = ?',
            [executorDestinoId, item.id]
          );
        }

        const agendamentoId = await criarAgendamentoFuturo({
          atendimento,
          item,
          etapaModeloId: null,
          itemAtendimentoOrigemId: preservarItensOriginais ? item.id : null,
          executorId: destino.executor_id,
          dataAgendada: destino.data_agendada,
          destinoStatus: destino.destino_status,
          valor: roundMoney(item.valor_final ?? item.valor),
          valorPago: roundMoney(item.valor_pago),
        });
        agendamentosCriados += 1;

        if (preservarItensOriginais) {
          continue;
        }

        await execute(
          `UPDATE pagamentos_alocacoes
           SET agendamento_id = ?, item_atendimento_id = NULL
           WHERE item_atendimento_id = ? AND (etapa_modelo_id IS NULL OR etapa_modelo_id = 0)`,
          [agendamentoId, item.id]
        );
        await execute('DELETE FROM itens_atendimento_destinos WHERE item_atendimento_id = ?', [item.id]);
        await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
        continue;
      }

      const etapas = await buscarEtapasComValor(item);
      if (etapas.length === 0) {
        itensHoje += 1;
        continue;
      }

      const destinoPorEtapa = new Map<number, DestinoInput>(
        destinosItem
          .filter(destino => destino.etapa_modelo_id != null)
          .map(destino => [Number(destino.etapa_modelo_id), destino])
      );

      for (const etapa of etapas) {
        const destino = destinoPorEtapa.get(etapa.id);
        const valorEtapa = roundMoney(etapa.valor ?? 0);
        const valorPagoEtapa = await somarAlocacoesAtivasDaEtapa(item.id, etapa.id);

        if (!destino || destino.destino_status === 'fazer_hoje') {
          const insertResult = await execute(
            `INSERT INTO itens_atendimento
              (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, valor_final, desconto_valor, valor_pago, dentes, quantidade, group_id, dente_unico, observacoes, status, etapa_modelo_id, etapa_label)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              atendimentoId,
              item.procedimento_id,
              resolverExecutorDestinoId(destino?.executor_id, item.executor_id),
              item.criado_por_id,
              valorEtapa,
              valorEtapa,
              valorEtapa,
              valorPagoEtapa,
              item.dentes,
              item.quantidade,
              item.group_id,
              item.dente_unico,
              item.observacoes,
              valorPagoEtapa >= valorEtapa ? 'pago' : 'pendente',
              etapa.id,
              etapa.nome,
            ]
          );
          const novoItemId = insertResult.lastInsertRowid as number;
          await execute(
            `UPDATE pagamentos_alocacoes
             SET item_atendimento_id = ?
             WHERE item_atendimento_id = ? AND etapa_modelo_id = ?`,
            [novoItemId, item.id, etapa.id]
          );
          itensHoje += 1;
          continue;
        }

        const agendamentoId = await criarAgendamentoFuturo({
          atendimento,
          item,
          etapaModeloId: etapa.id,
          itemAtendimentoOrigemId: preservarItensOriginais ? item.id : null,
          executorId: destino.executor_id,
          dataAgendada: destino.data_agendada,
          destinoStatus: destino.destino_status,
          valor: valorEtapa,
          valorPago: valorPagoEtapa,
        });
        agendamentosCriados += 1;

        if (preservarItensOriginais) {
          continue;
        }

        await execute(
          `UPDATE pagamentos_alocacoes
           SET agendamento_id = ?, item_atendimento_id = NULL
           WHERE item_atendimento_id = ? AND etapa_modelo_id = ?`,
          [agendamentoId, item.id, etapa.id]
        );
      }

      if (preservarItensOriginais) {
        continue;
      }

      await execute('DELETE FROM itens_atendimento_destinos WHERE item_atendimento_id = ?', [item.id]);
      await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
    }

    if (acaoFinal === 'finalizar_continuacao') {
      const finalizadoAt = nowUtcIso();
      await execute(
        `UPDATE atendimentos
         SET status = 'finalizado',
             finalizado_at = ?,
             motivo_saida = 'continuacao',
             liberado_por_id = NULL,
             liberado_em = NULL
         WHERE id = ? AND unidade_id = ?`,
        [finalizadoAt, atendimentoId, context.unidadeId]
      );
    }

    return NextResponse.json({
      agendamentos_criados: agendamentosCriados,
      itens_hoje: itensHoje,
      status_final: acaoFinal === 'finalizar_continuacao' ? 'finalizado' : atendimento.status,
    });
  } catch (error) {
    console.error('Erro ao selecionar procedimentos:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Erro ao processar seleção: ${msg}` }, { status: 500 });
  }
});
