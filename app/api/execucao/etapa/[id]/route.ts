import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query, execute } from '@/lib/db';

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
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const etapa = await queryOne<Etapa & { prontuario: ProntuarioEtapa | null; concluido_por_nome: string | null }>(
      `SELECT e.*,
              u.nome as concluido_por_nome,
              pe.id as prontuario_id,
              pe.descricao as prontuario_descricao,
              pe.observacoes as prontuario_observacoes,
              pe.created_at as prontuario_created_at
       FROM etapas_procedimento e
       LEFT JOIN usuarios u ON e.concluido_por_id = u.id
       LEFT JOIN prontuarios_etapa pe ON pe.etapa_id = e.id
       WHERE e.id = ?`,
      [parseInt(id)]
    );

    if (!etapa) {
      return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });
    }

    return NextResponse.json(etapa);
  } catch (error) {
    console.error('Erro ao buscar etapa:', error);
    return NextResponse.json({ error: 'Erro ao buscar etapa' }, { status: 500 });
  }
}

// PUT /api/execucao/etapa/[id] - Conclui a etapa (requer prontuário salvo)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { usuario_id } = await request.json();

    if (!usuario_id) {
      return NextResponse.json({ error: 'Usuário não identificado' }, { status: 400 });
    }

    const etapa = await queryOne<Etapa>(
      'SELECT * FROM etapas_procedimento WHERE id = ?',
      [parseInt(id)]
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
    if (pendentes.length === 0) {
      await execute(
        `UPDATE itens_atendimento
         SET status = 'concluido', concluido_at = datetime('now', 'localtime')
         WHERE id = ? AND status != 'concluido'`,
        [etapa.item_atendimento_id]
      );
    }

    return NextResponse.json({ success: true, item_concluido: pendentes.length === 0 });
  } catch (error) {
    console.error('Erro ao concluir etapa:', error);
    return NextResponse.json({ error: 'Erro ao concluir etapa' }, { status: 500 });
  }
}
