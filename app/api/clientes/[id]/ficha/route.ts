import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/clientes/[id]/ficha - Retorna dados completos do cliente para a ficha
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clienteId = parseInt(id);

    const cliente = await queryOne('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Atendimentos
    const atendimentos = await query(
      `SELECT a.*, u.nome as avaliador_nome
       FROM atendimentos a
       LEFT JOIN usuarios u ON a.avaliador_id = u.id
       WHERE a.cliente_id = ?
       ORDER BY a.created_at DESC`,
      [clienteId]
    );

    // Procedimentos (itens de todos os atendimentos)
    const procedimentos = await query(
      `SELECT i.id, i.atendimento_id, i.valor, i.valor_pago, i.status,
              i.dentes, i.quantidade, i.observacoes, i.created_at, i.concluido_at,
              p.nome as procedimento_nome,
              u.nome as executor_nome,
              c.nome as criado_por_nome
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON i.atendimento_id = a.id
       INNER JOIN procedimentos p ON i.procedimento_id = p.id
       LEFT JOIN usuarios u ON i.executor_id = u.id
       LEFT JOIN usuarios c ON i.criado_por_id = c.id
       WHERE a.cliente_id = ?
       ORDER BY i.created_at DESC`,
      [clienteId]
    );

    // Pagamentos (de todos os atendimentos, excluindo cancelados)
    const pagamentos = await query(
      `SELECT pg.id, pg.atendimento_id, pg.valor, pg.metodo, pg.observacoes,
              pg.cancelado, pg.motivo_cancelamento, pg.created_at,
              u.nome as recebido_por_nome
       FROM pagamentos pg
       INNER JOIN atendimentos a ON pg.atendimento_id = a.id
       LEFT JOIN usuarios u ON pg.recebido_por_id = u.id
       WHERE a.cliente_id = ?
       ORDER BY pg.created_at DESC`,
      [clienteId]
    );

    // Histórico — eventos derivados das tabelas existentes
    const historico = await query(
      `SELECT * FROM (
        SELECT 'atendimento_criado' as tipo, a.created_at as data,
               'Atendimento #' || a.id || ' criado (status: ' || a.status || ')' as descricao,
               a.id as ref_id
        FROM atendimentos a WHERE a.cliente_id = ?

        UNION ALL

        SELECT 'liberado', a.liberado_em,
               'Atendimento #' || a.id || ' liberado para execução' ||
               CASE WHEN u.nome IS NOT NULL THEN ' por ' || u.nome ELSE '' END,
               a.id
        FROM atendimentos a
        LEFT JOIN usuarios u ON a.liberado_por_id = u.id
        WHERE a.cliente_id = ? AND a.liberado_em IS NOT NULL

        UNION ALL

        SELECT 'finalizado', a.finalizado_at,
               'Atendimento #' || a.id || ' finalizado',
               a.id
        FROM atendimentos a
        WHERE a.cliente_id = ? AND a.finalizado_at IS NOT NULL

        UNION ALL

        SELECT 'pagamento', pg.created_at,
               'Pagamento de R$ ' || printf('%.2f', pg.valor) ||
               ' registrado no atendimento #' || a.id ||
               CASE WHEN pg.cancelado = 1 THEN ' (cancelado)' ELSE '' END,
               pg.atendimento_id
        FROM pagamentos pg
        INNER JOIN atendimentos a ON pg.atendimento_id = a.id
        WHERE a.cliente_id = ?

        UNION ALL

        SELECT 'procedimento', i.created_at,
               'Procedimento "' || p.nome || '" adicionado ao atendimento #' || a.id,
               a.id
        FROM itens_atendimento i
        INNER JOIN atendimentos a ON i.atendimento_id = a.id
        INNER JOIN procedimentos p ON i.procedimento_id = p.id
        WHERE a.cliente_id = ?

        UNION ALL

        SELECT 'etapa_concluida', e.concluido_at,
               'Etapa ' || e.face || ' do dente ' || e.dente ||
               ' concluída em "' || p.nome || '" (atend. #' || a.id || ')' ||
               CASE WHEN u.nome IS NOT NULL THEN ' por ' || u.nome ELSE '' END,
               a.id
        FROM etapas_procedimento e
        INNER JOIN itens_atendimento i ON e.item_atendimento_id = i.id
        INNER JOIN atendimentos a ON i.atendimento_id = a.id
        INNER JOIN procedimentos p ON i.procedimento_id = p.id
        LEFT JOIN usuarios u ON e.concluido_por_id = u.id
        WHERE a.cliente_id = ? AND e.concluido_at IS NOT NULL
      )
      ORDER BY data DESC`,
      [clienteId, clienteId, clienteId, clienteId, clienteId, clienteId]
    );

    // Itens de pagamento (quais procedimentos cada pagamento cobriu)
    const pagamentosItens = await query(
      `SELECT pi.pagamento_id, pi.item_atendimento_id, pi.valor_aplicado,
              p.nome as procedimento_nome
       FROM pagamentos_itens pi
       INNER JOIN pagamentos pg ON pi.pagamento_id = pg.id
       INNER JOIN atendimentos a ON pg.atendimento_id = a.id
       INNER JOIN itens_atendimento ia ON pi.item_atendimento_id = ia.id
       INNER JOIN procedimentos p ON ia.procedimento_id = p.id
       WHERE a.cliente_id = ?`,
      [clienteId]
    );

    // Prontuários — procedimentos concluídos com texto de prontuário
    const prontuarios = await query(
      `SELECT
         i.id as item_id,
         i.atendimento_id,
         i.concluido_at,
         i.dentes,
         i.quantidade,
         i.observacoes as item_observacoes,
         p.nome as procedimento_nome,
         u.nome as executor_nome,
         pr.id as prontuario_id,
         pr.descricao as prontuario_descricao,
         pr.observacoes as prontuario_observacoes,
         pr.created_at as prontuario_data,
         pr.updated_at as prontuario_updated_at,
         pu.nome as prontuario_autor
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON i.atendimento_id = a.id
       INNER JOIN procedimentos p ON i.procedimento_id = p.id
       LEFT JOIN usuarios u ON i.executor_id = u.id
       LEFT JOIN prontuarios pr ON pr.item_atendimento_id = i.id
       LEFT JOIN usuarios pu ON pr.usuario_id = pu.id
       WHERE a.cliente_id = ? AND i.status = 'concluido'
       ORDER BY i.concluido_at DESC`,
      [clienteId]
    );

    return NextResponse.json({ atendimentos, procedimentos, pagamentos, pagamentosItens, historico, prontuarios });
  } catch (error) {
    console.error('Erro ao buscar ficha:', error);
    return NextResponse.json({ error: 'Erro ao buscar ficha' }, { status: 500 });
  }
}
