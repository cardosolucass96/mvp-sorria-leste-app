import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

interface Prontuario {
  id: number;
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  descricao: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

const MIN_CARACTERES = 50;

// GET /api/execucao/item/[id]/prontuario - Busca prontuário do item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const prontuario = await queryOne<Prontuario>(
      `SELECT 
        p.*,
        u.nome as usuario_nome
      FROM prontuarios p
      INNER JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.item_atendimento_id = ?`,
      [parseInt(id)]
    );

    if (!prontuario) {
      return NextResponse.json({ prontuario: null });
    }

    return NextResponse.json({ prontuario });
  } catch (error) {
    console.error('Erro ao buscar prontuário:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar prontuário' },
      { status: 500 }
    );
  }
}

// POST /api/execucao/item/[id]/prontuario - Cria ou atualiza prontuário
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { usuario_id, descricao, observacoes } = body;

    // Validações
    if (!usuario_id) {
      return NextResponse.json(
        { error: 'Usuário não identificado' },
        { status: 400 }
      );
    }

    if (!descricao || descricao.trim().length < MIN_CARACTERES) {
      return NextResponse.json(
        { error: `A descrição do prontuário deve ter no mínimo ${MIN_CARACTERES} caracteres` },
        { status: 400 }
      );
    }

    // Verifica se já existe prontuário
    const existente = await queryOne<{ id: number }>(
      'SELECT id FROM prontuarios WHERE item_atendimento_id = ?',
      [parseInt(id)]
    );

    if (existente) {
      // Atualiza
      await execute(
        `UPDATE prontuarios 
         SET descricao = ?, observacoes = ?, updated_at = datetime('now', 'localtime')
         WHERE item_atendimento_id = ?`,
        [descricao.trim(), observacoes?.trim() || null, parseInt(id)]
      );
    } else {
      // Cria novo
      await execute(
        `INSERT INTO prontuarios (item_atendimento_id, usuario_id, descricao, observacoes)
         VALUES (?, ?, ?, ?)`,
        [parseInt(id), usuario_id, descricao.trim(), observacoes?.trim() || null]
      );
    }

    // Retorna prontuário atualizado
    const prontuario = await queryOne<Prontuario>(
      `SELECT 
        p.*,
        u.nome as usuario_nome
      FROM prontuarios p
      INNER JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.item_atendimento_id = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ 
      success: true, 
      prontuario,
      message: existente ? 'Prontuário atualizado' : 'Prontuário criado'
    });
  } catch (error) {
    console.error('Erro ao salvar prontuário:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar prontuário' },
      { status: 500 }
    );
  }
}
