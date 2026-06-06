import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext, getUserRoles } from '@/lib/auth/middleware';
import { Categoria } from '@/lib/types';

interface ItemPainelTv {
  item_id: number;
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_id: number | null;
  executor_nome: string | null;
  status: string;
  entrou_na_fila_em: string;
}

// GET /api/painel-tv/[slug] - Lista fila agrupada por paciente para modo TV
export const GET = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { slug } = (await context.params) as { slug: string };

    const categoria = await queryOne<Categoria>(
      'SELECT * FROM categorias WHERE slug = ? AND ativo = 1',
      [slug]
    );

    if (!categoria) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    const userRoles = getUserRoles(context.user);
    const isFrontDesk = userRoles.includes('admin') || userRoles.includes('atendente');

    if (!isFrontDesk) {
      const catRoles = await query<{ role: string }>(
        'SELECT role FROM categoria_roles WHERE categoria_id = ?',
        [categoria.id]
      );
      const allowed = catRoles.some(cr => userRoles.includes(cr.role));
      if (!allowed) {
        return NextResponse.json({ error: 'Sem acesso a este painel' }, { status: 403 });
      }
    }

    const itens = await query<ItemPainelTv>(
      `SELECT
        i.id as item_id,
        i.atendimento_id,
        c.id as cliente_id,
        c.nome as cliente_nome,
        p.nome as procedimento_nome,
        i.etapa_label,
        i.executor_id,
        u.nome as executor_nome,
        i.status,
        i.created_at as entrou_na_fila_em
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON a.id = i.atendimento_id
      INNER JOIN clientes c ON c.id = a.cliente_id
      INNER JOIN procedimentos p ON p.id = i.procedimento_id
      LEFT JOIN usuarios u ON u.id = i.executor_id
      WHERE a.status = 'em_execucao'
        AND a.unidade_id = ?
        AND a.categoria_id = ?
        AND i.status IN ('pago', 'executando')
      ORDER BY i.created_at ASC, c.nome ASC`,
      [context.unidadeId, categoria.id]
    );

    const pacientesMap = new Map<number, {
      atendimento_id: number;
      cliente_id: number;
      cliente_nome: string;
      entrou_na_fila_em: string;
      doutores: Set<string>;
      procedimentos: Set<string>;
      quantidade_procedimentos: number;
      possui_procedimento_em_execucao: boolean;
    }>();

    for (const item of itens) {
      const existente = pacientesMap.get(item.atendimento_id);
      const procedimentoLabel = item.etapa_label
        ? `${item.procedimento_nome} - ${item.etapa_label}`
        : item.procedimento_nome;

      if (existente) {
        if (item.entrou_na_fila_em < existente.entrou_na_fila_em) {
          existente.entrou_na_fila_em = item.entrou_na_fila_em;
        }
        if (item.executor_nome) {
          existente.doutores.add(item.executor_nome);
        }
        existente.procedimentos.add(procedimentoLabel);
        existente.quantidade_procedimentos += 1;
        if (item.status === 'executando') {
          existente.possui_procedimento_em_execucao = true;
        }
        continue;
      }

      pacientesMap.set(item.atendimento_id, {
        atendimento_id: item.atendimento_id,
        cliente_id: item.cliente_id,
        cliente_nome: item.cliente_nome,
        entrou_na_fila_em: item.entrou_na_fila_em,
        doutores: new Set(item.executor_nome ? [item.executor_nome] : []),
        procedimentos: new Set([procedimentoLabel]),
        quantidade_procedimentos: 1,
        possui_procedimento_em_execucao: item.status === 'executando',
      });
    }

    const pacientes = Array.from(pacientesMap.values())
      .map((paciente) => ({
        atendimento_id: paciente.atendimento_id,
        cliente_id: paciente.cliente_id,
        cliente_nome: paciente.cliente_nome,
        entrou_na_fila_em: paciente.entrou_na_fila_em,
        doutores: Array.from(paciente.doutores).sort((a, b) => a.localeCompare(b)),
        procedimentos: Array.from(paciente.procedimentos).sort((a, b) => a.localeCompare(b)),
        quantidade_procedimentos: paciente.quantidade_procedimentos,
        possui_procedimento_em_execucao: paciente.possui_procedimento_em_execucao,
      }))
      .sort((a, b) => a.entrou_na_fila_em.localeCompare(b.entrou_na_fila_em));

    return NextResponse.json({
      categoria: {
        id: categoria.id,
        nome: categoria.nome,
        slug: categoria.slug,
        cor: categoria.cor,
        icone: categoria.icone,
      },
      pacientes,
      atualizado_em: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Erro ao buscar painel TV da fila:', error);
    return NextResponse.json({ error: 'Erro ao buscar painel TV da fila' }, { status: 500 });
  }
});
