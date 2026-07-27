import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext, userHasAnyRole } from '@/lib/auth/middleware';
import { resolveVendedorPadraoParaAtendimento } from '@/lib/helpers/atendimentoDefaults';

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
  tem_face: number;
  categoria_id: number | null;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
  categoria_id: number | null;
  avaliador_id: number | null;
}

type VerificarResult =
  | { kind: 'error'; response: NextResponse }
  | { kind: 'ok'; atendimento: Atendimento };

type ValidarExecutorResult =
  | { kind: 'error'; response: NextResponse }
  | { kind: 'ok' };

const DEPENDENCIAS_ITEM_UPDATE = [
  {
    table: 'agendamentos',
    sql: 'UPDATE agendamentos SET item_atendimento_origem_id = NULL WHERE item_atendimento_origem_id = ?',
  },
] as const;

const DEPENDENCIAS_ITEM_DELETE = [
  {
    table: 'prontuario_evolucao_itens',
    sql: 'DELETE FROM prontuario_evolucao_itens WHERE item_atendimento_id = ?',
  },
  {
    table: 'movimentacoes_saldo',
    sql: 'DELETE FROM movimentacoes_saldo WHERE item_atendimento_id = ?',
  },
  {
    table: 'prontuarios',
    sql: 'DELETE FROM prontuarios WHERE item_atendimento_id = ?',
  },
  {
    table: 'anexos_execucao',
    sql: 'DELETE FROM anexos_execucao WHERE item_atendimento_id = ?',
  },
  {
    table: 'notas_execucao',
    sql: 'DELETE FROM notas_execucao WHERE item_atendimento_id = ?',
  },
  {
    table: 'comissoes',
    sql: 'DELETE FROM comissoes WHERE item_atendimento_id = ?',
  },
  {
    table: 'itens_atendimento_destinos',
    sql: 'DELETE FROM itens_atendimento_destinos WHERE item_atendimento_id = ?',
  },
  {
    table: 'pagamentos_alocacoes',
    sql: 'DELETE FROM pagamentos_alocacoes WHERE item_atendimento_id = ?',
  },
  {
    table: 'pagamentos_itens',
    sql: 'DELETE FROM pagamentos_itens WHERE item_atendimento_id = ?',
  },
] as const;

async function verificarAtendimentoUnidade(atendimentoId: number, unidadeId: number): Promise<VerificarResult> {
  const at = await queryOne<Atendimento>(
    'SELECT id, status, unidade_id, categoria_id, avaliador_id FROM atendimentos WHERE id = ?',
    [atendimentoId]
  );
  if (!at) return { kind: 'error', response: NextResponse.json({ error: 'Atendimento não encontrado' }, { status: 404 }) };
  if (at.unidade_id !== unidadeId) return { kind: 'error', response: NextResponse.json({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 }) };
  return { kind: 'ok', atendimento: at };
}

async function validarExecutorSelecionado(
  executorId: number,
  categoriaId: number | null
): Promise<ValidarExecutorResult> {
  const executor = await queryOne<{ id: number; role: string }>(
    'SELECT id, role FROM usuarios WHERE id = ? AND ativo = 1',
    [executorId]
  );

  if (!executor) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { error: 'Executor não encontrado' },
        { status: 404 }
      ),
    };
  }

  let roles = [executor.role];
  try {
    const rolesRows = await query<{ role: string }>(
      'SELECT role FROM usuario_roles WHERE usuario_id = ?',
      [executorId]
    );
    if (rolesRows.length > 0) {
      roles = rolesRows.map((row) => row.role);
    }
  } catch {
    // Tabela usuario_roles ainda não existe — usar role primária.
  }

  if (roles.includes('admin')) {
    return { kind: 'ok' };
  }

  const rolesEfetivas = roles.filter((role) => role !== 'admin');

  if (categoriaId) {
    try {
      const categoriaRoles = await query<{ role: string }>(
        'SELECT role FROM categoria_roles WHERE categoria_id = ?',
        [categoriaId]
      );
      if (categoriaRoles.length > 0) {
        const allowedRoles = categoriaRoles
          .map((row) => row.role)
          .filter((role) => role !== 'admin');
        if (rolesEfetivas.some((role) => allowedRoles.includes(role))) {
          return { kind: 'ok' };
        }

        return {
          kind: 'error',
          response: NextResponse.json(
            { error: 'Executor não tem permissão para esta categoria' },
            { status: 400 }
          ),
        };
      }
    } catch {
      // Tabela categoria_roles ainda não existe — cai no fallback legado abaixo.
    }
  }

  if (rolesEfetivas.includes('executor') || rolesEfetivas.includes('ortodontista')) {
    return { kind: 'ok' };
  }

  return {
    kind: 'error',
    response: NextResponse.json(
      { error: 'Usuário selecionado não é executor' },
      { status: 400 }
    ),
  };
}

