import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requirePositiveInteger } from '@/lib/v2/domain';
import { requireClientInUnit, withV2, type V2Context } from '../../../_shared';

export const GET = withV2(
  ['admin', 'atendente', 'avaliador', 'executor', 'ortodontista'],
  async (_request: NextRequest, context: V2Context) => {
    const { id } = (await context.params) as { id: string };
    const clienteId = requirePositiveInteger(id, 'cliente_id');
    await requireClientInUnit(clienteId, context.unidadeId);
    const events = await query(
      `SELECT * FROM (
        SELECT 'agenda' AS tipo, id AS entidade_id, status AS titulo,
          observacoes AS descricao, data_agendada AS data_evento
        FROM agenda_compromissos WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'atendimento_clinico', id, status, observacoes, created_at
        FROM atendimentos_clinicos WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'avaliacao', id, status, COALESCE(motivo_sem_orcamento, observacoes), created_at
        FROM avaliacoes WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'orcamento', id, status, observacoes, created_at
        FROM orcamentos WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'procedimento', id, nome_snapshot || ' — ' || status_comercial,
          status_clinico, created_at
        FROM procedimentos_cliente WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'recebimento', id, canal || ' — ' || status,
          printf('R$ %.2f', valor_total_centavos / 100.0), created_at
        FROM recebimentos WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'evolucao_clinica', id, 'Evolução clínica', texto, created_at
        FROM evolucoes_clinicas WHERE cliente_id = ? AND unidade_id = ?
        UNION ALL
        SELECT 'followup', id, tipo || ' — ' || status, descricao, created_at
        FROM procedimento_cliente_followups WHERE cliente_id = ? AND unidade_id = ?
      ) timeline ORDER BY data_evento DESC LIMIT 500`,
      Array(8).fill([clienteId, context.unidadeId]).flat(),
    );
    return NextResponse.json(events);
  },
);
