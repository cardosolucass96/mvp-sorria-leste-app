import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

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
  valor: number;
  valor_pago: number;
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
        i.valor,
        i.valor_pago,
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

    // Busca etapas com prontuários
    const etapas = await query(
      `SELECT e.*,
              u.nome as concluido_por_nome,
              pe.id as prontuario_id,
              pe.descricao as prontuario_descricao,
              pe.observacoes as prontuario_observacoes,
              pe.created_at as prontuario_created_at,
              pu.nome as prontuario_autor
       FROM etapas_procedimento e
       LEFT JOIN usuarios u ON e.concluido_por_id = u.id
       LEFT JOIN prontuarios_etapa pe ON pe.etapa_id = e.id
       LEFT JOIN usuarios pu ON pe.usuario_id = pu.id
       WHERE e.item_atendimento_id = ?
       ORDER BY e.dente ASC, e.face ASC`,
      [parseInt(id)]
    );

    return NextResponse.json({ ...item, etapas });
  } catch (error) {
    console.error('Erro ao buscar item:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar item' },
      { status: 500 }
    );
  }
});