async function tabelaExiste(
  tableName: string,
  cache: Map<string, boolean>
): Promise<boolean> {
  const cached = cache.get(tableName);
  if (cached !== undefined) {
    return cached;
  }

  const tabela = await queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  const exists = !!tabela;
  cache.set(tableName, exists);
  return exists;
}

async function removerDependenciasItem(
  itemId: number,
  tabelasDisponiveis: Map<string, boolean>
) {
  for (const dependencia of DEPENDENCIAS_ITEM_UPDATE) {
    if (await tabelaExiste(dependencia.table, tabelasDisponiveis)) {
      await execute(dependencia.sql, [itemId]);
    }
  }

  for (const dependencia of DEPENDENCIAS_ITEM_DELETE) {
    if (await tabelaExiste(dependencia.table, tabelasDisponiveis)) {
      await execute(dependencia.sql, [itemId]);
    }
  }
}

// GET /api/atendimentos/[id]/itens - Lista itens do atendimento
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const result = await verificarAtendimentoUnidade(parseInt(id as string), context.unidadeId);
    if (result.kind === 'error') return result.response;

    const itens = await query<ItemAtendimento & { procedimento_nome: string; executor_nome: string | null; criado_por_nome: string | null }>(
      `SELECT
        i.*,
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
      [parseInt(id as string)]
    );

    return NextResponse.json(itens);
  } catch (error) {
    console.error('Erro ao buscar itens:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar itens' },
      { status: 500 }
    );
  }
});

// POST /api/atendimentos/[id]/itens - Adiciona item ao atendimento
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const body = await request.json();
    const { procedimento_id, executor_id, criado_por_id, valor, dentes, quantidade, observacoes } = body;

    // Verifica se atendimento existe e pertence à unidade
    const result = await verificarAtendimentoUnidade(parseInt(id as string), context.unidadeId);
    if (result.kind === 'error') return result.response;
    const atendimento = result.atendimento;
    
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

    // Validação / herança de categoria
    if (atendimento.categoria_id && procedimento.categoria_id &&
        atendimento.categoria_id !== procedimento.categoria_id) {
      return NextResponse.json(
        { error: 'Procedimento não pertence à categoria deste atendimento' },
        { status: 400 }
      );
    }
    // Se atendimento ainda não tem categoria, herda do procedimento (primeiro item)
    if (!atendimento.categoria_id && procedimento.categoria_id) {
      await execute(
        'UPDATE atendimentos SET categoria_id = ? WHERE id = ? AND categoria_id IS NULL',
        [procedimento.categoria_id, parseInt(id as string)]
      );
      atendimento.categoria_id = procedimento.categoria_id;
    }

    const isAddDuringExecucao = atendimento.status === 'em_execucao';
    const usuarioAtualId = Number(context.user.sub);
    const executorSolicitado = Number.isInteger(Number(executor_id)) && Number(executor_id) > 0
      ? Number(executor_id)
      : null;
    const executorFinal = isAddDuringExecucao ? usuarioAtualId : executorSolicitado;

    // Verifica executor se fornecido; em execução, o executor é sempre quem criou o acréscimo.
    if (executorFinal) {
      const validacaoExecutor = await validarExecutorSelecionado(executorFinal, atendimento.categoria_id);
      if (validacaoExecutor.kind === 'error') return validacaoExecutor.response;
    }
    
    // Usa valor do procedimento se não fornecido; quando enviado, precisa ser
    // um valor financeiro válido e nunca negativo.
    const valorFinal = valor !== undefined ? Number(valor) : Number(procedimento.valor);
    if (!Number.isFinite(valorFinal) || valorFinal < 0) {
      return NextResponse.json(
        { error: 'Valor inválido' },
        { status: 400 }
      );
    }
    const quantidadeFinal = quantidade || 1;
    const criadoPorSolicitado = Number.isInteger(criado_por_id) && Number(criado_por_id) > 0
      ? Number(criado_por_id)
      : null;
    const shouldResolverVendedorPadrao = ['triagem', 'avaliacao'].includes(atendimento.status)
      && (!criadoPorSolicitado || criadoPorSolicitado === usuarioAtualId);
    const criadoPorFinal = isAddDuringExecucao
      ? usuarioAtualId
      : shouldResolverVendedorPadrao
      ? await resolveVendedorPadraoParaAtendimento(atendimento, context.user.sub)
      : criadoPorSolicitado ?? Number(context.user.sub);

    interface DenteFaceDB { dente: string; faces: Array<{ nome: string }> }
    let dentesArray: DenteFaceDB[] = [];
    if (dentes) {
      try {
        const parsed = JSON.parse(dentes);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
          dentesArray = parsed;
        }
      } catch {
        // dentes is a plain string (legacy format) — skip per-dente logic
      }
    }

    if (procedimento.por_dente && procedimento.tem_face) {
      const algumSemFace = dentesArray.some((item) => !Array.isArray(item.faces) || item.faces.length === 0);
      if (dentesArray.length === 0 || algumSemFace) {
        return NextResponse.json(
          { error: 'Selecione ao menos uma face para cada dente' },
          { status: 400 }
        );
      }
    }

    // Itens adicionados durante execução entram direto na fila do executor:
    // - status = 'pago' (visível para o executor sem precisar passar pelo pagamento)
    // - valor_pago = 0 (será cobrado depois, ao final do atendimento)
    // - adicionado_em_execucao = 1 (flag para o fluxo de finalização verificar e voltar para aguardando_pagamento)
    const statusItemInicial = isAddDuringExecucao ? 'pago' : 'pendente';
    const adicionadoEmExecucaoFlag = isAddDuringExecucao ? 1 : 0;

    // Fluxo por_dente: cria 1 item por dente com group_id compartilhado.
    // Faces (quando presentes) ficam apenas no JSON `dentes` do item.
    if (procedimento.por_dente && dentesArray.length > 0) {
      const groupId = randomUUID();
      const valorPorDente = valorFinal / dentesArray.length;
      const itemIds: number[] = [];

      for (const d of dentesArray) {
        const res = await execute(
          `INSERT INTO itens_atendimento
            (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, valor_final, desconto_valor, dentes, quantidade, group_id, dente_unico, observacoes, status, adicionado_em_execucao)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?)`,
          [
            parseInt(id as string),
            procedimento_id,
            executorFinal,
            criadoPorFinal,
            valorPorDente,
            valorPorDente, // valor_original = snapshot do valor inicial
            valorPorDente,
            JSON.stringify([d]),
            groupId,
            d.dente,
            observacoes || null,
            statusItemInicial,
            adicionadoEmExecucaoFlag,
          ]
        );
        const itemId = res.lastInsertRowid as number;
        itemIds.push(itemId);
      }

      return NextResponse.json({ group_id: groupId, itens: itemIds, adicionado_em_execucao: adicionadoEmExecucaoFlag }, { status: 201 });
    }

    // Fluxo original para procedimentos NÃO por_dente
    const insertResult = await execute(
      `INSERT INTO itens_atendimento
        (atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, valor_final, desconto_valor, dentes, quantidade, observacoes, status, adicionado_em_execucao)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [
        parseInt(id as string),
        procedimento_id,
        executorFinal,
        criadoPorFinal,
        valorFinal,
        valorFinal, // valor_original = snapshot do valor inicial
        valorFinal,
        dentes || null,
        quantidadeFinal,
        observacoes || null,
        statusItemInicial,
        adicionadoEmExecucaoFlag,
      ]
    );

    const itemId = insertResult.lastInsertRowid as number;

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
});

