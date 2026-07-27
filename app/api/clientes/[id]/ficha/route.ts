import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { garantirEsquemaFormasPagamento } from '@/lib/helpers/formasPagamento';
import { garantirCamposEmpresaUnidades } from '@/lib/helpers/unidadesEmpresa';
import { isRestrictedDentistPatientView } from '@/lib/auth/patientPrivacy';
import { garantirProntuarioEvolucoesSchema } from '@/lib/helpers/garantirProntuarioEvolucoesSchema';

const FINANCIAL_HISTORY_TYPES = new Set([
  'pagamento',
  'credito',
  'debito',
  'estorno',
  'transferencia_saida',
  'transferencia_entrada',
]);

interface ProntuarioEvolucaoRow {
  evolucao_id: number;
  atendimento_id: number;
  prontuario_id: number | null;
  prontuario_descricao: string;
  prontuario_observacoes: string | null;
  prontuario_data: string;
  prontuario_updated_at: string;
  prontuario_autor: string | null;
  item_id: number;
  concluido_at: string | null;
  dentes: string | null;
  quantidade: number;
  item_observacoes: string | null;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
}

// GET /api/clientes/[id]/ficha - Retorna dados completos do cliente para a ficha
export const GET = withAuth(async (_request, context) => {
  try {
    const params = await context.params!;
    const id = params.id as string;
    const clienteId = parseInt(id);
    await garantirCamposEmpresaUnidades();
    await garantirEsquemaFormasPagamento();
    await garantirProntuarioEvolucoesSchema();

    const cliente = await queryOne('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    // Atendimentos (com totais calculados e nome da unidade)
    const atendimentos = await query(
      `SELECT a.*,
              u.nome as avaliador_nome,
              un.nome as unidade_nome,
              un.razao_social as unidade_razao_social,
              un.cnpj as unidade_cnpj,
              un.endereco as unidade_endereco,
              un.telefone as unidade_telefone,
              un.email as unidade_email,
              un.responsavel as unidade_responsavel,
              un.recibo_rodape as unidade_recibo_rodape,
              COALESCE(SUM(i.valor), 0) as total,
              COALESCE(SUM(i.valor_pago), 0) as total_pago
       FROM atendimentos a
       LEFT JOIN usuarios u ON a.avaliador_id = u.id
       LEFT JOIN unidades un ON a.unidade_id = un.id
       LEFT JOIN itens_atendimento i ON i.atendimento_id = a.id
       WHERE a.cliente_id = ?
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [clienteId]
    );

    // Procedimentos (itens de todos os atendimentos)
    const procedimentos = await query(
      `SELECT i.id, i.atendimento_id, i.valor, i.valor_final, i.valor_pago, i.adicionado_em_execucao, i.status,
              i.dentes, i.dente_unico, i.group_id, i.quantidade, i.observacoes, i.created_at, i.concluido_at,
              p.nome as procedimento_nome,
              i.etapa_label,
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
              pg.forma_pagamento_id,
              pg.forma_pagamento_grupo_snapshot,
              pg.forma_pagamento_subgrupo_snapshot,
              pg.taxa_percentual_snapshot,
              pg.taxa_fixa_snapshot,
              pg.valor_taxa,
              pg.valor_liquido,
              a.unidade_id,
              un.nome as unidade_nome,
              un.razao_social as unidade_razao_social,
              un.cnpj as unidade_cnpj,
              un.endereco as unidade_endereco,
              un.telefone as unidade_telefone,
              un.email as unidade_email,
              un.responsavel as unidade_responsavel,
              un.recibo_rodape as unidade_recibo_rodape,
              u.nome as recebido_por_nome
       FROM pagamentos pg
       INNER JOIN atendimentos a ON pg.atendimento_id = a.id
       LEFT JOIN unidades un ON a.unidade_id = un.id
       LEFT JOIN usuarios u ON pg.recebido_por_id = u.id
       WHERE a.cliente_id = ?
       ORDER BY pg.created_at DESC`,
      [clienteId]
    );

    const pagamentosAlocacoes = await query(
      `SELECT
         pa.id,
         pa.pagamento_id,
         pg.pagamento_grupo_id,
         pa.item_atendimento_id,
         pa.agendamento_id,
         pa.etapa_modelo_id,
         pa.valor_alocado,
         COALESCE(p_item.nome, p_ag.nome, 'Procedimento') as procedimento_nome,
         COALESCE(etapa.nome, i.etapa_label) as etapa_label,
         i.dentes,
         i.dente_unico,
         i.quantidade,
         ag.data_agendada,
         ag.status as agendamento_status
       FROM pagamentos_alocacoes pa
       INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
       INNER JOIN atendimentos a ON pg.atendimento_id = a.id
       LEFT JOIN itens_atendimento i ON i.id = pa.item_atendimento_id
       LEFT JOIN procedimentos p_item ON p_item.id = i.procedimento_id
       LEFT JOIN agendamentos ag ON ag.id = pa.agendamento_id
       LEFT JOIN procedimentos p_ag ON p_ag.id = ag.procedimento_id
       LEFT JOIN procedimento_etapas_modelo etapa ON etapa.id = COALESCE(pa.etapa_modelo_id, ag.etapa_modelo_id, i.etapa_modelo_id)
       WHERE a.cliente_id = ?
       ORDER BY pa.created_at ASC, pa.id ASC`,
      [clienteId]
    );

    // Histórico — executado em queries separadas para evitar limite de compound SELECT do D1
    const [hCriados, hLiberados, hFinalizados, hPagamentos, hProcedimentos, hMovimentacoes] = await Promise.all([
      query(
        `SELECT 'atendimento_criado' as tipo, a.created_at as data,
                'Atendimento #' || a.id || ' criado (status: ' || a.status || ')' as descricao,
                a.id as ref_id
         FROM atendimentos a WHERE a.cliente_id = ?`,
        [clienteId]
      ),
      query(
        `SELECT 'liberado' as tipo, a.liberado_em as data,
                'Atendimento #' || a.id || ' liberado para execução' ||
                CASE WHEN u.nome IS NOT NULL THEN ' por ' || u.nome ELSE '' END as descricao,
                a.id as ref_id
         FROM atendimentos a
         LEFT JOIN usuarios u ON a.liberado_por_id = u.id
         WHERE a.cliente_id = ? AND a.liberado_em IS NOT NULL`,
        [clienteId]
      ),
      query(
        `SELECT 'finalizado' as tipo, a.finalizado_at as data,
                'Atendimento #' || a.id || ' finalizado' as descricao,
                a.id as ref_id
         FROM atendimentos a
         WHERE a.cliente_id = ? AND a.finalizado_at IS NOT NULL`,
        [clienteId]
      ),
      query(
        `SELECT 'pagamento' as tipo, pg.created_at as data,
                'Pagamento de R$ ' || printf('%.2f', pg.valor) ||
                ' registrado no atendimento #' || a.id ||
                CASE WHEN pg.cancelado = 1 THEN ' (cancelado)' ELSE '' END as descricao,
                pg.atendimento_id as ref_id
         FROM pagamentos pg
         INNER JOIN atendimentos a ON pg.atendimento_id = a.id
         WHERE a.cliente_id = ?`,
        [clienteId]
      ),
      query(
        `SELECT 'procedimento' as tipo, i.created_at as data,
                'Procedimento "' || p.nome || '" adicionado ao atendimento #' || a.id as descricao,
                a.id as ref_id
         FROM itens_atendimento i
         INNER JOIN atendimentos a ON i.atendimento_id = a.id
         INNER JOIN procedimentos p ON i.procedimento_id = p.id
         WHERE a.cliente_id = ?`,
        [clienteId]
      ),
      query(
        `SELECT ms.tipo as tipo, ms.created_at as data,
                ms.observacoes as descricao,
                COALESCE(ms.item_atendimento_id, 0) as ref_id,
                ms.valor, ms.saldo_anterior, ms.saldo_novo
         FROM movimentacoes_saldo ms
         WHERE ms.cliente_id = ?
         ORDER BY ms.created_at DESC`,
        [clienteId]
      ),
    ]);
    const historico = [
      ...hCriados, ...hLiberados, ...hFinalizados,
      ...hPagamentos, ...hProcedimentos, ...hMovimentacoes,
    ].sort((a, b) => {
      const da = (a as { data: string }).data;
      const db2 = (b as { data: string }).data;
      return da > db2 ? -1 : da < db2 ? 1 : 0;
    });

    // Prontuários/evoluções — uma evolução pode documentar vários procedimentos.
    const prontuarioRows = await query<ProntuarioEvolucaoRow>(
      `SELECT
         pe.id as evolucao_id,
         pe.atendimento_id,
         pe.legacy_prontuario_id as prontuario_id,
         pe.descricao as prontuario_descricao,
         pe.observacoes as prontuario_observacoes,
         pe.created_at as prontuario_data,
         pe.updated_at as prontuario_updated_at,
         pu.nome as prontuario_autor,
         i.id as item_id,
         i.concluido_at,
         i.dentes,
         i.quantidade,
         i.observacoes as item_observacoes,
         p.nome as procedimento_nome,
         i.etapa_label,
         u.nome as executor_nome
       FROM prontuario_evolucoes pe
       INNER JOIN prontuario_evolucao_itens pei ON pei.evolucao_id = pe.id
       INNER JOIN itens_atendimento i ON i.id = pei.item_atendimento_id
       INNER JOIN atendimentos a ON i.atendimento_id = a.id
       INNER JOIN procedimentos p ON i.procedimento_id = p.id
       LEFT JOIN usuarios u ON i.executor_id = u.id
       LEFT JOIN usuarios pu ON pe.usuario_id = pu.id
       WHERE a.cliente_id = ? AND i.status = 'concluido'
       ORDER BY pe.created_at DESC, i.concluido_at DESC, i.id ASC`,
      [clienteId]
    );

    const prontuariosMap = new Map<number, ProntuarioEvolucaoRow & { itens: Array<{
      item_id: number;
      procedimento_nome: string;
      etapa_label: string | null;
      executor_nome: string | null;
      dentes: string | null;
      quantidade: number;
      item_observacoes: string | null;
      concluido_at: string | null;
    }> }>();

    for (const row of prontuarioRows) {
      const atual = prontuariosMap.get(row.evolucao_id) ?? {
        ...row,
        itens: [],
      };
      atual.itens.push({
        item_id: row.item_id,
        procedimento_nome: row.procedimento_nome,
        etapa_label: row.etapa_label,
        executor_nome: row.executor_nome,
        dentes: row.dentes,
        quantidade: row.quantidade,
        item_observacoes: row.item_observacoes,
        concluido_at: row.concluido_at,
      });
      prontuariosMap.set(row.evolucao_id, atual);
    }

    const prontuarios = Array.from(prontuariosMap.values()).map((evolucao) => ({
      ...evolucao,
      procedimento_nome: evolucao.itens.length > 1
        ? `${evolucao.itens.length} procedimentos`
        : evolucao.itens[0]?.procedimento_nome ?? evolucao.procedimento_nome,
      etapa_label: evolucao.itens.length > 1 ? null : evolucao.itens[0]?.etapa_label ?? null,
      executor_nome: evolucao.itens.length > 1 ? evolucao.prontuario_autor : evolucao.itens[0]?.executor_nome ?? evolucao.executor_nome,
      item_id: evolucao.itens[0]?.item_id ?? evolucao.item_id,
      concluido_at: evolucao.itens[0]?.concluido_at ?? evolucao.concluido_at,
      dentes: evolucao.itens.length > 1 ? null : evolucao.itens[0]?.dentes ?? null,
      quantidade: evolucao.itens.length > 1 ? evolucao.itens.length : evolucao.itens[0]?.quantidade ?? evolucao.quantidade,
      item_observacoes: evolucao.itens.length > 1 ? null : evolucao.itens[0]?.item_observacoes ?? null,
    }));

    const restrictedDentistView = isRestrictedDentistPatientView(context.user);
    const historicoFiltrado = restrictedDentistView
      ? historico.filter((evento) => !FINANCIAL_HISTORY_TYPES.has((evento as { tipo: string }).tipo))
      : historico;

    return NextResponse.json({
      atendimentos,
      procedimentos,
      pagamentos: restrictedDentistView ? [] : pagamentos,
      pagamentos_alocacoes: restrictedDentistView ? [] : pagamentosAlocacoes,
      historico: historicoFiltrado,
      prontuarios,
      movimentacoes: restrictedDentistView ? [] : hMovimentacoes,
    });
  } catch (error) {
    console.error('Erro ao buscar ficha:', error);
    return NextResponse.json({ error: 'Erro ao buscar ficha' }, { status: 500 });
  }
});
