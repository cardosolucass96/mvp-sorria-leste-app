import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, queryOne, execute } from '@/lib/db';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { Agendamento } from '@/lib/types';
import { resolveAvaliadorPadraoDaUnidade } from '@/lib/helpers/atendimentoDefaults';
import { getClinicDayUtcRange } from '@/lib/time';
import { obterValorEfetivoAgendamento, roundMoney } from '@/lib/helpers/pagamentoFlow';
import { validarDentesProcedimento, type DenteProcedimentoPayload } from '@/lib/helpers/dentesProcedimento';

interface ItemOrigem {
  criado_por_id: number;
}

interface AtendimentoExistente {
  id: number;
}

interface ItemOrigemVinculado {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number;
  status: string;
  cliente_id: number;
  dentes: string | null;
  dente_unico: string | null;
  procedimento_por_dente: number;
  procedimento_tem_face: number;
}

interface EtapaModelo {
  id: number;
  nome: string;
  valor: number | null;
}

interface AgendamentoDoCliente {
  id: number;
  cliente_id: number;
  atendimento_origem_id: number | null;
  procedimento_id: number | null;
  executor_id: number | null;
  item_atendimento_origem_id: number | null;
  etapa_modelo_id: number | null;
  pago: number;
  valor: number | null;
  valor_pago: number;
  data_agendada: string | null;
  status: string;
  tipo: string;
  procedimento_por_dente: number;
  procedimento_tem_face: number;
}

