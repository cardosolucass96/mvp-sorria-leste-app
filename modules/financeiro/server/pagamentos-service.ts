import 'server-only';
import { normalizarFormasPagamento } from './formas-pagamento-service';
import { validarAlocacoes } from './alocacoes-service';
import { queryOne } from '@/lib/db';
import { usarCreditoRastreavel, existeSchemaCredito } from './credito-config';
import { consultarRepeticaoCredito } from './credito-transacao';
import { receberComCredito } from './credito-pagamento';
import { serviceResult, type ServiceResult } from '@/shared/result';
import { roundMoney } from '@/shared/money';
import { normalizarAlocacoes, agruparPagamentos } from '../domain/pagamentos';
import { recalcularFinanceiroItens } from './item-financeiro';
import { garantirEsquemaFormasPagamento } from '@/lib/helpers/formasPagamento';
import { gerarComissoesVendaPorAlocacoes } from '@/lib/helpers/gerarComissoes';
import { garantirEsquemaPagamentosGrupos } from '@/lib/helpers/pagamentosGrupos';
import { buscarAtendimentoPagamento, buscarPagamento, buscarAlocacoesPagamentos, buscarPagamentosSimples, buscarPagamentosAgrupados, criarGrupoDePagamentos } from './pagamentos-repository';
import type { AlocacaoPagamentoInput, PagamentoFormaInput, Atendimento } from '../contracts/pagamentos';

async function verificarAtendimentoUnidade(atendimentoId: number, unidadeId: number): Promise<{ error: ServiceResult } | { atendimento: Atendimento }> {
  const at = await buscarAtendimentoPagamento(atendimentoId);
  if (!at) return { error: serviceResult({ error: 'Atendimento não encontrado' }, { status: 404 }) };
  if (at.unidade_id !== unidadeId) return { error: serviceResult({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 }) };
  return { atendimento: at };
}

