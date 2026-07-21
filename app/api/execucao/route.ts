import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';
import { isRestrictedDentistPatientView } from '@/lib/auth/patientPrivacy';

interface ProcedimentoExecucao {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  tem_etapas: number;
  executor_id: number | null;
  executor_nome: string | null;
  cliente_id: number;
  cliente_nome: string;
  status: string;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  adicionado_em_execucao: number;
  created_at: string;
  concluido_at: string | null;
  dente_unico: string | null;
}

// GET /api/execucao?executor_id=X - Lista PROCEDIMENTOS individuais para o executor na unidade atual
export const GET = withUnit(async (request: NextRequest, context: UnitAuthenticatedContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const executorId = searchParams.get('executor_id');

    if (!executorId) {
      return NextResponse.json(
        { error: 'executor_id é obrigatório' },
        { status: 400 }
      );
    }

    if (isRestrictedDentistPatientView(context.user) && parseInt(executorId, 10) !== context.user.sub) {
      return NextResponse.json({ error: 'Acesso não autorizado para este perfil' }, { status: 403 });
    }

    // Busca PROCEDIMENTOS PAGOS individuais:
    // 1. Já atribuídos ao executor (meus)
    // 2. Sem executor definido (disponíveis para pegar)
    const procedimentos = await query<ProcedimentoExecucao>(
      `SELECT
        i.id,
        i.atendimento_id,
        i.procedimento_id,
        p.nome as procedimento_nome,
        i.etapa_label,
        p.tem_etapas,
        i.executor_id,
        e.nome as executor_nome,
        c.id as cliente_id,
        c.nome as cliente_nome,
        i.status,
        i.valor,
        i.valor_final,
        i.valor_pago,
        i.adicionado_em_execucao,
        i.created_at,
        i.concluido_at,
        json_extract(i.dentes, '$[0].dente') as dente_unico
      FROM itens_atendimento i
      INNER JOIN atendimentos a ON i.atendimento_id = a.id
      INNER JOIN clientes c ON a.cliente_id = c.id
      INNER JOIN procedimentos p ON i.procedimento_id = p.id
      LEFT JOIN usuarios e ON i.executor_id = e.id
      WHERE a.status = 'em_execucao'
      AND a.unidade_id = ?
      AND i.status IN ('pago', 'executando')
      AND (i.executor_id = ? OR i.executor_id IS NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM agendamentos ag
        WHERE ag.item_atendimento_origem_id = i.id
          AND ag.unidade_id = a.unidade_id
          AND ag.status IN ('pendente', 'agendado')
      )
      ORDER BY
        CASE WHEN i.executor_id = ? THEN 0 ELSE 1 END,
        i.created_at DESC`,
      [context.unidadeId, parseInt(executorId), parseInt(executorId)]
    );

    // Separa em "meus" e "disponíveis"
    const meusProcedimentos = procedimentos.filter(p => p.executor_id === parseInt(executorId));
    const disponiveis = procedimentos.filter(p => p.executor_id === null);

    return NextResponse.json({
      meusProcedimentos,
      disponiveis
    });
  } catch (error) {
    console.error('Erro ao buscar procedimentos do executor:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar procedimentos' },
      { status: 500 }
    );
  }
});
