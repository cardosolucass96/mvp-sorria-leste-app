import 'server-only';
import { query } from '@/lib/db';
import type { BaseItemRow, ActiveAgendamentoRow } from '../domain/dados';

export async function buscarOrigensOrcamentos(unidadeId: number) {
    const baseItems = await query<BaseItemRow>(
      `SELECT
         i.id AS item_id,
         a.id AS atendimento_id,
         c.id AS cliente_id,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         a.created_at AS orcamento_em,
         a.status AS atendimento_status,
         p.id AS procedimento_id,
         p.nome AS procedimento_nome,
         p.tem_etapas AS tem_etapas,
         p.por_dente AS por_dente,
         i.group_id,
         i.dente_unico,
         i.dentes,
         i.valor,
         i.valor_final,
         i.valor_pago,
         i.etapas_valores,
         i.created_at AS item_created_at
       FROM itens_atendimento i
       INNER JOIN atendimentos a ON a.id = i.atendimento_id
       INNER JOIN clientes c ON c.id = a.cliente_id
       INNER JOIN procedimentos p ON p.id = i.procedimento_id
       WHERE a.unidade_id = ?
         AND COALESCE(a.tipo, 'normal') != 'sessao'
         AND i.adicionado_em_execucao = 0
         AND i.valor_pago + 0.001 < COALESCE(i.valor_final, i.valor)
       ORDER BY a.created_at DESC, i.created_at ASC`,
      [unidadeId]
    );

    const activeAgendamentos = await query<ActiveAgendamentoRow>(
      `SELECT
         ag.id AS agendamento_id,
         ag.atendimento_origem_id,
         ag.item_atendimento_origem_id,
         c.id AS cliente_id,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         a.created_at AS orcamento_em,
         a.status AS atendimento_status,
         COALESCE(ag.procedimento_id, item_origem.procedimento_id) AS procedimento_id,
         p.nome AS procedimento_nome,
         p.valor AS procedimento_valor,
         ag.etapa_modelo_id,
         em.nome AS etapa_modelo_nome,
         ag.status,
         ag.data_agendada,
         ag.valor,
         ag.valor_pago,
         ag.created_at AS agendamento_created_at,
         item_origem.group_id AS item_origem_group_id,
         item_origem.dente_unico AS item_origem_dente_unico,
         item_origem.dentes AS item_origem_dentes,
         p.por_dente AS item_origem_por_dente
       FROM agendamentos ag
       INNER JOIN atendimentos a ON a.id = ag.atendimento_origem_id
       INNER JOIN clientes c ON c.id = ag.cliente_id
       LEFT JOIN itens_atendimento item_origem ON item_origem.id = ag.item_atendimento_origem_id
       LEFT JOIN procedimentos p ON p.id = COALESCE(ag.procedimento_id, item_origem.procedimento_id)
       LEFT JOIN procedimento_etapas_modelo em ON em.id = ag.etapa_modelo_id
       WHERE ag.unidade_id = ?
         AND ag.status IN ('pendente', 'agendado')
         AND ag.atendimento_origem_id IS NOT NULL
         AND COALESCE(a.tipo, 'normal') != 'sessao'
         AND COALESCE(item_origem.adicionado_em_execucao, 0) = 0
       ORDER BY a.created_at DESC, ag.created_at DESC`,
      [unidadeId]
    );

  return { baseItems, activeAgendamentos };
}