// POST /api/agendamentos/[id]/chegou - Ação "Chegou" da tela Agenda (apenas admin/atendente)
// Agrupa automaticamente todos os agendamentos do cliente para hoje num único atendimento.
export const POST = withUnitRole(['admin', 'atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const agendamentoId = parseInt(id as string);
    const hojeRange = getClinicDayUtcRange();
    const body = await request.json().catch(() => ({})) as {
      agendamento_ids?: unknown;
      dentes_por_agendamento?: Record<string, unknown>;
    };
    const dentesInformados = body.dentes_por_agendamento ?? {};
    const selecaoExplicita = body.agendamento_ids !== undefined;
    if (selecaoExplicita && !Array.isArray(body.agendamento_ids)) {
      return NextResponse.json({ error: 'Agendamentos selecionados inválidos' }, { status: 400 });
    }
    const agendamentoIdsSelecionados = selecaoExplicita
      ? Array.from(new Set(
        (body.agendamento_ids as unknown[]).map((valor) => Number(valor))
      ))
      : null;

    if (
      agendamentoIdsSelecionados
      && (
        agendamentoIdsSelecionados.length === 0
        || agendamentoIdsSelecionados.some((valor) => !Number.isInteger(valor) || valor <= 0)
        || !agendamentoIdsSelecionados.includes(agendamentoId)
      )
    ) {
      return NextResponse.json(
        { error: 'Selecione ao menos um agendamento e inclua o agendamento de referência' },
        { status: 400 }
      );
    }

    // 1. Buscar agendamento disparador e validar status
    const agendamento = await queryOne<Agendamento>(
      'SELECT * FROM agendamentos WHERE id = ?',
      [agendamentoId]
    );

    if (!agendamento) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    if (agendamento.status !== 'pendente' && agendamento.status !== 'agendado') {
      return NextResponse.json(
        { error: `Não é possível registrar chegada para agendamento com status "${agendamento.status}"` },
        { status: 400 }
      );
    }

    // Verifica se agendamento pertence à unidade atual
    const unidadeId = context.unidadeId;
    if (agendamento.unidade_id && agendamento.unidade_id !== unidadeId) {
      return NextResponse.json(
        { error: 'Agendamento não pertence a esta unidade' },
        { status: 403 }
      );
    }

    // 3. Buscar os agendamentos selecionados ou, no formato antigo, todos os
    //    agendamentos do cliente para hoje (pendente ou agendado).
    const filtroAgendamentos = agendamentoIdsSelecionados
      ? `a.id IN (${agendamentoIdsSelecionados.map(() => '?').join(', ')})`
      : `(a.id = ? OR (a.data_agendada >= ? AND a.data_agendada < ?))`;
    const parametrosAgendamentos = agendamentoIdsSelecionados
      ? [agendamento.cliente_id, unidadeId, ...agendamentoIdsSelecionados]
      : [agendamento.cliente_id, unidadeId, agendamentoId, hojeRange.start, hojeRange.endExclusive];
    const agendamentosHoje = await query<AgendamentoDoCliente>(
      `SELECT
         a.*,
         COALESCE(p.por_dente, 0) as procedimento_por_dente,
         COALESCE(p.tem_face, 0) as procedimento_tem_face
       FROM agendamentos a
       LEFT JOIN procedimentos p ON p.id = a.procedimento_id
       WHERE a.cliente_id = ?
         AND a.unidade_id = ?
         AND a.status IN ('pendente', 'agendado')
         AND ${filtroAgendamentos}
       ORDER BY a.id ASC`,
      parametrosAgendamentos
    );

    // Garante que o disparador sempre está incluído (caso data_agendada seja null)
    const idsAgrupados = new Set(agendamentosHoje.map(a => a.id));
    if (!idsAgrupados.has(agendamentoId)) {
      agendamentosHoje.unshift(agendamento as unknown as AgendamentoDoCliente);
      idsAgrupados.add(agendamentoId);
    }

    if (agendamentoIdsSelecionados) {
      const idsAusentes = agendamentoIdsSelecionados.filter((idSelecionado) => !idsAgrupados.has(idSelecionado));
      if (idsAusentes.length > 0) {
        return NextResponse.json(
          { error: 'Um ou mais agendamentos selecionados não estão disponíveis para este cliente' },
          { status: 409 }
        );
      }
    }

    // 4. Determinar se é avaliação ou sessão de procedimento
    const soAvaliacao = agendamentosHoje.every(ag => ag.tipo === 'avaliacao' || !ag.procedimento_id);
    const agendamentosProcedimento = agendamentosHoje.filter(ag => ag.tipo !== 'avaliacao' && ag.procedimento_id);
    const agendamentosVinculados = agendamentosProcedimento.filter((ag) => ag.item_atendimento_origem_id != null);
    const dentesValidados = new Map<number, DenteProcedimentoPayload[]>();

    for (const ag of agendamentosProcedimento) {
      if (ag.item_atendimento_origem_id != null || ag.procedimento_por_dente !== 1) continue;

      const validacao = validarDentesProcedimento(dentesInformados[String(ag.id)], {
        exigirFaces: ag.procedimento_tem_face === 1,
      });
      if (!validacao.ok) {
        return NextResponse.json(
          { error: `${ag.id}: ${validacao.error}`, agendamento_sem_dente_id: ag.id },
          { status: 400 }
        );
      }
      dentesValidados.set(ag.id, validacao.dentes);
    }

    let novoAtendimentoId: number;

    if (!soAvaliacao && agendamentosVinculados.length > 0) {
      if (agendamentosVinculados.length !== agendamentosProcedimento.length) {
        return NextResponse.json(
          { error: 'Os agendamentos de hoje misturam procedimentos vinculados e avulsos. Registre a chegada separadamente.' },
          { status: 409 }
        );
      }

      const itemOrigemIds = Array.from(new Set(
        agendamentosVinculados
          .map((ag) => ag.item_atendimento_origem_id)
          .filter((itemId): itemId is number => typeof itemId === 'number' && Number.isFinite(itemId))
      ));

      const itensOrigem = await query<ItemOrigemVinculado>(
        `SELECT
           i.id,
           i.atendimento_id,
           i.procedimento_id,
           i.executor_id,
           i.criado_por_id,
           i.status,
           a.cliente_id,
           i.dentes,
           i.dente_unico,
           p.por_dente as procedimento_por_dente,
           p.tem_face as procedimento_tem_face
         FROM itens_atendimento i
         INNER JOIN atendimentos a ON a.id = i.atendimento_id
         INNER JOIN procedimentos p ON p.id = i.procedimento_id
         WHERE i.id IN (${itemOrigemIds.map(() => '?').join(', ')})
           AND a.unidade_id = ?`,
        [...itemOrigemIds, unidadeId]
      );

      if (itensOrigem.length !== itemOrigemIds.length) {
        return NextResponse.json(
          { error: 'Um ou mais procedimentos vinculados não foram encontrados na unidade atual' },
          { status: 409 }
        );
      }

      const itensOrigemMap = new Map(itensOrigem.map((item) => [item.id, item]));
      const atendimentoOrigemIds = new Set<number>();
      const dentesParaRecuperarNoItem = new Map<number, DenteProcedimentoPayload>();

      for (const ag of agendamentosVinculados) {
        const itemOrigem = itensOrigemMap.get(ag.item_atendimento_origem_id!);
        if (!itemOrigem) {
          return NextResponse.json(
            { error: 'Procedimento de origem não encontrado para um dos agendamentos do grupo' },
            { status: 409 }
          );
        }

        if (itemOrigem.cliente_id !== agendamento.cliente_id) {
          return NextResponse.json(
            { error: 'Os procedimentos vinculados do grupo não pertencem ao cliente selecionado' },
            { status: 409 }
          );
        }

        if (itemOrigem.procedimento_id !== ag.procedimento_id) {
          return NextResponse.json(
            { error: 'O procedimento do agendamento não corresponde ao procedimento de origem vinculado' },
            { status: 409 }
          );
        }

        if (ag.atendimento_origem_id && ag.atendimento_origem_id !== itemOrigem.atendimento_id) {
          return NextResponse.json(
            { error: 'Um dos agendamentos aponta para um atendimento de origem diferente do item vinculado' },
            { status: 409 }
          );
        }

        if (itemOrigem.status === 'concluido') {
          return NextResponse.json(
            { error: 'Não é possível registrar chegada para um procedimento vinculado que já foi concluído' },
            { status: 409 }
          );
        }

        if (itemOrigem.procedimento_por_dente === 1 && !itemOrigem.dentes && !itemOrigem.dente_unico) {
          const validacao = validarDentesProcedimento(dentesInformados[String(ag.id)], {
            exigirFaces: itemOrigem.procedimento_tem_face === 1,
          });
          if (!validacao.ok) {
            return NextResponse.json(
              { error: `${ag.id}: ${validacao.error}`, agendamento_sem_dente_id: ag.id },
              { status: 400 }
            );
          }
          if (validacao.dentes.length !== 1) {
            return NextResponse.json(
              { error: `${ag.id}: selecione exatamente um dente para o procedimento já vinculado` },
              { status: 400 }
            );
          }
          dentesParaRecuperarNoItem.set(itemOrigem.id, validacao.dentes[0]);
        }

        atendimentoOrigemIds.add(itemOrigem.atendimento_id);
      }

      if (atendimentoOrigemIds.size !== 1) {
        return NextResponse.json(
          { error: 'Os agendamentos vinculados do grupo apontam para atendimentos de origem diferentes. Registre a chegada separadamente.' },
          { status: 409 }
        );
      }

      const atendimentoOrigemId = Array.from(atendimentoOrigemIds)[0];
      const atendimentoAberto = await queryOne<AtendimentoExistente>(
        `SELECT id FROM atendimentos
         WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado')
           AND unidade_id = ?
           AND id != ?`,
        [agendamento.cliente_id, unidadeId, atendimentoOrigemId]
      );

      if (atendimentoAberto) {
        return NextResponse.json(
          {
            error: 'Cliente já possui outro atendimento aberto na unidade',
            atendimento_existente_id: atendimentoAberto.id,
          },
          { status: 409 }
        );
      }

      await execute(
        `UPDATE atendimentos
         SET status = 'aguardando_pagamento',
             finalizado_at = NULL,
             motivo_saida = NULL,
             liberado_por_id = NULL,
             liberado_em = NULL
         WHERE id = ? AND unidade_id = ?`,
        [atendimentoOrigemId, unidadeId]
      );
      novoAtendimentoId = atendimentoOrigemId;

      for (const [itemId, dente] of dentesParaRecuperarNoItem) {
        await execute(
          'UPDATE itens_atendimento SET dentes = ?, dente_unico = ? WHERE id = ?',
          [JSON.stringify([dente]), dente.dente, itemId]
        );
      }

      for (const ag of agendamentosVinculados) {
        const itemOrigem = itensOrigemMap.get(ag.item_atendimento_origem_id!);
        if (!itemOrigem) continue;

        if (ag.executor_id != null && !['executando', 'concluido'].includes(itemOrigem.status) && ag.executor_id !== itemOrigem.executor_id) {
          await execute(
            'UPDATE itens_atendimento SET executor_id = ? WHERE id = ?',
            [ag.executor_id, itemOrigem.id]
          );
        }

        if (ag.etapa_modelo_id != null) {
          await execute(
            `DELETE FROM itens_atendimento_destinos
             WHERE atendimento_id = ?
               AND item_atendimento_id = ?
               AND etapa_modelo_id = ?`,
            [atendimentoOrigemId, itemOrigem.id, ag.etapa_modelo_id]
          );
        } else {
          await execute(
            `DELETE FROM itens_atendimento_destinos
             WHERE atendimento_id = ?
               AND item_atendimento_id = ?
               AND etapa_modelo_id IS NULL`,
            [atendimentoOrigemId, itemOrigem.id]
          );
        }

        await execute(
          `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
          [novoAtendimentoId, ag.id]
        );
      }

      for (const ag of agendamentosHoje.filter(a => a.tipo === 'avaliacao' || !a.procedimento_id)) {
        await execute(
          `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
          [novoAtendimentoId, ag.id]
        );
      }
    } else if (soAvaliacao) {
      // 5. Verificar que o cliente não tem atendimento aberto hoje na mesma unidade
      const atendimentoAberto = await queryOne<AtendimentoExistente>(
        `SELECT id FROM atendimentos
         WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado')
         AND created_at >= ? AND created_at < ? AND unidade_id = ?`,
        [agendamento.cliente_id, hojeRange.start, hojeRange.endExclusive, unidadeId]
      );

      if (atendimentoAberto) {
        return NextResponse.json(
          {
            error: 'Cliente já possui atendimento aberto hoje',
            atendimento_existente_id: atendimentoAberto.id,
          },
          { status: 409 }
        );
      }

      // Avaliação: se tem avaliador atribuído, já entra direto em 'avaliacao'
      const avaliadorAgendadoId = agendamentosHoje.find(ag => ag.executor_id)?.executor_id || null;
      const avaliadorId = avaliadorAgendadoId
        ?? await resolveAvaliadorPadraoDaUnidade(unidadeId, context.user.sub);
      const statusInicial = avaliadorId ? 'avaliacao' : 'triagem';

      const atendimentoResult = await execute(
        `INSERT INTO atendimentos (cliente_id, avaliador_id, status, tipo, agendamento_id, observacoes, unidade_id)
         VALUES (?, ?, ?, 'normal', ?, ?, ?)`,
        [agendamento.cliente_id, avaliadorId, statusInicial, agendamentoId, `Avaliação agendada (#${agendamentoId})`, unidadeId]
      );
      novoAtendimentoId = atendimentoResult.lastInsertRowid as number;

      // Marca todos os agendamentos de avaliação como realizados
      for (const ag of agendamentosHoje) {
        await execute(
          `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
          [novoAtendimentoId, ag.id]
        );
      }
    } else {
      // 5. Verificar que o cliente não tem atendimento aberto hoje na mesma unidade
      const atendimentoAberto = await queryOne<AtendimentoExistente>(
        `SELECT id FROM atendimentos
         WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado')
         AND created_at >= ? AND created_at < ? AND unidade_id = ?`,
        [agendamento.cliente_id, hojeRange.start, hojeRange.endExclusive, unidadeId]
      );

      if (atendimentoAberto) {
        return NextResponse.json(
          {
            error: 'Cliente já possui atendimento aberto hoje',
            atendimento_existente_id: atendimentoAberto.id,
          },
          { status: 409 }
        );
      }

      // Sessão: cria atendimento tipo sessão aguardando pagamento (fluxo original)
      const observacoes = agendamentosProcedimento.length > 1
        ? `Sessão com ${agendamentosProcedimento.length} procedimentos (agendamentos: ${agendamentosProcedimento.map(a => `#${a.id}`).join(', ')})`
        : `Sessão originada do agendamento #${agendamentoId}`;

      const atendimentoResult = await execute(
        `INSERT INTO atendimentos (cliente_id, status, tipo, agendamento_id, observacoes, unidade_id)
         VALUES (?, 'aguardando_pagamento', 'sessao', ?, ?, ?)`,
        [agendamento.cliente_id, agendamentoId, observacoes, unidadeId]
      );
      novoAtendimentoId = atendimentoResult.lastInsertRowid as number;

      // Criar itens para cada agendamento de procedimento
      for (const ag of agendamentosProcedimento) {
        const procedimento = await queryOne<{ id: number; valor: number }>(
          'SELECT id, valor FROM procedimentos WHERE id = ?',
          [ag.procedimento_id]
        );

        if (!procedimento) continue;

        const etapaModeloId: number | null = ag.etapa_modelo_id ?? null;
        let etapaLabel: string | null = null;
        let etapasModelo: EtapaModelo[] = [];

        if (etapaModeloId) {
          etapasModelo = await query<EtapaModelo>(
            'SELECT id, nome, valor FROM procedimento_etapas_modelo WHERE procedimento_id = ? ORDER BY ordem ASC',
            [ag.procedimento_id]
          );
          const etapaModelo = etapasModelo.find((etapa) => etapa.id === etapaModeloId);
          if (etapaModelo) {
            etapaLabel = etapaModelo.nome;
          }
        }

        const itemValor = obterValorEfetivoAgendamento({
          valor: ag.valor,
          valor_pago: ag.valor_pago,
          procedimento_valor: procedimento.valor,
          etapa_modelo_id: etapaModeloId,
          etapas_modelo: etapasModelo,
        });
        const valorPagoSalvo = roundMoney(Math.max(0, Number(ag.valor_pago) || 0));
        const valorPagoTotal = valorPagoSalvo > 0
          ? valorPagoSalvo
          : ag.pago
            ? itemValor
            : 0;

        let criadoPorId = context.user.sub;
        if (ag.item_atendimento_origem_id) {
          const itemOrigem = await queryOne<ItemOrigem>(
            'SELECT criado_por_id FROM itens_atendimento WHERE id = ?',
            [ag.item_atendimento_origem_id]
          );
          if (itemOrigem) {
            criadoPorId = itemOrigem.criado_por_id;
          }
        }

        const dentesDoAgendamento = ag.procedimento_por_dente === 1
          ? dentesValidados.get(ag.id) ?? []
          : [];
        const quantidadeItens = dentesDoAgendamento.length || 1;
        const valorPagoPorItem = roundMoney(valorPagoTotal / quantidadeItens);
        const groupId = ag.procedimento_por_dente === 1 ? randomUUID() : null;

        for (const dente of dentesDoAgendamento.length > 0 ? dentesDoAgendamento : [null]) {
          const statusItem = valorPagoPorItem >= itemValor ? 'pago' : 'pendente';
          await execute(
            `INSERT INTO itens_atendimento
              (atendimento_id, procedimento_id, valor, valor_original, valor_final, desconto_valor, valor_pago, status, executor_id, criado_por_id, origem_agendamento_id, etapa_modelo_id, etapa_label, dentes, group_id, dente_unico)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              novoAtendimentoId,
              ag.procedimento_id,
              itemValor,
              itemValor, // valor_original = snapshot do valor inicial
              itemValor,
              valorPagoPorItem,
              statusItem,
              ag.executor_id || null,
              criadoPorId,
              ag.id,
              etapaModeloId,
              etapaLabel,
              dente ? JSON.stringify([dente]) : null,
              groupId,
              dente?.dente ?? null,
            ]
          );
        }

        await execute(
          `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
          [novoAtendimentoId, ag.id]
        );
      }

      // Marca agendamentos de avaliação no grupo como realizados também
      for (const ag of agendamentosHoje.filter(a => a.tipo === 'avaliacao' || !a.procedimento_id)) {
        await execute(
          `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
          [novoAtendimentoId, ag.id]
        );
      }
    }

    // 6. Retornar o novo atendimento para redirecionamento
    const novoAtendimento = await queryOne<Record<string, unknown>>(
      `SELECT
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      WHERE a.id = ?`,
      [novoAtendimentoId]
    );

    return NextResponse.json(
      { ...novoAtendimento, agendamentos_agrupados: agendamentosHoje.length },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao registrar chegada:', error);
    return NextResponse.json({ error: 'Erro ao registrar chegada' }, { status: 500 });
  }
});
