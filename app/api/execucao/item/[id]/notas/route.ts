import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface Nota {
  id: number;
  item_atendimento_id: number;
  usuario_id: number;
  texto: string;
  created_at: string;
  usuario_nome?: string;
}

// GET /api/execucao/item/[id]/notas - Lista notas do item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const notas = await query<Nota>(
      `SELECT n.*, u.nome as usuario_nome
       FROM notas_execucao n
       INNER JOIN usuarios u ON n.usuario_id = u.id
       WHERE n.item_atendimento_id = ?
       ORDER BY n.created_at DESC`,
      [parseInt(id)]
    );

    return NextResponse.json(notas);
  } catch (error) {
    console.error('Erro ao buscar notas:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar notas' },
      { status: 500 }
    );
  }
}

// POST /api/execucao/item/[id]/notas - Adiciona nota ao item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { usuario_id, texto } = await request.json();

    if (!usuario_id) {
      return NextResponse.json(
        { error: 'Usuário é obrigatório' },
        { status: 400 }
      );
    }

    if (!texto || texto.trim() === '') {
      return NextResponse.json(
        { error: 'Texto da nota é obrigatório' },
        { status: 400 }
      );
    }

    const result = await execute(
      `INSERT INTO notas_execucao (item_atendimento_id, usuario_id, texto)
       VALUES (?, ?, ?)`,
      [parseInt(id), usuario_id, texto.trim()]
    );

    return NextResponse.json(
      { id: result.lastInsertRowid, message: 'Nota adicionada com sucesso' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erro ao adicionar nota:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar nota' },
      { status: 500 }
    );
  }
}
