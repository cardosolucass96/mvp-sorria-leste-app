import { query } from '@/lib/db';
import { getClinicDayUtcRange } from '@/lib/time';
import type { VendaCategoriaResumo } from './types';

export async function listarVendasPorCategoria(unidadeId: number, dataInicio: string, dataFim: string) {
  const inicio = getClinicDayUtcRange(dataInicio).start;
  const fim = getClinicDayUtcRange(dataFim).endExclusive;

  return query<VendaCategoriaResumo>(
    `WITH recebimentos AS (
       SELECT i.id AS item_id,
              CASE WHEN i.id IS NULL THEN ag.id END AS agendamento_avulso_id,
              COALESCE(i.procedimento_id, ag.procedimento_id) AS procedimento_id,
              COALESCE(i.valor_final, i.valor, ag.valor, 0) AS valor_item,
              julianday(p.created_at) AS pago_em
       FROM atendimentos a
       JOIN pagamentos p ON p.atendimento_id = a.id
       JOIN pagamentos_alocacoes pa ON pa.pagamento_id = p.id
       LEFT JOIN agendamentos ag ON ag.id = pa.agendamento_id
       LEFT JOIN itens_atendimento i ON i.id = COALESCE(pa.item_atendimento_id, ag.item_atendimento_origem_id)
       WHERE a.unidade_id = ?
         AND COALESCE(p.cancelado, 0) = 0
         AND pa.valor_alocado > 0
         AND julianday(p.created_at) < julianday(?)
         AND COALESCE(i.procedimento_id, ag.procedimento_id) IS NOT NULL
     ), vendas AS (
       SELECT procedimento_id, valor_item
       FROM recebimentos
       GROUP BY item_id, agendamento_avulso_id, procedimento_id, valor_item
       HAVING MIN(pago_em) >= julianday(?)
     )
     SELECT pr.categoria_catalogo AS categoria_catalogo,
            COUNT(*) AS quantidade,
            SUM(ROUND(v.valor_item * 100)) / 100.0 AS valor_vendido
     FROM vendas v
     LEFT JOIN procedimentos pr ON pr.id = v.procedimento_id
     GROUP BY pr.categoria_catalogo
     ORDER BY valor_vendido DESC, quantidade DESC, categoria_catalogo ASC`,
    [unidadeId, fim, inicio]
  );
}
