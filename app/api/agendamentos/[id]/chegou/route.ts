import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { withAuth, AuthenticatedContext } from '@/lib/auth/middleware';
import { Agendamento } from '@/lib/types';

interface ItemOrigem {
  criado_por_id: number;
}

interface AtendimentoExistente {
  id: number;
}

// POST /api/agendamentos/[id]/chegou - Ação "Chegou" da tela Agenda
export const POST = withAuth(async (
  request: NextRequest,
  context: AuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const agendamentoId = parseInt(id as string);

    // 1. Buscar agendamento e validar status
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

    // 2. Verificar que o cliente não tem atendimento aberto hoje
    const atendimentoAberto = await queryOne<AtendimentoExistente>(
      `SELECT id FROM atendimentos
       WHERE cliente_id = ? AND status != 'finalizado'
       AND date(created_at) = date('now','localtime')`,
      [agendamento.cliente_id]
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

    // Buscar valor do procedimento
    const procedimento = await queryOne<{ id: number; valor: number }>(
      'SELECT id, valor FROM procedimentos WHERE id = ?',
      [agendamento.procedimento_id]
    );

    if (!procedimento) {
      return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
    }

    // Buscar criado_por_id do item de origem se existir
    let criadoPorId = context.user.sub;
    if (agendamento.item_atendimento_origem_id) {
      const itemOrigem = await queryOne<ItemOrigem>(
        'SELECT criado_por_id FROM itens_atendimento WHERE id = ?',
        [agendamento.item_atendimento_origem_id]
      );
      if (itemOrigem) {
        criadoPorId = itemOrigem.criado_por_id;
      }
    }

    // 3. Criar novo atendimento tipo sessão
    const atendimentoResult = await execute(
      `INSERT INTO atendimentos (cliente_id, status, tipo, agendamento_id, observacoes)
       VALUES (?, 'aguardando_pagamento', 'sessao', ?, ?)`,
      [
        agendamento.cliente_id,
        agendamentoId,
        `Sessão originada do agendamento #${agendamentoId}`,
      ]
    );
    const novoAtendimentoId = atendimentoResult.lastInsertRowid;

    // 4. Criar item no novo atendimento
    await execute(
      `INSERT INTO itens_atendimento
        (atendimento_id, procedimento_id, valor, executor_id, criado_por_id, origem_agendamento_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        novoAtendimentoId,
        agendamento.procedimento_id,
        procedimento.valor,
        agendamento.executor_id || null,
        criadoPorId,
        agendamentoId,
      ]
    );

    // 5. Atualizar agendamento: status = realizado, atendimento_sessao_id
    await execute(
      `UPDATE agendamentos SET status = 'realizado', atendimento_sessao_id = ? WHERE id = ?`,
      [novoAtendimentoId, agendamentoId]
    );

    // 6. Retornar o novo atendimento para redirecionamento
    const novoAtendimento = await queryOne(
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

    return NextResponse.json(novoAtendimento, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar chegada:', error);
    return NextResponse.json({ error: 'Erro ao registrar chegada' }, { status: 500 });
  }
});
