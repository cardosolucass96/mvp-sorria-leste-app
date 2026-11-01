import 'server-only';
import { queryOne } from '@/lib/db';
import { usarCreditoRastreavel, existeSchemaCredito } from './credito-config';
import { cancelarComCredito } from './credito-cancelamento';
import { serviceResult } from '@/shared/result';
import { garantirEsquemaPagamentosGrupos } from '@/lib/helpers/pagamentosGrupos';
import { removerComissoesVendaPorAlocacoes } from '@/lib/helpers/gerarComissoes';
import { recalcularFinanceiroAgendamentos, recalcularFinanceiroItens } from './item-financeiro';
import { buscarAtendimentoCancelamento, buscarPagamentoCancelamento, buscarPagamentosDoGrupo, marcarGrupoCancelado, marcarPagamentoCancelado, buscarAlocacoesCancelamento } from './cancelamentos-repository';

export async function cancelarPagamento(atendimentoId: number, pagamentoId: number, unidadeId: number, motivo: string, chave?: string) {
  try {
    const atendimento = await buscarAtendimentoCancelamento(atendimentoId);
    if (!atendimento) return serviceResult({ error: 'Atendimento não encontrado' }, { status: 404 });
    if (atendimento.unidade_id !== unidadeId) return serviceResult({ error: 'Atendimento não pertence a esta unidade' }, { status: 403 });
    if (typeof motivo !== 'string' || !motivo.trim()) return serviceResult({ error: 'Informe o motivo do cancelamento' }, { status: 400 });
    const cliente = await queryOne<{ cliente_id: number }>('SELECT cliente_id FROM atendimentos WHERE id=?', [atendimentoId]);
    if (cliente && await existeSchemaCredito()) return cancelarComCredito(cliente.cliente_id, unidadeId, atendimentoId, pagamentoId, motivo.trim(), chave, await usarCreditoRastreavel(cliente.cliente_id, unidadeId));
    await garantirEsquemaPagamentosGrupos();
    const pagamento = await buscarPagamentoCancelamento(atendimentoId, pagamentoId);
    if (!pagamento) return serviceResult({ error: 'Pagamento não encontrado' }, { status: 404 });

    let pagamentosAlvo: Array<{ id: number; cancelado: number }>;
    if (pagamento.pagamento_grupo_id) {
      pagamentosAlvo = await buscarPagamentosDoGrupo(pagamento.pagamento_grupo_id);
      if (pagamentosAlvo.every(item => item.cancelado)) return serviceResult({ error: 'Pagamento já está cancelado' }, { status: 400 });
      await marcarGrupoCancelado(pagamento.pagamento_grupo_id, motivo.trim());
    } else {
      if (pagamento.cancelado) return serviceResult({ error: 'Pagamento já está cancelado' }, { status: 400 });
      pagamentosAlvo = [{ id: pagamentoId, cancelado: pagamento.cancelado }];
      await marcarPagamentoCancelado(pagamentoId, motivo.trim());
    }
    const alocacoes = await buscarAlocacoesCancelamento(pagamentosAlvo.map(item => item.id));
    const alocacaoIds = alocacoes.map(item => item.id).filter(Number.isFinite);
    const itemIds = [...new Set(alocacoes.map(item => item.item_atendimento_id).filter((id): id is number => Number.isFinite(id)))];
    const agendamentoIds = [...new Set(alocacoes.map(item => item.agendamento_id).filter((id): id is number => Number.isFinite(id)))];
    if (itemIds.length) await recalcularFinanceiroItens(itemIds);
    if (agendamentoIds.length) await recalcularFinanceiroAgendamentos(agendamentoIds);
    await removerComissoesVendaPorAlocacoes(alocacaoIds);
    return serviceResult({ success: true });
  } catch (error) {
    console.error('Erro ao cancelar pagamento:', error);
    return serviceResult({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
