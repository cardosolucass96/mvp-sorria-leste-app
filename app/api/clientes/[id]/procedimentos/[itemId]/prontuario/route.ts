import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext, userHasAnyRole } from '@/lib/auth/middleware';
import { garantirProntuarioEvolucoesSchema } from '@/lib/helpers/garantirProntuarioEvolucoesSchema';
import { nowUtcIso } from '@/lib/time';

const MIN_CARACTERES = 10;

interface ItemContexto {
  id: number;
  atendimento_id: number;
  unidade_id: number;
}

interface ProntuarioRegistro {
  id: number;
  item_atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  descricao: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  evolucao_id?: number;
  compartilhado?: boolean;
}

interface EvolucaoExistente {
  id: number;
  legacy_prontuario_id: number | null;
}

function parsePositiveInteger(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function podeGerenciarProntuario(context: UnitAuthenticatedContext): boolean {
  return userHasAnyRole(context.user, ['admin', 'atendente']);
}

async function buscarItemDoCliente(clienteId: number, itemId: number): Promise<ItemContexto | null> {
  return queryOne<ItemContexto>(
    `SELECT i.id, i.atendimento_id, a.unidade_id
     FROM itens_atendimento i
     INNER JOIN atendimentos a ON a.id = i.atendimento_id
     WHERE i.id = ? AND a.cliente_id = ?`,
    [itemId, clienteId]
  );
}

async function buscarEvolucaoDoItem(itemId: number): Promise<EvolucaoExistente | null> {
  return queryOne<EvolucaoExistente>(
    `SELECT pe.id, pe.legacy_prontuario_id
     FROM prontuario_evolucao_itens pei
     INNER JOIN prontuario_evolucoes pe ON pe.id = pei.evolucao_id
     WHERE pei.item_atendimento_id = ?`,
    [itemId]
  );
}

async function buscarProntuario(itemId: number): Promise<ProntuarioRegistro | null> {
  const evolucao = await queryOne<ProntuarioRegistro>(
    `SELECT
       pe.id,
       pei.item_atendimento_id,
       pe.usuario_id,
       u.nome as usuario_nome,
       pe.descricao,
       pe.observacoes,
       pe.created_at,
       pe.updated_at,
       pe.id as evolucao_id,
       CASE WHEN pe.legacy_prontuario_id IS NULL THEN 1 ELSE 0 END as compartilhado
     FROM prontuario_evolucao_itens pei
     INNER JOIN prontuario_evolucoes pe ON pe.id = pei.evolucao_id
     INNER JOIN usuarios u ON u.id = pe.usuario_id
     WHERE pei.item_atendimento_id = ?`,
    [itemId]
  );

  if (evolucao) {
    return {
      ...evolucao,
      compartilhado: Boolean(evolucao.compartilhado),
    };
  }

  return queryOne<ProntuarioRegistro>(
    `SELECT
       p.id,
       p.item_atendimento_id,
       p.usuario_id,
       u.nome as usuario_nome,
       p.descricao,
       p.observacoes,
       p.created_at,
       p.updated_at
     FROM prontuarios p
     INNER JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.item_atendimento_id = ?`,
    [itemId]
  );
}

async function validarAcesso(
  context: UnitAuthenticatedContext,
  clienteId: number,
  itemId: number
): Promise<{ item: ItemContexto } | NextResponse> {
  if (!podeGerenciarProntuario(context)) {
    return NextResponse.json({ error: 'Apenas administradores e atendentes podem gerenciar prontuários por esta tela' }, { status: 403 });
  }

  const item = await buscarItemDoCliente(clienteId, itemId);
  if (!item || item.unidade_id !== context.unidadeId) {
    return NextResponse.json({ error: 'Procedimento não encontrado' }, { status: 404 });
  }

  return { item };
}

// GET /api/clientes/[id]/procedimentos/[itemId]/prontuario
export const GET = withUnit(async (_request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params! as { id?: string | string[]; itemId?: string | string[] };
    const clienteId = parsePositiveInteger(params.id);
    const itemId = parsePositiveInteger(params.itemId);

    if (!clienteId || !itemId) {
      return NextResponse.json({ error: 'Cliente ou procedimento inválido' }, { status: 400 });
    }

    const acesso = await validarAcesso(context, clienteId, itemId);
    if (acesso instanceof NextResponse) return acesso;
    await garantirProntuarioEvolucoesSchema();

    return NextResponse.json({ prontuario: await buscarProntuario(itemId) });
  } catch (error) {
    console.error('Erro ao buscar prontuário do procedimento:', error);
    return NextResponse.json({ error: 'Erro ao buscar prontuário do procedimento' }, { status: 500 });
  }
});