// DELETE /api/atendimentos/[id]/itens - Remove item ou grupo (só na avaliação)
export const DELETE = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');
    const groupId = searchParams.get('group_id');

    if (!itemId && !groupId) {
      return NextResponse.json(
        { error: 'item_id ou group_id é obrigatório' },
        { status: 400 }
      );
    }

    // Verifica se atendimento existe e pertence à unidade
    const result = await verificarAtendimentoUnidade(parseInt(id as string), context.unidadeId);
    if (result.kind === 'error') return result.response;
    const atendimento = result.atendimento;

    if (!['triagem', 'avaliacao'].includes(atendimento.status)) {
      return NextResponse.json(
        { error: 'Só é possível remover procedimentos durante a triagem ou avaliação' },
        { status: 400 }
      );
    }

    if (atendimento.status === 'triagem' && !userHasAnyRole(context.user, ['admin', 'atendente'])) {
      return NextResponse.json(
        { error: 'Acesso não autorizado para este perfil' },
        { status: 403 }
      );
    }

    // Determina quais itens remover
    let itensParaRemover: { id: number }[];

    if (groupId) {
      itensParaRemover = await query<{ id: number }>(
        'SELECT id FROM itens_atendimento WHERE group_id = ? AND atendimento_id = ?',
        [groupId, parseInt(id as string)]
      );
      if (itensParaRemover.length === 0) {
        return NextResponse.json({ error: 'Grupo não encontrado' }, { status: 404 });
      }
    } else {
      const item = await queryOne<{ id: number }>(
        'SELECT id FROM itens_atendimento WHERE id = ? AND atendimento_id = ?',
        [parseInt(itemId!), parseInt(id as string)]
      );
      if (!item) {
        return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
      }
      itensParaRemover = [item];
    }

    const tabelasDisponiveis = new Map<string, boolean>();

    for (const item of itensParaRemover) {
      await removerDependenciasItem(item.id, tabelasDisponiveis);
      await execute('DELETE FROM itens_atendimento WHERE id = ?', [item.id]);
    }

    return NextResponse.json({
      message: groupId
        ? `${itensParaRemover.length} itens do grupo removidos`
        : 'Item removido com sucesso',
    });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    return NextResponse.json(
      { error: 'Erro ao remover item' },
      { status: 500 }
    );
  }
});
