import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext, getUserRoles } from '@/lib/auth/middleware';
import { isRestrictedDentistPatientView } from '@/lib/auth/patientPrivacy';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  executor_nome: string | null;
  criado_por_id: number | null;
  criado_por_nome: string | null;
  cliente_nome: string;
  cliente_id: number;
  categoria_id: number | null;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  adicionado_em_execucao: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  tem_etapas: number;
}

// GET /api/execucao/item/[id] - Busca um item de atendimento específico pelo ID
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const params = await context.params!;
    const id = params.id as string;

    const itens = await query<ItemAtendimento>(
      `SELECT
        i.id,
        i.atendimento_id,
        i.procedimento_id,
        p.nome as procedimento_nome,
        p.por_dente,
        i.executor_id,
        e.nome as executor_nome,
        i.criado_por_id,
        cp.nome as criado_por_nome,
        c.nome as cliente_nome,
        c.id as cliente_id,
        a.categoria_id,
        i.valor,
        i.valor_final,
        i.valor_pago,
        i.adicionado_em_execucao,
        i.dentes,
        i.quantidade,
        i.status,
        i.created_at,
        i.concluido_at,
        i.etapa_modelo_id,
        i.etapa_label,
        p.tem_etapas
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios e ON i.executor_id = e.id
      LEFT JOIN usuarios cp ON i.criado_por_id = cp.id
      WHERE i.id = ? AND a.unidade_id = ?`,
      [parseInt(id), context.unidadeId]
    );

    if (itens.length === 0) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
    }

    const item = itens[0];

    if (isRestrictedDentistPatientView(context.user) && item.executor_id !== context.user.sub) {
      if (item.executor_id !== null) {
        return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
      }

      const userRoles = getUserRoles(context.user);
      if (item.categoria_id) {
        const catRoles = await query<{ role: string }>(
          'SELECT role FROM categoria_roles WHERE categoria_id = ?',
          [item.categoria_id]
        );
        const allowed = catRoles.some((row) => userRoles.includes(row.role));
        if (!allowed) {
          return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
        }
      } else if (!userRoles.some((role) => role === 'executor' || role === 'ortodontista')) {
        return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
      }
    }

    return NextResponse.json({ ...item, etapas: [] });
  } catch (error) {
    console.error('Erro ao buscar item:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar item' },
      { status: 500 }
    );
  }
});
