import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { Agendamento } from '@/lib/types';

interface ItemOrigem {
  criado_por_id: number;
}

interface AtendimentoExistente {
  id: number;
}

interface EtapaModelo {
  id: number;
  nome: string;
  valor: number | null;
}

interface AgendamentoDoCliente {
  id: number;
  cliente_id: number;
  procedimento_id: number | null;
  executor_id: number | null;
  item_atendimento_origem_id: number | null;
  etapa_modelo_id: number | null;
  pago: number;
  data_agendada: string | null;
  status: string;
  tipo: string;
}

// POST /api/agendamentos/[id]/chegou - Ação "Chegou" da tela Agenda
// Agrupa automaticamente todos os agendamentos do cliente para hoje num único atendimento.
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const agendamentoId = parseInt(id as string);

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

    // 2. Verificar que o cliente não tem atendimento aberto hoje na mesma unidade
    const atendimentoAberto = await queryOne<AtendimentoExistente>(
      `SELECT id FROM atendimentos
       WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado')
       AND date(created_at) = date('now','localtime') AND unidade_id = ?`,
      [agendamento.cliente_id, unidadeId]
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

    // 3. Buscar TODOS os agendamentos do cliente para hoje (pendente ou agendado)
    //    Inclui o agendamento disparador + qualquer outro com data_agendada = hoje
    const agendamentosHoje = await query<AgendamentoDoCliente>(
      `SELECT * FROM agendamentos
       WHERE cliente_id = ?
         AND unidade_id = ?
         AND status IN ('pendente', 'agendado')
         AND (
           id = ?
           OR date(data_agendada) = date('now','localtime')
         )
       ORDER BY id ASC`,
      [agendamento.cliente_id, unidadeId, agendamentoId]
    );

    // Garante que o disparador sempre está incluído (caso data_agendada seja null)
    const idsAgrupados = new Set(agendamentosHoje.map(a => a.id));
    if (!idsAgrupados.has(agendamentoId)) {
      agendamentosHoje.unshift(agendamento as unknown as AgendamentoDoCliente);
    }

    // 4. Determinar se é avaliação ou sessão de procedimento
    const soAvaliacao = agendamentosHoje.every(ag => ag.tipo === 'avaliacao' || !ag.procedimento_id);
    const agendamentosProcedimento = agendamentosHoje.filter(ag => ag.tipo !== 'avaliacao' && ag.procedimento_id);

    let novoAtendimentoId: number;

    if (soAvaliacao) {
      // Avaliação: se tem avaliador atribuído, já entra direto em 'avaliacao'
      const avaliadorId = agendamentosHoje.find(ag => ag.executor_id)?.executor_id || null;
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

        let itemValor = procedimento.valor;
        const etapaModeloId: number | null = ag.etapa_modelo_id ?? null;
        let etapaLabel: string | null = null;

        if (etapaModeloId) {
          const etapaModelo = await queryOne<EtapaModelo>(
            'SELECT id, nome, valor FROM procedimento_etapas_modelo WHERE id = ?',
            [etapaModeloId]
          );
          if (etapaModelo) {
            etapaLabel = etapaModelo.nome;
            if (etapaModelo.valor != null) {
              itemValor = etapaModelo.valor;
            }
          }
        }

        const valorPago = ag.pago ? itemValor : 0;
        const statusItem = ag.pago ? 'pago' : 'pendente';

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

        await execute(
          `INSERT INTO itens_atendimento
            (atendimento_id, procedimento_id, valor, valor_pago, status, executor_id, criado_por_id, origem_agendamento_id, etapa_modelo_id, etapa_label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            novoAtendimentoId,
            ag.procedimento_id,
            itemValor,
            valorPago,
            statusItem,
            ag.executor_id || null,
            criadoPorId,
            ag.id,
            etapaModeloId,
            etapaLabel,
          ]
        );

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
