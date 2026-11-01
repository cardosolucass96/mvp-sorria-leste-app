import { roundMoney } from '@/shared/money';
import { parseStoredUtcInstant } from '@/lib/time';
import type { AlocacaoPagamentoInput, NormalizedAlocacao, PagamentoAgrupadoRow, PagamentoAlocacaoResponse, PagamentoAgrupadoResponse } from '../contracts/pagamentos';

export function normalizarAlocacoes(alocacoes: AlocacaoPagamentoInput[]): NormalizedAlocacao[] {
  return alocacoes.map((alocacao) => ({
    item_id: Number(alocacao.item_id),
    etapa_modelo_id: alocacao.etapa_modelo_id ? Number(alocacao.etapa_modelo_id) : null,
    valor: roundMoney(Number(alocacao.valor || 0)),
  }));
}

export function agruparPagamentos(
  rows: PagamentoAgrupadoRow[],
  alocacoesPorPagamento = new Map<number, PagamentoAlocacaoResponse[]>()
): PagamentoAgrupadoResponse[] {
  const grupos = new Map<string, PagamentoAgrupadoResponse>();

  for (const row of rows) {
    const key = row.pagamento_grupo_id ? `grupo:${row.pagamento_grupo_id}` : `pagamento:${row.id}`;
    const grupoExistente = grupos.get(key);

    if (!grupoExistente) {
      grupos.set(key, {
        id: key,
        pagamento_grupo_id: row.pagamento_grupo_id,
        pagamento_representante_id: row.id,
        valor_total: roundMoney(row.grupo_valor_total ?? row.valor),
        valor_taxa_total: 0,
        valor_liquido_total: 0,
        observacoes: row.grupo_observacoes ?? row.observacoes,
        cancelado: row.grupo_cancelado ?? row.cancelado,
        motivo_cancelamento: row.grupo_motivo_cancelamento ?? row.motivo_cancelamento,
        created_at: row.grupo_created_at ?? row.created_at,
        recebido_por_nome: row.recebido_por_nome,
        alocacoes: [],
        formas: [],
      });
    }

    const alocacoes = alocacoesPorPagamento.get(row.id) ?? [];
    const grupo = grupos.get(key)!;
    grupo.alocacoes.push(...alocacoes);
    grupo.valor_taxa_total = roundMoney(grupo.valor_taxa_total + Number(row.valor_taxa ?? 0));
    grupo.valor_liquido_total = roundMoney(grupo.valor_liquido_total + Number(row.valor_liquido ?? row.valor));
    grupos.get(key)!.formas.push({
      id: row.id,
      valor: row.valor,
      metodo: row.metodo,
      forma_pagamento_id: row.forma_pagamento_id,
      forma_pagamento_grupo_snapshot: row.forma_pagamento_grupo_snapshot,
      forma_pagamento_subgrupo_snapshot: row.forma_pagamento_subgrupo_snapshot,
      taxa_percentual_snapshot: row.taxa_percentual_snapshot,
      taxa_fixa_snapshot: row.taxa_fixa_snapshot,
      valor_taxa: row.valor_taxa,
      valor_liquido: row.valor_liquido,
      observacoes: row.observacoes,
      cancelado: row.cancelado,
      motivo_cancelamento: row.motivo_cancelamento,
      created_at: row.created_at,
      alocacoes,
    });
  }

  return Array.from(grupos.values()).sort((a, b) => {
    const left = parseStoredUtcInstant(a.created_at)?.getTime() ?? 0;
    const right = parseStoredUtcInstant(b.created_at)?.getTime() ?? 0;
    return right - left;
  });
}

