import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';
import { gerarComissoesItem } from '@/lib/helpers/gerarComissoes';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface Etapa {
  id: number;
  item_atendimento_id: number;
  dente: string;
  face: string;
  status: string;
  concluido_at: string | null;
  concluido_por_id: number | null;
}

interface ProntuarioEtapa {
  id: number;
  etapa_id: number;
  descricao: string;
  observacoes: string | null;
}

// GET /api/execucao/etapa/[id] - Detalhes da etapa com prontuário
export const GET = withUnit(async (_request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;

    const etapa = await queryOne<Etapa & { prontuario: ProntuarioEtapa | null; concluido_por_nome: string | null }>(
      `SELECT e.*,
              u.nome as concluido_por_nome,
              pe.id as prontuario_id,
              pe.descricao as prontuario_descricao,
              pe.observacoes as prontuario_observacoes,
              pe.created_at as prontuario_created_at
       FROM etapas_procedimento e
       INNER JOIN itens_atendimento i ON e.item_atendimento_id = i.id
       INNER JOIN atendimentos a ON i.atendimento_id = a.id
       LEFT JOIN usuarios u ON e.concluido_por_id = u.id
       LEFT JOIN prontuarios_etapa pe ON pe.etapa_id = e.id
       WHERE e.id = ? AND a.unidade_id = ?`,
      [parseInt(id), context.unidadeId]
    );

    if (!etapa) {
      return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });
    }

    return NextResponse.json(etapa);
  } catch (error) {
    console.error('Erro ao buscar etapa:', error);
    return NextResponse.json({ error: 'Erro ao buscar etapa' }, { status: 500 });
  }
});

// PUT /api/execucao/etapa/[id] - Conclui a etapa (requer prontuário salvo)
export const PUT = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;
    const { usuario_id } = await request.json();

    if (!usuario_id) {
      return NextResponse.json({ error: 'Usuário não identificado' }, { status: 400 });
    }

    // Verify etapa belongs to current unit via item→atendimento chain
    const etapa = await queryOne<Etapa>(
      `SELECT e.* FROM etapas_procedimento e
       INNER JOIN itens_atendimento i ON e.item_atendimento_id = i.id
       INNER JOIN atendimentos a ON i.atendimento_id = a.id
       WHERE e.id = ? AND a.unidade_id = ?`,
      [parseInt(id), context.unidadeId]
    );

    if (!etapa) {
      return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });
    }

    if (etapa.status === 'concluido') {
      return NextResponse.json({ error: 'Etapa já concluída' }, { status: 400 });
    }

    // Verifica se prontuário foi preenchido
    const prontuario = await queryOne<{ id: number }>(
      'SELECT id FROM prontuarios_etapa WHERE etapa_id = ?',
      [parseInt(id)]
    );

    if (!prontuario) {
      return NextResponse.json(
        { error: 'Preencha o prontuário antes de concluir a etapa' },
        { status: 400 }
      );
    }

    // Conclui a etapa
    await execute(
      `UPDATE etapas_procedimento
       SET status = 'concluido', concluido_at = datetime('now', 'localtime'), concluido_por_id = ?
       WHERE id = ?`,
      [usuario_id, parseInt(id)]
    );

    // Verifica se TODAS as etapas do item estão concluídas
    const pendentes = await query<{ id: number }>(
      `SELECT id FROM etapas_procedimento
       WHERE item_atendimento_id = ? AND status = 'pendente'`,
      [etapa.item_atendimento_id]
    );

    // Se não há pendentes → auto-conclui o item
    let atendimentoFinalizado = false;
    if (pendentes.length === 0) {
      await execute(
        `UPDATE itens_atendimento
         SET status = 'concluido', concluido_at = datetime('now', 'localtime')
         WHERE id = ? AND status != 'concluido'`,
        [etapa.item_atendimento_id]
      );

      await gerarComissoesItem(etapa.item_atendimento_id);

      // Auto-transição: se todos os itens do atendimento estão concluídos → finalizado
      const itemInfo = await queryOne<{ atendimento_id: number }>(
        'SELECT atendimento_id FROM itens_atendimento WHERE id = ?',
        [etapa.item_atendimento_id]
      );
      if (itemInfo) {
        const contagem = await queryOne<{ total: number; concluidos: number }>(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'concluido' THEN 1 ELSE 0 END) as concluidos
           FROM itens_atendimento WHERE atendimento_id = ?`,
          [itemInfo.atendimento_id]
        );
        if (contagem && contagem.total > 0 && contagem.total === contagem.concluidos) {
          const res = await execute(
            `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now','localtime')
             WHERE id = ? AND status = 'em_execucao'`,
            [itemInfo.atendimento_id]
          );
          atendimentoFinalizado = res.changes > 0;
        }
      }
    }

    return NextResponse.json({ success: true, item_concluido: pendentes.length === 0, atendimento_finalizado: atendimentoFinalizado });
  } catch (error) {
    console.error('Erro ao concluir etapa:', error);
    return NextResponse.json({ error: 'Erro ao concluir etapa' }, { status: 500 });
  }
});
