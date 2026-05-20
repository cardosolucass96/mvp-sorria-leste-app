import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  status: string;
  created_at: string;
  finalizado_at: string | null;
}

interface AtendimentoComCliente extends Atendimento {
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  avaliador_nome: string | null;
  procedimentos_resumo: string | null;
  executores_resumo: string | null;
  liberado_em: string | null;
}

interface CountResult {
  count: number;
}

interface SumResult {
  total: number;
}

// GET /api/atendimentos - Lista atendimentos da unidade atual
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const clienteId = searchParams.get('cliente_id');
    const busca = searchParams.get('busca');

    let sql = `
      SELECT
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome,
        (SELECT GROUP_CONCAT(nome, ', ') FROM (
           SELECT DISTINCT p.nome FROM itens_atendimento ia
           JOIN procedimentos p ON ia.procedimento_id = p.id
           WHERE ia.atendimento_id = a.id)) as procedimentos_resumo,
        (SELECT GROUP_CONCAT(nome, ', ') FROM (
           SELECT DISTINCT u2.nome FROM itens_atendimento ia
           JOIN usuarios u2 ON ia.executor_id = u2.id
           WHERE ia.atendimento_id = a.id)) as executores_resumo
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
    `;

    const conditions: string[] = ['a.unidade_id = ?'];
    const params: (string | number)[] = [context.unidadeId];

    // Filtro por status
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    // Filtro por cliente
    if (clienteId) {
      conditions.push('a.cliente_id = ?');
      params.push(parseInt(clienteId));
    }

    // Busca por nome do cliente
    if (busca) {
      conditions.push('(c.nome LIKE ? OR c.cpf LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }

    sql += ' WHERE ' + conditions.join(' AND ');

    sql += ' ORDER BY a.created_at DESC';

    const atendimentos = await query<AtendimentoComCliente>(sql, params);

    return NextResponse.json(atendimentos);
  } catch (error) {
    console.error('Erro ao buscar atendimentos:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atendimentos' },
      { status: 500 }
    );
  }
});

