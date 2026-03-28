import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface ItemAtendimento {
  id: number;
  valor: number;
  valor_pago: number;
  status: string;
}

interface Atendimento {
  id: number;
  status: string;
}

type MotivoSaida = 'sem_tratamento' | 'tratamento_completo' | 'continuacao';

// POST /api/atendimentos/[id]/finalizar - Finaliza atendimento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const atendimentoId = parseInt(id);

    const body = await request.json().catch(() => ({}));
    const motivo_saida: MotivoSaida = body.motivo_saida || 'tratamento_completo';

    // 1. Verificar se atendimento existe e está em execução
    const atendimentos = await query<Atendimento>(
      'SELECT id, status FROM atendimentos WHERE id = ?',
      [atendimentoId]
    );

    if (atendimentos.length === 0) {
      return NextResponse.json(
        { error: 'Atendimento não encontrado' },
        { status: 404 }
      );
    }

    const atendimento = atendimentos[0];

    if (atendimento.status !== 'em_execucao') {
      return NextResponse.json(
        { error: 'Atendimento não está em execução' },
        { status: 400 }
      );
    }

    // 2. Para 'sem_tratamento', pular todas as validações
    if (motivo_saida === 'sem_tratamento') {
      await execute(
        `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now', 'localtime'), motivo_saida = ? WHERE id = ?`,
        [motivo_saida, atendimentoId]
      );

      return NextResponse.json({
        success: true,
        message: 'Atendimento finalizado com sucesso',
      });
    }

    // 3. Verificar se todos os itens estão concluídos
    const itens = await query<ItemAtendimento>(
      `SELECT id, valor, valor_pago, status
       FROM itens_atendimento WHERE atendimento_id = ?`,
      [atendimentoId]
    );

    if (itens.length === 0) {
      return NextResponse.json(
        { error: 'Atendimento não possui procedimentos' },
        { status: 400 }
      );
    }

    const itensNaoConcluidos = itens.filter(i => i.status !== 'concluido');
    if (itensNaoConcluidos.length > 0) {
      return NextResponse.json(
        {
          error: 'Existem procedimentos não concluídos',
          pendentes: itensNaoConcluidos.length
        },
        { status: 400 }
      );
    }

    // 4. Verificar se todos os itens estão pagos
    const itensNaoPagos = itens.filter(i => i.valor_pago < i.valor);
    if (itensNaoPagos.length > 0) {
      const valorFaltante = itensNaoPagos.reduce((sum, i) => sum + (i.valor - i.valor_pago), 0);
      return NextResponse.json(
        {
          error: 'Existem procedimentos com pagamento pendente',
          valorFaltante
        },
        { status: 400 }
      );
    }

    // 5. Finalizar atendimento (comissões são geradas na execução de cada item)
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
}
