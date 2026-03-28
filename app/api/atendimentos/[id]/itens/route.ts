import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '@/lib/db';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  group_id: string | null;
  dente_unico: string | null;
  por_dente: number;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  por_dente: number;
}

interface Atendimento {
  id: number;
  status: string;
}

// GET /api/atendimentos/[id]/itens - Lista itens do atendimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const itens = await query<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null; criado_por_nome: string | null }>(
      `SELECT
        i.*,
        i.group_id,
        CASE
          WHEN i.group_id IS NOT NULL
          THEN json_extract(i.dentes, '$[0].dente')
          ELSE NULL
        END as dente_unico,
        p.nome as procedimento_nome,
        p.por_dente,
        u.nome as executor_nome,
        c.nome as criado_por_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      LEFT JOIN usuarios c ON i.criado_por_id = c.id
      WHERE i.atendimento_id = ?
      ORDER BY i.group_id NULLS LAST, i.created_at ASC`,
      [parseInt(id)]
    );
    
    return NextResponse.json(itens);
  } catch (error) {
    console.error('Erro ao buscar itens:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar itens' },
      { status: 500 }
    );
  }
}

// POST /api/atendimentos/[id]/itens - Adiciona item ao atendimento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade } = body;
    
    // Verifica se atendimento existe
    const atendimento = await queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );
    
    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }
    
    // Verifica se pode adicionar itens (triagem, avaliacao ou em_execucao)
    if (!['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Não é possível adicionar procedimentos neste status' },
        { status: 400 }
      );
    }
    
    // Validações
    if (!procedimento_id) {
      return NextResponse.json(
        { error: 'Procedimento é obrigatório' },
        { status: 400 }
      );
    }
    
    // Busca procedimento para pegar valor padrão
    const procedimento = await queryOne<Procedimento>(
      'SELECT * FROM procedimentos WHERE id = ? AND ativo = 1',
      [procedimento_id]
    );
    
    if (!procedimento) {
      return NextResponse.json(
        { error: 'Procedimento não encontrado ou inativo' },
        { status: 404 }
      );
    }
    
    // Verifica executor se fornecido
    if (executor_id) {
      const executor = await queryOne<{ id: number; role: string }>(
        "SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1",
        [executor_id]
      );
      
      if (!executor) {
        return NextResponse.json(
          { error: 'Executor não encontrado' },
          { status: 404 }
        );
      }
      
      if (executor.role !== 'executor' && executor.role !== 'admin') {
        return NextResponse.json(
          { error: 'Usuário selecionado não é executor' },
          { status: 400 }
        );
      }
    }
    
    // Usa valor do procedimento se não fornecido
    const valorFinal = valor !== undefined ? valor : procedimento.valor;
    const quantidadeFinal = quantidade || 1;

    interface DenteFaceDB { dente: string; faces: Array<{ nome: string }> }
    const dentesArray: DenteFaceDB[] = dentes ? JSON.parse(dentes) : [];

    // Fluxo por_dente: cria 1 item por dente
    if (procedimento.por_dente && dentesArray.length > 0) {
      const groupId = randomUUID();
      const valorPorDente = valorFinal / dentesArray.length;
      const itemIds: number[] = [];

      for (const d of dentesArray) {
        const res = await execute(
          `INSERT INTO itens_atendimento
            (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade, status, group_id)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'pendente', ?)`,
          [
            parseInt(id),
            procedimento_id,
            executor_id || null,
            criado_por_id || null,
            valorPorDente,
            JSON.stringify([d]),
            groupId
          ]
        );
        const itemId = res.lastInsertRowid as number;
        itemIds.push(itemId);

        for (const f of d.faces) {
          await execute(
            `INSERT INTO etapas_procedimento (item_atendimento_id, dente, face) VALUES (?, ?, ?)`,
            [itemId, d.dente, f.nome]
          );
        }
      }

      // Se adicionou durante execução, volta para aguardando_pagamento
      if (atendimento.status === 'em_execucao') {
        await execute(
          "UPDATE atendimentos SET status = 'aguardando_pagamento' WHERE id = ?",
          [parseInt(id)]
        );
      }

      return NextResponse.json({ group_id: groupId, itens: itemIds }, { status: 201 });
    }

    // Fluxo original para procedimentos NÃO por_dente
    const result = await execute(
      `INSERT INTO itens_atendimento
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [
        parseInt(id),
        procedimento_id,
        executor_id || null,
        criado_por_id || null,
        valorFinal,
        dentes || null,
        quantidadeFinal
      ]
    );

    const itemId = result.lastInsertRowid as number;

    // Cria etapas se tiver dentes com faces definidas
    for (const d of dentesArray) {
      for (const f of d.faces) {
        await execute(
          `INSERT INTO etapas_procedimento (item_atendimento_id, dente, face) VALUES (?, ?, ?)`,
          [itemId, d.dente, f.nome]
        );
      }
    }

    // Se adicionou durante execução, volta para aguardando_pagamento
    if (atendimento.status === 'em_execucao') {
      await execute(
        "UPDATE atendimentos SET status = 'aguardando_pagamento' WHERE id = ?",
        [parseInt(id)]
      );
    }

    // Retorna item criado
    const novoItem = await queryOne<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null }>(
      `SELECT
        i.*,
        p.nome as procedimento_nome,
        u.nome as executor_nome
      FROM itens_atendimento i
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios u ON i.executor_id = u.id
      WHERE i.id = ?`,
      [itemId]
    );

    return NextResponse.json(novoItem, { status: 201 });
  } catch (error) {
    console.error('Erro ao adicionar item:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar item' },
      { status: 500 }
    );
  }
}

// DELETE /api/atendimentos/[id]/itens - Remove item ou grupo (só na avaliação)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');
    const groupId = searchParams.get('group_id');

    if (!itemId && !groupId) {
      return NextResponse.json(
        { error: 'item_id ou group_id é obrigatório' },
        { status: 400 }
      );
    }

    // Verifica se atendimento existe e está em avaliação
    const atendimento = await queryOne<Atendimento>(
      'SELECT * FROM atendimentos WHERE id = ?',
      [parseInt(id)]
    );

    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    if (atendimento.status !== 'avaliacao') {
      return NextResponse.json(
        { error: 'Só é possível remover procedimentos durante a avaliação' },
        { status: 400 }
      );
    }

    // Remoção por group_id — remove todos os itens do grupo em cascata
    if (groupId) {
      const itensDoGrupo = await query<{ id: number }>(
        'SELECT id FROM itens_atendimento WHERE group_id = ? AND atendimento_id = ?',
        [groupId, parseInt(id)]
      );

      if (itensDoGrupo.length === 0) {
        return NextResponse.json(
          { error: 'Nenhum item encontrado para este group_id' },
          { status: 404 }
        );
      }

      for (const item of itensDoGrupo) {
        const etapas = await query<{ id: number }>(
          'SELECT id FROM etapas_procedimento WHERE item_atendimento_id = ?',
          [item.id]
        );
        for (const etapa of etapas) {
          await execute('DELETE FROM prontuarios_etapa WHERE etapa_id = ?', [etapa.id]);
        }
        await execute('DELETE FROM etapas_procedimento WHERE item_atendimento_id = ?', [item.id]);
        await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
      }

      return NextResponse.json({ message: `${itensDoGrupo.length} itens removidos com sucesso` });
    }

    // Remoção por item_id — remove um único item
    const item = await queryOne<ItemAtendimento>(
      'SELECT * FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
      [parseInt(itemId!), parseInt(id)]
    );

    if (!item) {
      return NextResponse.json(
        { error: 'Item não encontrado' },
        { status: 404 }
      );
    }

    const etapas = await query<{ id: number }>(
      'SELECT id FROM etapas_procedimento WHERE item_atendimento_id = ?',
      [parseInt(itemId!)]
    );
    for (const etapa of etapas) {
      await execute('DELETE FROM prontuarios_etapa WHERE etapa_id = ?', [etapa.id]);
    }
    await execute('DELETE FROM etapas_procedimento WHERE item_atendimento_id = ?', [parseInt(itemId!)]);
    await execute('DELETE FROM itens_atendimento WHERE id = ?', [parseInt(itemId!)]);

    return NextResponse.json({ message: 'Item removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    return NextResponse.json(
      { error: 'Erro ao remover item' },
      { status: 500 }
    );
  }
}
