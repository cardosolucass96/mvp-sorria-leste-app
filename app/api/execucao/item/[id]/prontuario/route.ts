import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { garantirProntuarioEvolucoesSchema } from '@/lib/helpers/garantirProntuarioEvolucoesSchema';
import { nowUtcIso } from '@/lib/time';

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

const MIN_CARACTERES = 10;

// GET /api/execucao/item/[id]/prontuario - Busca prontuário do item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await garantirProntuarioEvolucoesSchema();

    const prontuario = await queryOne<Prontuario>(
      `SELECT
        pe.id,
        pei.item_atendimento_id,
        pe.usuario_id,
        pe.descricao,
        pe.observacoes,
        pe.created_at,
        pe.updated_at,
        u.nome as usuario_nome
      FROM prontuario_evolucao_itens pei
      INNER JOIN prontuario_evolucoes pe ON pe.id = pei.evolucao_id
      INNER JOIN usuarios u ON pe.usuario_id = u.id
      WHERE pei.item_atendimento_id = ?`,
      [parseInt(id)]
    );

    if (prontuario) {
      return NextResponse.json({ prontuario });
    }

    const legado = await queryOne<Prontuario>(
      `SELECT
        p.*,
        u.nome as usuario_nome
      FROM prontuarios p
      INNER JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.item_atendimento_id = ?`,
      [parseInt(id)]
    );

    return NextResponse.json({ prontuario: legado ?? null });
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
    await garantirProntuarioEvolucoesSchema();

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

    const evolucaoExistente = await queryOne<{ id: number; legacy_prontuario_id: number | null }>(
      `SELECT pe.id, pe.legacy_prontuario_id
       FROM prontuario_evolucao_itens pei
       INNER JOIN prontuario_evolucoes pe ON pe.id = pei.evolucao_id
       WHERE pei.item_atendimento_id = ?`,
      [parseInt(id)]
    );

    if (evolucaoExistente && evolucaoExistente.legacy_prontuario_id === null) {
      return NextResponse.json(
        { error: 'Este procedimento já está vinculado a uma evolução em lote' },
        { status: 409 }
      );
    }

    // Verifica se já existe prontuário
    const existente = await queryOne<{ id: number }>(
      'SELECT id FROM prontuarios WHERE item_atendimento_id = ?',
      [parseInt(id)]
    );

    if (existente) {
      const updatedAt = nowUtcIso();
      // Atualiza
      await execute(
        `UPDATE prontuarios 
         SET descricao = ?, observacoes = ?, updated_at = ?
         WHERE item_atendimento_id = ?`,
        [descricao.trim(), observacoes?.trim() || null, updatedAt, parseInt(id)]
      );
      await execute(
        `UPDATE prontuario_evolucoes
         SET descricao = ?, observacoes = ?, updated_at = ?
         WHERE legacy_prontuario_id = ?`,
        [descricao.trim(), observacoes?.trim() || null, updatedAt, existente.id]
      );
    } else {
      // Cria novo
      await execute(
        `INSERT INTO prontuarios (item_atendimento_id, usuario_id, descricao, observacoes)
         VALUES (?, ?, ?, ?)`,
        [parseInt(id), usuario_id, descricao.trim(), observacoes?.trim() || null]
      );
    }

    await execute(`
      INSERT OR IGNORE INTO prontuario_evolucoes (
        uuid,
        atendimento_id,
        usuario_id,
        descricao,
        observacoes,
        legacy_prontuario_id,
        created_at,
        updated_at
      )
      SELECT
        'legacy-prontuario-' || pr.id,
        i.atendimento_id,
        pr.usuario_id,
        pr.descricao,
        pr.observacoes,
        pr.id,
        pr.created_at,
        pr.updated_at
      FROM prontuarios pr
      INNER JOIN itens_atendimento i ON i.id = pr.item_atendimento_id
      WHERE pr.item_atendimento_id = ?
    `, [parseInt(id)]);

    await execute(`
      INSERT OR IGNORE INTO prontuario_evolucao_itens (
        evolucao_id,
        item_atendimento_id,
        created_at
      )
      SELECT pe.id, pr.item_atendimento_id, pr.created_at
      FROM prontuarios pr
      INNER JOIN prontuario_evolucoes pe ON pe.legacy_prontuario_id = pr.id
      WHERE pr.item_atendimento_id = ?
    `, [parseInt(id)]);

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
