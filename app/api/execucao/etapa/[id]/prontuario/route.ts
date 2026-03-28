import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';

const MIN_CARACTERES = 50;

interface ProntuarioEtapa {
  id: number;
  etapa_id: number;
  usuario_id: number;
  usuario_nome: string;
  descricao: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/execucao/etapa/[id]/prontuario
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const prontuario = await queryOne<ProntuarioEtapa>(
      `SELECT pe.*, u.nome as usuario_nome
       FROM prontuarios_etapa pe
       INNER JOIN usuarios u ON pe.usuario_id = u.id
       WHERE pe.etapa_id = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ prontuario: prontuario ?? null });
  } catch (error) {
    console.error('Erro ao buscar prontuário da etapa:', error);
    return NextResponse.json({ error: 'Erro ao buscar prontuário' }, { status: 500 });
  }
}

// POST /api/execucao/etapa/[id]/prontuario - Cria ou atualiza prontuário da etapa
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { usuario_id, descricao, observacoes } = await request.json();

    if (!usuario_id) {
      return NextResponse.json({ error: 'Usuário não identificado' }, { status: 400 });
    }

    if (!descricao || descricao.trim().length < MIN_CARACTERES) {
      return NextResponse.json(
        { error: `A descrição deve ter no mínimo ${MIN_CARACTERES} caracteres` },
        { status: 400 }
      );
    }

    // Verifica que a etapa existe e não está concluída
    const etapa = await queryOne<{ id: number; status: string }>(
      'SELECT id, status FROM etapas_procedimento WHERE id = ?',
      [parseInt(id)]
    );

    if (!etapa) {
      return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });
    }

    if (etapa.status === 'concluido') {
      return NextResponse.json({ error: 'Etapa já concluída, prontuário não pode ser alterado' }, { status: 400 });
    }

    const existente = await queryOne<{ id: number }>(
      'SELECT id FROM prontuarios_etapa WHERE etapa_id = ?',
      [parseInt(id)]
    );

    if (existente) {
      await execute(
        `UPDATE prontuarios_etapa
         SET descricao = ?, observacoes = ?, updated_at = datetime('now', 'localtime')
         WHERE etapa_id = ?`,
        [descricao.trim(), observacoes?.trim() || null, parseInt(id)]
      );
    } else {
      await execute(
        `INSERT INTO prontuarios_etapa (etapa_id, usuario_id, descricao, observacoes)
         VALUES (?, ?, ?, ?)`,
        [parseInt(id), usuario_id, descricao.trim(), observacoes?.trim() || null]
      );
    }

    const prontuario = await queryOne<ProntuarioEtapa>(
      `SELECT pe.*, u.nome as usuario_nome
       FROM prontuarios_etapa pe
       INNER JOIN usuarios u ON pe.usuario_id = u.id
       WHERE pe.etapa_id = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({
      success: true,
      prontuario,
      message: existente ? 'Prontuário atualizado' : 'Prontuário salvo',
    });
  } catch (error) {
    console.error('Erro ao salvar prontuário da etapa:', error);
    return NextResponse.json({ error: 'Erro ao salvar prontuário' }, { status: 500 });
  }
}
