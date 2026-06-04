import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { getFollowupTask, getFollowupTaskDetail, isTaskMutable } from '../../_helpers';

// POST /api/followup/[id]/concluir - Conclui tarefa aberta com nota obrigatória
export const POST = withUnitRole(['atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const followupId = parseInt(id as string);
    const body = await request.json();

    const notaConclusao =
      typeof body.nota_conclusao === 'string' ? body.nota_conclusao.trim() : '';
    if (!notaConclusao) {
      return NextResponse.json({ error: 'nota_conclusao é obrigatória' }, { status: 400 });
    }

    const tarefa = await getFollowupTask(followupId, context.unidadeId);
    if (!tarefa) {
      return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    }
    if (!isTaskMutable(tarefa)) {
      return NextResponse.json(
        { error: 'Apenas tarefas abertas e não excluídas podem ser concluídas' },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE followup_tarefas
          SET status = 'concluida',
              nota_conclusao = ?,
              concluida_em = datetime('now','localtime'),
              concluida_por_id = ?,
              updated_at = datetime('now','localtime')
        WHERE id = ?`,
      [notaConclusao, context.user.sub, followupId]
    );

    const updated = await getFollowupTaskDetail(followupId, context.unidadeId);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Erro ao concluir followup:', error);
    return NextResponse.json({ error: 'Erro ao concluir followup' }, { status: 500 });
  }
});
