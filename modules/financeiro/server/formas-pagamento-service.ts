import 'server-only';
import { serviceResult, type ServiceResult } from '@/shared/result';
import { roundMoney } from '@/shared/money';
import { buscarFormaPagamentoDaUnidade, calcularValorLiquido, calcularValorTaxa, isMetodoPagamentoValido } from '@/lib/helpers/formasPagamento';
import type { PagamentoFormaInput, PagamentoFormaResolvedInput } from '../contracts/pagamentos';

export async function normalizarFormasPagamento(
  formas: PagamentoFormaInput[],
  unidadeId: number
): Promise<{ formas?: PagamentoFormaResolvedInput[]; error?: ServiceResult }> {
  const formasNormalizadas: PagamentoFormaResolvedInput[] = [];

  for (const forma of formas) {
    const valor = roundMoney(Number(forma.valor || 0));
    if (!Number.isFinite(valor) || valor <= 0) {
      return {
        error: serviceResult(
          { error: 'Cada forma de pagamento deve ter valor maior que zero' },
          { status: 400 }
        ),
      };
    }

    const formaPagamentoId = Number(forma.forma_pagamento_id ?? 0);
    if (Number.isFinite(formaPagamentoId) && formaPagamentoId > 0) {
      const configuracao = await buscarFormaPagamentoDaUnidade(formaPagamentoId, unidadeId);
      if (!configuracao || !configuracao.ativo) {
        return {
          error: serviceResult(
            { error: 'Forma de pagamento inválida, inativa ou de outra unidade' },
            { status: 400 }
          ),
        };
      }

      formasNormalizadas.push({
        forma_pagamento_id: configuracao.id,
        metodo: configuracao.metodo_base,
        valor,
        forma_pagamento_grupo_snapshot: configuracao.grupo,
        forma_pagamento_subgrupo_snapshot: configuracao.subgrupo,
        taxa_percentual_snapshot: roundMoney(Number(configuracao.taxa_percentual ?? 0)),
        taxa_fixa_snapshot: roundMoney(Number(configuracao.taxa_fixa ?? 0)),
        valor_taxa: calcularValorTaxa(valor, configuracao.taxa_percentual, configuracao.taxa_fixa),
        valor_liquido: calcularValorLiquido(valor, configuracao.taxa_percentual, configuracao.taxa_fixa),
      });
      continue;
    }

    if (!isMetodoPagamentoValido(forma.metodo)) {
      return {
        error: serviceResult({ error: 'Método de pagamento inválido' }, { status: 400 }),
      };
    }

    formasNormalizadas.push({
      forma_pagamento_id: null,
      metodo: forma.metodo,
      valor,
      forma_pagamento_grupo_snapshot: null,
      forma_pagamento_subgrupo_snapshot: '',
      taxa_percentual_snapshot: 0,
      taxa_fixa_snapshot: 0,
      valor_taxa: 0,
      valor_liquido: valor,
    });
  }

  return { formas: formasNormalizadas };
}