// POST /api/atendimentos - Cria novo atendimento na unidade atual
export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const body = await request.json();
    const { cliente_id, avaliador_id, tipo_orto, executor_id, procedimento_id, valor, criado_por_id, categoria_id, categoria_slug } = body;
    
    // Validações
    if (!cliente_id) {
      return NextResponse.json(
        { error: 'Cliente é obrigatório' },
        { status: 400 }
      );
    }
    
    // Verifica se cliente existe
    const cliente = await queryOne<{ id: number }>(
      'SELECT id FROM clientes WHERE id = ?',
      [cliente_id]
    );
    
    if (!cliente) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }
    
    // Verifica se cliente já tem atendimento em aberto na mesma unidade
    const atendimentoAberto = await queryOne<CountResult>(
      `SELECT COUNT(*) as count FROM atendimentos
       WHERE cliente_id = ? AND status NOT IN ('finalizado', 'encerrado') AND unidade_id = ?`,
      [cliente_id, context.unidadeId]
    );
    
    if (atendimentoAberto && atendimentoAberto.count > 0) {
      return NextResponse.json(
        { error: 'Cliente já possui atendimento em aberto' },
        { status: 400 }
      );
    }

    // Resolve categoria: por id explícito, por slug, ou por flag legada tipo_orto
    interface CategoriaRow { id: number; slug: string; pula_avaliacao: number }
    let categoriaResolvida: CategoriaRow | null = null;
    if (categoria_id) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        'SELECT id, slug, pula_avaliacao FROM categorias WHERE id = ? AND ativo = 1',
        [categoria_id]
      );
      if (!categoriaResolvida) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 });
      }
    } else if (categoria_slug) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        'SELECT id, slug, pula_avaliacao FROM categorias WHERE slug = ? AND ativo = 1',
        [categoria_slug]
      );
      if (!categoriaResolvida) {
        return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 });
      }
    } else if (tipo_orto) {
      categoriaResolvida = await queryOne<CategoriaRow>(
        "SELECT id, slug, pula_avaliacao FROM categorias WHERE slug = 'orto'"
      );
    }
    const categoriaIdFinal = categoriaResolvida?.id ?? null;
    const pulaAvaliacao = categoriaResolvida?.pula_avaliacao === 1 || !!tipo_orto;

    // Verifica avaliador se fornecido (fluxo normal)
    if (avaliador_id && !tipo_orto) {
      const avaliador = await queryOne<{ id: number; role: string }>(
        'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
        [avaliador_id]
      );
      
      if (!avaliador) {
        return NextResponse.json(
          { error: 'Avaliador não encontrado' },
          { status: 404 }
        );
      }
      
      if (avaliador.role !== 'avaliador' && avaliador.role !== 'admin') {
        return NextResponse.json(
          { error: 'Usuário selecionado não é avaliador' },
          { status: 400 }
        );
      }
    }
    
    // === FLUXO CATEGORIA COM pula_avaliacao (antes: apenas orto) ===
    if (pulaAvaliacao) {
      if (!procedimento_id) {
        return NextResponse.json(
          { error: 'Procedimento é obrigatório para atendimento orto' },
          { status: 400 }
        );
      }

      // executor_id é opcional — se não informado, fica disponível para alguém assumir
      if (executor_id) {
        const executor = await queryOne<{ id: number; role: string }>(
          'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
          [executor_id]
        );
        if (!executor) {
          return NextResponse.json({ error: 'Executor não encontrado' }, { status: 404 });
        }
      }

      // criado_por_id: usa executor se informado, senão usa quem criou (passado pelo frontend)
      const criadoPorId = executor_id || criado_por_id;
      if (!criadoPorId) {
        return NextResponse.json(
          { error: 'Não foi possível identificar o criador do atendimento' },
          { status: 400 }
        );
      }

      // Verifica procedimento
      const procedimento = await queryOne<{ id: number; valor: number; nome: string }>(
        'SELECT id, valor, nome FROM procedimentos WHERE id = ? AND ativo = 1',
        [procedimento_id]
      );
      if (!procedimento) {
        return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
      }

      const valorFinal = valor || procedimento.valor;

      // Cria atendimento já em aguardando_pagamento
      // NOTE: mantém `tipo='orto'` quando categoria for orto para compat com código legado que ainda lê tipo.
      const tipoLegado = categoriaResolvida?.slug === 'orto' ? 'orto' : 'normal';
      const result = await execute(
        `INSERT INTO atendimentos (cliente_id, avaliador_id, status, observacoes, unidade_id, categoria_id, tipo)
         VALUES (?, NULL, 'aguardando_pagamento', ?, ?, ?, ?)`,
        [cliente_id, 'Atendimento Orto', context.unidadeId, categoriaIdFinal, tipoLegado]
      );

      const atendimentoId = result.lastInsertRowid;

      // Cria item — executor_id pode ser null (disponível para alguém assumir)
      await execute(
        `INSERT INTO itens_atendimento (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, quantidade, status)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'pendente')`,
        [atendimentoId, procedimento_id, executor_id || null, criadoPorId, valorFinal, valorFinal]
      );
      
      // Busca atendimento criado
      const novoAtendimento = await queryOne<AtendimentoComCliente>(
        `SELECT 
          a.*,
          c.nome as cliente_nome,
          c.cpf as cliente_cpf,
          c.telefone as cliente_telefone,
          NULL as avaliador_nome
        FROM atendimentos a
        INNER JOIN clientes c ON a.cliente_id = c.id
        WHERE a.id = ?`,
        [atendimentoId]
      );
      
      return NextResponse.json(novoAtendimento, { status: 201 });
    }
    
    // === FLUXO NORMAL ===
    // Cria atendimento com status inicial 'triagem'
    const result = await execute(
      `INSERT INTO atendimentos (cliente_id, avaliador_id, status, unidade_id, categoria_id)
       VALUES (?, ?, 'triagem', ?, ?)`,
      [cliente_id, avaliador_id || null, context.unidadeId, categoriaIdFinal]
    );
    
    // Busca atendimento criado com dados do cliente
    const novoAtendimento = await queryOne<AtendimentoComCliente>(
      `SELECT 
        a.*,
        c.nome as cliente_nome,
        c.cpf as cliente_cpf,
        c.telefone as cliente_telefone,
        u.nome as avaliador_nome
      FROM atendimentos a
      INNER JOIN clientes c ON a.cliente_id = c.id
      LEFT JOIN usuarios u ON a.avaliador_id = u.id
      WHERE a.id = ?`,
      [result.lastInsertRowid]
    );
    
    return NextResponse.json(novoAtendimento, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar atendimento' },
      { status: 500 }
    );
  }
});
