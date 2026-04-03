import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { withUnit, UnitAuthenticatedContext } from '@/lib/auth/middleware';

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  status: string;
  valor: number;
  valor_pago: number;
  criado_por_id: number | null;
  executor_id: number | null;
}

interface Procedimento {
  id: number;
  comissao_venda: number;
  comissao_execucao: number;
}

interface Atendimento {
  id: number;
  status: string;
  unidade_id: number;
}

interface ComissaoDetalhe {
  tipo: string;
  usuario_id: number;
  valor: number;
}

type MotivoSaida = 'sem_tratamento' | 'tratamento_completo' | 'continuacao';

// POST /api/atendimentos/[id]/finalizar - Finaliza atendimento
export const POST = withUnit(async (
  request: NextRequest,
  context: UnitAuthenticatedContext
) => {
  try {
    const { id } = await context.params!;
    const atendimentoId = parseInt(id as string);

    const body = await request.json().catch(() => ({}));
    const motivo_saida: MotivoSaida = body.motivo_saida || 'tratamento_completo';

    // 1. Verificar se atendimento existe e pertence à unidade
    const atendimento = await queryOne<Atendimento>(
      'SELECT id, status, unidade_id FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    if (!atendimento) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    if (atendimento.unidade_id !== context.unidadeId) {
      return NextResponse.json(
        { error: 'Atendimento não pertence a esta unidade' },
        { status: 403 }
      );
    }

    if (atendimento.status !== 'em_execucao') {
      return NextResponse.json(
        { error: 'Atendimento não está em execução' },
        { status: 400 }
      );
    }

    // No novo fluxo, a transição em_execucao → finalizado é automática (via conclusão de itens).
    // Este endpoint existe apenas para o caso 'sem_tratamento' (saída sem procedimentos).
    if (motivo_saida !== 'sem_tratamento') {
      return NextResponse.json(
        { error: 'Use o fluxo normal: conclua os procedimentos para finalizar o atendimento' },
        { status: 400 }
      );
    }

    await execute(
      `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now', 'localtime'), motivo_saida = ? WHERE id = ?`,
      [motivo_saida, atendimentoId]
    );

    return NextResponse.json({
      success: true,
      message: 'Atendimento finalizado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao finalizar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao finalizar atendimento' },
      { status: 500 }
    );
  }
});
