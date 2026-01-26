import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

interface ItemAtendimento {
  id: number;
  valor: number;
  valor_pago: number;
  status: string;
  criado_por_id: number | null;
  executor_id: number | null;
  procedimento_id: number;
}

interface Procedimento {
  id: number;
  comissao_venda: number;
  comissao_execucao: number;
}

interface Atendimento {
  id: number;
  status: string;
}

// POST /api/atendimentos/[id]/finalizar - Finaliza atendimento e gera comissões
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const atendimentoId = parseInt(id);

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

    // 2. Verificar se todos os itens estão concluídos
    const itens = await query<ItemAtendimento>(
      `SELECT id, valor, valor_pago, status, criado_por_id, executor_id, procedimento_id
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

    // 3. Verificar se todos os itens estão pagos
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

    // 4. Gerar comissões para cada item
    const comissoesGeradas: Array<{
      tipo: string;
      usuario_id: number;
      valor: number;
    }> = [];

    for (const item of itens) {
      // Buscar % de comissão do procedimento
      const procedimentos = await query<Procedimento>(
        'SELECT id, comissao_venda, comissao_execucao FROM procedimentos WHERE id = ?',
        [item.procedimento_id]
      );

      if (procedimentos.length === 0) continue;

      const proc = procedimentos[0];

      // Comissão de venda (vai para quem criou o procedimento)
      if (item.criado_por_id && proc.comissao_venda > 0) {
        const valorComissaoVenda = item.valor * (proc.comissao_venda / 100);
        
        await execute(
          `INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao)
           VALUES (?, ?, ?, 'venda', ?, ?, ?)`,
          [atendimentoId, item.id, item.criado_por_id, proc.comissao_venda, item.valor, valorComissaoVenda]
        );

        comissoesGeradas.push({
          tipo: 'venda',
          usuario_id: item.criado_por_id,
          valor: valorComissaoVenda
        });
      }

      // Comissão de execução (vai para quem executou)
      if (item.executor_id && proc.comissao_execucao > 0) {
        const valorComissaoExecucao = item.valor * (proc.comissao_execucao / 100);
        
        await execute(
          `INSERT INTO comissoes (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao)
           VALUES (?, ?, ?, 'execucao', ?, ?, ?)`,
          [atendimentoId, item.id, item.executor_id, proc.comissao_execucao, item.valor, valorComissaoExecucao]
        );

        comissoesGeradas.push({
          tipo: 'execucao',
          usuario_id: item.executor_id,
          valor: valorComissaoExecucao
        });
      }
    }

    // 5. Finalizar atendimento
    await execute(
      `UPDATE atendimentos SET status = 'finalizado', finalizado_at = datetime('now', 'localtime') WHERE id = ?`,
      [atendimentoId]
    );

    // 6. Calcular totais de comissões
    const totalComissaoVenda = comissoesGeradas
      .filter(c => c.tipo === 'venda')
      .reduce((sum, c) => sum + c.valor, 0);
    
    const totalComissaoExecucao = comissoesGeradas
      .filter(c => c.tipo === 'execucao')
      .reduce((sum, c) => sum + c.valor, 0);

    return NextResponse.json({
      success: true,
      message: 'Atendimento finalizado com sucesso',
      comissoes: {
        venda: totalComissaoVenda,
        execucao: totalComissaoExecucao,
        total: totalComissaoVenda + totalComissaoExecucao,
        detalhes: comissoesGeradas
      }
    });
  } catch (error) {
    console.error('Erro ao finalizar atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao finalizar atendimento' },
      { status: 500 }
    );
  }
}
