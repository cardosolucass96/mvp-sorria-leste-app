import { NextRequest, NextResponse } from 'next/server';
import { execute, query, queryOne } from '@/lib/db';
import { withUnitRole, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import type { FollowupTarefaCompleta } from '@/lib/types';
import {
  getFollowupTaskDetail,
  isFollowupTipo,
  isValidResponsavelAtendente,
  normalizeDateTimeInput,
  normalizeRangeEnd,
  normalizeRangeStart,
  parseLocalDateTime,
} from './_helpers';

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function buildSummary(items: FollowupTarefaCompleta[]) {
  const now = new Date();
  return items.reduce(
    (acc, item) => {
      if (item.status === 'aberta') {
        acc.abertas += 1;
        const vencimento = parseLocalDateTime(item.vencimento_em);
        if (!vencimento) return acc;
        if (vencimento.getTime() < now.getTime()) {
          acc.atrasadas += 1;
        } else if (isSameLocalDay(vencimento, now)) {
          acc.vencem_hoje += 1;
        }
        return acc;
      }

      const concluidaEm = parseLocalDateTime(item.concluida_em);
      if (concluidaEm && isSameLocalDay(concluidaEm, now)) {
        acc.concluidas_hoje += 1;
      }
      return acc;
    },
    { abertas: 0, atrasadas: 0, vencem_hoje: 0, concluidas_hoje: 0 }
  );
}

// GET /api/followup - Lista tarefas de followup da unidade atual
export const GET = withUnitRole(['admin', 'atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const tipo = searchParams.get('tipo');
    const responsavelUsuarioId = searchParams.get('responsavel_usuario_id');
    const clienteId = searchParams.get('cliente_id');
    const busca = searchParams.get('busca');
    const vencimentoDe = normalizeRangeStart(searchParams.get('vencimento_de'));
    const vencimentoAte = normalizeRangeEnd(searchParams.get('vencimento_ate'));
    const mes = searchParams.get('mes');
    const dia = searchParams.get('dia');

    const conditions: string[] = ['f.unidade_id = ?', 'f.excluida_em IS NULL'];
    const params: Array<string | number> = [context.unidadeId];

    const statusList = (status || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statusList.length > 0) {
      conditions.push(`f.status IN (${statusList.map(() => '?').join(', ')})`);
      params.push(...statusList);
    }

    if (tipo) {
      conditions.push('f.tipo = ?');
      params.push(tipo);
    }
    if (responsavelUsuarioId) {
      conditions.push('f.responsavel_usuario_id = ?');
      params.push(parseInt(responsavelUsuarioId));
    }
    if (clienteId) {
      conditions.push('f.cliente_id = ?');
      params.push(parseInt(clienteId));
    }
    if (busca) {
      conditions.push('(c.nome LIKE ? OR f.titulo LIKE ? OR COALESCE(f.descricao, \'\') LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }
    if (vencimentoDe) {
      conditions.push('f.vencimento_em >= ?');
      params.push(vencimentoDe);
    }
    if (vencimentoAte) {
      conditions.push('f.vencimento_em <= ?');
      params.push(vencimentoAte);
    }
    if (mes) {
      conditions.push('substr(f.vencimento_em, 1, 7) = ?');
      params.push(mes);
    }
    if (dia) {
      conditions.push('substr(f.vencimento_em, 1, 10) = ?');
      params.push(dia);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const items = await query<FollowupTarefaCompleta>(
      `SELECT
        f.*,
        c.nome AS cliente_nome,
        c.telefone AS cliente_telefone,
        ru.nome AS responsavel_usuario_nome,
        cu.nome AS criado_por_nome,
        uu.nome AS concluida_por_nome
      FROM followup_tarefas f
      JOIN clientes c ON c.id = f.cliente_id
      JOIN usuarios ru ON ru.id = f.responsavel_usuario_id
      JOIN usuarios cu ON cu.id = f.criado_por_id
      LEFT JOIN usuarios uu ON uu.id = f.concluida_por_id
      ${whereClause}
      ORDER BY
        CASE WHEN f.status = 'aberta' THEN 0 ELSE 1 END,
        f.vencimento_em ASC,
        f.concluida_em DESC,
        f.created_at ASC`,
      params
    );

    return NextResponse.json({
      items,
      summary: buildSummary(items),
    });
  } catch (error) {
    console.error('Erro ao listar followups:', error);
    return NextResponse.json({ error: 'Erro ao listar followups' }, { status: 500 });
  }
});

// POST /api/followup - Cria tarefa de followup
export const POST = withUnitRole(['atendente'], async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const body = await request.json();
    const {
      cliente_id,
      responsavel_usuario_id,
      tipo,
      titulo,
      descricao,
      vencimento_em,
    } = body;

    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id é obrigatório' }, { status: 400 });
    }
    if (!responsavel_usuario_id) {
      return NextResponse.json({ error: 'responsavel_usuario_id é obrigatório' }, { status: 400 });
    }
    if (!isFollowupTipo(tipo)) {
      return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }
    if (typeof titulo !== 'string' || !titulo.trim()) {
      return NextResponse.json({ error: 'titulo é obrigatório' }, { status: 400 });
    }

    const vencimentoNormalizado = normalizeDateTimeInput(vencimento_em);
    if (!vencimentoNormalizado) {
      return NextResponse.json({ error: 'vencimento_em é obrigatório e deve ser válido' }, { status: 400 });
    }

    const cliente = await queryOne<{ id: number }>('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const responsavelValido = await isValidResponsavelAtendente(
      parseInt(String(responsavel_usuario_id)),
      context.unidadeId
    );
    if (!responsavelValido) {
      return NextResponse.json(
        { error: 'Responsável deve ser um atendente ativo da unidade atual' },
        { status: 400 }
      );
    }

    const result = await execute(
      `INSERT INTO followup_tarefas
        (cliente_id, unidade_id, responsavel_usuario_id, criado_por_id, tipo, titulo, descricao, status, vencimento_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'aberta', ?)`,
      [
        parseInt(String(cliente_id)),
        context.unidadeId,
        parseInt(String(responsavel_usuario_id)),
        context.user.sub,
        tipo,
        titulo.trim(),
        typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
        vencimentoNormalizado,
      ]
    );

    const created = await getFollowupTaskDetail(result.lastInsertRowid, context.unidadeId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar followup:', error);
    return NextResponse.json({ error: 'Erro ao criar followup' }, { status: 500 });
  }
});