// POST /api/clientes/[id]/procedimentos/[itemId]/prontuario
export const POST = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params! as { id?: string | string[]; itemId?: string | string[] };
    const clienteId = parsePositiveInteger(params.id);
    const itemId = parsePositiveInteger(params.itemId);

    if (!clienteId || !itemId) {
      return NextResponse.json({ error: 'Cliente ou procedimento inválido' }, { status: 400 });
    }

    const acesso = await validarAcesso(context, clienteId, itemId);
    if (acesso instanceof NextResponse) return acesso;

    const body = await request.json() as { descricao?: unknown; observacoes?: unknown };
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : '';
    const observacoes = typeof body.observacoes === 'string' ? body.observacoes.trim() : '';

    if (descricao.length < MIN_CARACTERES) {
      return NextResponse.json(
        { error: `A descrição do prontuário deve ter no mínimo ${MIN_CARACTERES} caracteres` },
        { status: 400 }
      );
    }

    await garantirProntuarioEvolucoesSchema();

    const observacoesNormalizadas = observacoes || null;
    const now = nowUtcIso();
    const evolucaoExistente = await buscarEvolucaoDoItem(itemId);

    if (evolucaoExistente) {
      await execute(
        `UPDATE prontuario_evolucoes
         SET descricao = ?, observacoes = ?, updated_at = ?
         WHERE id = ?`,
        [descricao, observacoesNormalizadas, now, evolucaoExistente.id]
      );

      if (evolucaoExistente.legacy_prontuario_id !== null) {
        await execute(
          `UPDATE prontuarios
           SET descricao = ?, observacoes = ?, updated_at = ?
           WHERE id = ?`,
          [descricao, observacoesNormalizadas, now, evolucaoExistente.legacy_prontuario_id]
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Prontuário atualizado',
        prontuario: await buscarProntuario(itemId),
      });
    }

    const prontuarioExistente = await queryOne<{ id: number }>(
      'SELECT id FROM prontuarios WHERE item_atendimento_id = ?',
      [itemId]
    );

    if (prontuarioExistente) {
      await execute(
        `UPDATE prontuarios
         SET descricao = ?, observacoes = ?, updated_at = ?
         WHERE id = ?`,
        [descricao, observacoesNormalizadas, now, prontuarioExistente.id]
      );
    } else {
      await execute(
        `INSERT INTO prontuarios (item_atendimento_id, usuario_id, descricao, observacoes)
         VALUES (?, ?, ?, ?)`,
        [itemId, context.user.sub, descricao, observacoesNormalizadas]
      );
    }

    // Mantém os registros legados visíveis na estrutura de evoluções da ficha.
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
    `, [itemId]);

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
    `, [itemId]);

    return NextResponse.json({
      success: true,
      message: prontuarioExistente ? 'Prontuário atualizado' : 'Prontuário criado',
      prontuario: await buscarProntuario(itemId),
    });
  } catch (error) {
    console.error('Erro ao salvar prontuário do procedimento:', error);
    return NextResponse.json({ error: 'Erro ao salvar prontuário do procedimento' }, { status: 500 });
  }
});