export async function listarPagamentos(atendimentoId: number, unidadeId: number, grouped: boolean) {
  try {
    await garantirEsquemaPagamentosGrupos();
    await garantirEsquemaFormasPagamento();
    const result = await verificarAtendimentoUnidade(atendimentoId, unidadeId);
    if ('error' in result) return result.error;


    if (!grouped) {
      const alocacoesPorPagamento = await buscarAlocacoesPagamentos(atendimentoId);
      const pagamentos = await buscarPagamentosSimples(atendimentoId);

      return serviceResult(pagamentos.map((pagamento) => ({
        ...pagamento,
        alocacoes: alocacoesPorPagamento.get(pagamento.id) ?? [],
      })));
    }

    const pagamentos = await buscarPagamentosAgrupados(atendimentoId);

    const alocacoesPorPagamento = await buscarAlocacoesPagamentos(atendimentoId);
    return serviceResult(agruparPagamentos(pagamentos, alocacoesPorPagamento));
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
    return serviceResult(
      { error: 'Erro ao buscar pagamentos' },
      { status: 500 }
    );
  }
}
export async function registrarPagamento(atendimentoId: number, unidadeId: number, recebidoPorId: number, body: unknown, chave?: string) {
  try {
    const {
      valor,
      metodo,
      forma_pagamento_id: formaPagamentoIdSimples,
      observacoes,
      alocacoes,
      valor_total: valorTotalComposto,
      formas,
    } = body as {
      valor?: number;
      metodo?: string;
      forma_pagamento_id?: number;
      observacoes?: string | null;
      alocacoes?: AlocacaoPagamentoInput[];
      valor_total?: number;
      formas?: PagamentoFormaInput[];
    };

    const check = await verificarAtendimentoUnidade(atendimentoId, unidadeId);
    if ('error' in check) return check.error;
    const atendimento = check.atendimento;

    const cliente = await queryOne<{ cliente_id: number }>('SELECT cliente_id FROM atendimentos WHERE id=?', [atendimentoId]);
    const rastreavel = cliente ? await usarCreditoRastreavel(cliente.cliente_id, unidadeId) : false;
    const atomico = cliente ? await existeSchemaCredito() : false;
    if (atomico && chave) {
      const repeticao = await consultarRepeticaoCredito(cliente!.cliente_id, 'recebimento', { unidadeId, atendimentoId, recebidoPorId, body }, chave);
      if (repeticao) return repeticao;
    }
    const statusPermitidos = rastreavel ? ['aguardando_pagamento','em_execucao','finalizado','encerrado'] : ['aguardando_pagamento','em_execucao'];
    if (!statusPermitidos.includes(atendimento.status)) {
      return serviceResult(
        { error: 'Não é possível registrar pagamento neste status' },
        { status: 400 }
      );
    }

    const alocacoesNormalizadas = Array.isArray(alocacoes) ? normalizarAlocacoes(alocacoes) : [];
    const modoComposto = Array.isArray(formas);

    if (modoComposto && (metodo || formaPagamentoIdSimples)) {
      return serviceResult(
        { error: 'Envie a forma simples ou formas[]/valor_total, mas não os dois formatos ao mesmo tempo' },
        { status: 400 }
      );
    }

    if (modoComposto) {
      const valorTotal = roundMoney(Number(valorTotalComposto || 0));
      if (!valorTotal || valorTotal <= 0) {
        return serviceResult(
          { error: 'Valor total do pagamento composto é obrigatório e deve ser maior que zero' },
          { status: 400 }
        );
      }

      if (formas.length === 0) {
        return serviceResult(
          { error: 'Informe ao menos uma forma de pagamento' },
          { status: 400 }
        );
      }

      await garantirEsquemaPagamentosGrupos();
      await garantirEsquemaFormasPagamento();

      const formasResolvidas = await normalizarFormasPagamento(formas, unidadeId);
      if (formasResolvidas.error) return formasResolvidas.error;
      const formasNormalizadas = formasResolvidas.formas ?? [];

      const validacaoAlocacoes = await validarAlocacoes(atendimentoId, alocacoesNormalizadas);
      if ('error' in validacaoAlocacoes) return validacaoAlocacoes.error;
      const somaAlocacoes = roundMoney(alocacoesNormalizadas.reduce((sum, alocacao) => sum + alocacao.valor, 0));

      const somaFormas = roundMoney(formasNormalizadas.reduce((sum, forma) => sum + forma.valor, 0));
      if (Math.abs(somaFormas - valorTotal) > 0.01) {
        return serviceResult(
          { error: 'A soma das formas de pagamento deve ser igual ao total selecionado' },
          { status: 400 }
        );
      }

      if (Math.abs(somaAlocacoes - valorTotal) > 0.01) {
        return serviceResult(
          { error: 'O valor total do pagamento deve ser igual à soma das alocações' },
          { status: 400 }
        );
      }

      if (atomico) return receberComCredito({ clienteId: cliente!.cliente_id, unidadeId, atendimentoId, recebidoPorId, observacoes: observacoes || null,
        valorTotal, formas: formasNormalizadas, alocacoes: alocacoesNormalizadas, body, rastrear: rastreavel, chave });
      const { pagamentoRepresentanteId, alocacaoIdsGeradas } = await criarGrupoDePagamentos({
        atendimentoId,
        recebidoPorId,
        observacoes: observacoes || null,
        valorTotal,
        formas: formasNormalizadas,
        alocacoes: alocacoesNormalizadas,
        itensMap: validacaoAlocacoes.itensMap,
      });

      await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);
      await gerarComissoesVendaPorAlocacoes(alocacaoIdsGeradas);

      const novoPagamento = await buscarPagamento(pagamentoRepresentanteId);

      return serviceResult(novoPagamento, { status: 201 });
    }

    if (!valor || valor <= 0) {
      return serviceResult(
        { error: 'Valor do pagamento é obrigatório e deve ser maior que zero' },
        { status: 400 }
      );
    }

    const valorNormalizado = roundMoney(Number(valor));
    const formaSimplesInput: PagamentoFormaInput = formaPagamentoIdSimples
      ? { forma_pagamento_id: Number(formaPagamentoIdSimples), valor: valorNormalizado }
      : { metodo, valor: valorNormalizado };

    await garantirEsquemaPagamentosGrupos();
    await garantirEsquemaFormasPagamento();

    const formasResolvidas = await normalizarFormasPagamento([formaSimplesInput], unidadeId);
    if (formasResolvidas.error) return formasResolvidas.error;
    const formasNormalizadas = formasResolvidas.formas ?? [];

    const validacaoAlocacoes = await validarAlocacoes(atendimentoId, alocacoesNormalizadas);
    if ('error' in validacaoAlocacoes) return validacaoAlocacoes.error;
    const somaAlocacoes = roundMoney(alocacoesNormalizadas.reduce((sum, alocacao) => sum + alocacao.valor, 0));

    if (Math.abs(somaAlocacoes - valorNormalizado) > 0.01) {
      return serviceResult(
        { error: 'O valor do pagamento deve ser igual à soma das alocações' },
        { status: 400 }
      );
    }

    if (atomico) return receberComCredito({ clienteId: cliente!.cliente_id, unidadeId, atendimentoId, recebidoPorId, observacoes: observacoes || null,
      valorTotal: valorNormalizado, formas: formasNormalizadas, alocacoes: alocacoesNormalizadas, body, rastrear: rastreavel, chave });
    const { pagamentoRepresentanteId, alocacaoIdsGeradas } = await criarGrupoDePagamentos({
      atendimentoId,
      recebidoPorId,
      observacoes: observacoes || null,
      valorTotal: valorNormalizado,
      formas: formasNormalizadas,
      alocacoes: alocacoesNormalizadas,
      itensMap: validacaoAlocacoes.itensMap,
    });

    await recalcularFinanceiroItens(validacaoAlocacoes.itemIds);
    await gerarComissoesVendaPorAlocacoes(alocacaoIdsGeradas);

    const novoPagamento = await buscarPagamento(pagamentoRepresentanteId);

    return serviceResult(novoPagamento, { status: 201 });
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    return serviceResult(
      { error: error instanceof Error ? error.message : 'Erro ao registrar pagamento' },
      { status: 500 }
    );
  }
}
