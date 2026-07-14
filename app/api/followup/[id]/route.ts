import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { nowUtcIso } from '@/lib/time';
import {
  getFollowupTask,
  getFollowupTaskDetail,
  isFollowupTipo,
  isTaskMutable,
  isValidResponsavelAtendente,
  normalizeDateTimeInput,
} from '../_helpers';

// PUT /api/followup/[id] - Edita tarefa aberta
export const PUT = withUnitRole(['atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const followupId = parseInt(id as string);
    const body = await request.json();

    const tarefa = await getFollowupTask(followupId, context.unidadeId);
    if (!tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }
    if (!isTaskMutable(tarefa)) {
      return NextResponse.json(
        { error: 'Apenas tarefas abertas e não excluídas podem ser editadas' },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    const updatedAt = nowUtcIso();

    if (body.cliente_id !== undefined) {
      const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [body.cliente_id]);
      if (!cliente) {
        return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
      }
      updates.push('cliente_id = ?');
      params.push(parseInt(String(body.cliente_id)));
    }

    if (body.responsavel_usuario_id !== undefined) {
      const responsavelValido = await isValidResponsavelAtendente(
        parseInt(String(body.responsavel_usuario_id)),
        context.unidadeId
      );
      if (!responsavelValido) {
        return NextResponse.json(
          { error: 'Responsável deve ser um atendente ativo da unidade atual' },
          { status: 400 }
        );
      }
      updates.push('responsavel_usuario_id = ?');
      params.push(parseInt(String(body.responsavel_usuario_id)));
    }

    if (body.tipo !== undefined) {
      if (!isFollowupTipo(body.tipo)) {
        return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
      }
      updates.push('tipo = ?');
      params.push(body.tipo);
    }

    if (body.titulo !== undefined) {
      if (typeof body.titulo !== 'string' || !body.titulo.trim()) {
        return NextResponse.json({ error: 'titulo é obrigatório' }, { status: 400 });
      }
      updates.push('titulo = ?');
      params.push(body.titulo.trim());
    }

    if (body.descricao !== undefined) {
      updates.push('descricao = ?');
      params.push(typeof body.descricao === 'string' && body.descricao.trim() ? body.descricao.trim() : null);
    }

    if (body.vencimento_em !== undefined) {
      const vencimentoNormalizado = normalizeDateTimeInput(body.vencimento_em);
      if (!vencimentoNormalizado) {
        return NextResponse.json({ error: 'vencimento_em inválido' }, { status: 400 });
      }
      updates.push('vencimento_em = ?');
      params.push(vencimentoNormalizado);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    params.push(updatedAt);
    params.push(followupId);

    await execute(
      `UPDATE followup_tarefas
          SET ${updates.join(', ')}
        WHERE id = ?`,
      params
    );

    const updated = await getFollowupTaskDetail(followupId, context.unidadeId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar followup:', error);
    return NextResponse.json({ error: 'Erro ao atualizar followup' }, { status: 500 });
  }
});

// DELETE /api/followup/[id] - Exclusão lógica de tarefa aberta
export const DELETE = withUnitRole(['atendente'], async (
  _request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const followupId = parseInt(id as string);

    const tarefa = await getFollowupTask(followupId, context.unidadeId);
    if (!tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }
    if (!isTaskMutable(tarefa)) {
      return NextResponse.json(
        { error: 'Apenas tarefas abertas e não excluídas podem ser excluídas' },
        { status: 400 }
      );
    }

    const timestamp = nowUtcIso();
    await execute(
      `UPDATE followup_tarefas
          SET excluida_em = ?,
              excluida_por_id = ?,
              updated_at = ?
        WHERE id = ?`,
      [timestamp, context.user.sub, timestamp, followupId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir followup:', error);
    return NextResponse.json({ error: 'Erro ao excluir followup' }, { status: 500 });
  }
});
