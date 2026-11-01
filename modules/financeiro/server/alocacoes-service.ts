import 'server-only';
import { serviceResult, type ServiceResult } from '@/shared/result';
import { buscarEtapasComValor } from './item-financeiro';
import { buscarItensPagamento } from './pagamentos-repository';
import type { NormalizedAlocacao, ItemPagamentoRow } from '../contracts/pagamentos';

export async function validarAlocacoes(
  atendimentoId: number,
  alocacoes: NormalizedAlocacao[]
): Promise<{ error: ServiceResult } | { itemIds: number[]; itensMap: Map<number, ItemPagamentoRow> }> {
  if (alocacoes.length === 0) {
    return { error: serviceResult({ error: 'Informe ao menos uma alocação de pagamento' }, { status: 400 }) };
  }

  const itemIds = [...new Set(alocacoes.map((alocacao) => alocacao.item_id).filter(Number.isFinite))];
  const itens = await buscarItensPagamento(atendimentoId, itemIds);
  const itensMap = new Map(itens.map((item) => [item.id, item]));

  for (const alocacao of alocacoes) {
    if (!Number.isFinite(alocacao.valor) || alocacao.valor <= 0) {
      return { error: serviceResult({ error: 'Valor de alocação inválido' }, { status: 400 }) };
    }

    const item = itensMap.get(alocacao.item_id);
    if (!item) {
      return { error: serviceResult({ error: 'Item de atendimento inválido na alocação' }, { status: 400 }) };
    }

    if (alocacao.etapa_modelo_id) {
      const etapas = await buscarEtapasComValor(item);
      const etapa = etapas.find((et) => et.id === alocacao.etapa_modelo_id);
      if (!etapa) {
        return { error: serviceResult({ error: 'Sessão inválida na alocação' }, { status: 400 }) };
      }
    }
  }

  return { itemIds, itensMap };
}

