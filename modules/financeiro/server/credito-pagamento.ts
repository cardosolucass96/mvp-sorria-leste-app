import 'server-only';
import { queryOne } from '@/lib/db';
import { nowUtcIso } from '@/lib/time';
import { carregarCobertura, etapasDoItemCredito } from './credito-saldo';
import { obterValorEfetivoItem } from '../public';
import { CreditoErro, centavos, transacionarCredito } from './credito-transacao';
import type { NormalizedAlocacao, PagamentoFormaResolvedInput } from '../contracts/pagamentos';

export function receberComCredito(input: {
  clienteId: number; unidadeId: number; atendimentoId: number; recebidoPorId: number;
  observacoes: string | null; valorTotal: number; formas: PagamentoFormaResolvedInput[];
  alocacoes: NormalizedAlocacao[]; body: unknown; rastrear: boolean; chave?: string;
}) {
  const { clienteId, unidadeId, atendimentoId, recebidoPorId, observacoes, valorTotal, formas, alocacoes, chave } = input;
  return transacionarCredito(clienteId, 'recebimento', { unidadeId, atendimentoId, recebidoPorId, body: input.body }, chave, async tx => {
    const at = await queryOne<{ status: string }>('SELECT status FROM atendimentos WHERE id=? AND cliente_id=? AND unidade_id=?', [atendimentoId, clienteId, unidadeId]);
    if (!at || !['aguardando_pagamento','em_execucao','finalizado','encerrado'].includes(at.status)) throw new CreditoErro('Atendimento indisponível para recebimento');
    const total = centavos(valorTotal);
    if (!Number.isSafeInteger(total) || total <= 0 || formas.reduce((s,f)=>s+centavos(f.valor),0) !== total || alocacoes.reduce((s,a)=>s+centavos(a.valor),0) !== total) throw new CreditoErro('Formas e alocações devem corresponder ao valor recebido', 400);
    if (input.rastrear) await tx.conta(clienteId);
    const itens = new Map<number, Awaited<ReturnType<typeof carregarCobertura>>>();
    for (const itemId of new Set(alocacoes.map(a=>a.item_id))) {
      const cobertura = await carregarCobertura(itemId, clienteId, unidadeId);
      if (cobertura.item.atendimento_id !== atendimentoId) throw new CreditoErro('Item não pertence a este atendimento', 400);
      itens.set(itemId, cobertura);
      const pedido = alocacoes.filter(a=>a.item_id === itemId);
      const soma = pedido.reduce((s,a)=>s+centavos(a.valor),0);
      if (soma > centavos(obterValorEfetivoItem(cobertura.item))-cobertura.pago) throw new CreditoErro('Valor recebido ultrapassa o restante do procedimento', 400);
      const etapas = await etapasDoItemCredito(cobertura.item);
      for (const etapaId of new Set(pedido.map(a=>a.etapa_modelo_id))) {
        if (etapaId === null && !etapas.length) continue;
        const etapa = etapas.find(e=>e.id === etapaId);
        if (!etapa) throw new CreditoErro('Selecione a sessão correspondente ao pagamento', 400);
        const pago = cobertura.caixa.filter(a=>a.etapa_modelo_id===etapaId).reduce((s,a)=>s+centavos(a.valor_alocado),0)
          +cobertura.creditos.filter(a=>a.etapa_modelo_id===etapaId).reduce((s,a)=>s+a.valor_centavos,0);
        if (pedido.filter(a=>a.etapa_modelo_id===etapaId).reduce((s,a)=>s+centavos(a.valor),0) > centavos(etapa.valor ?? 0)-pago) throw new CreditoErro('Valor recebido ultrapassa o restante da sessão', 400);
      }
    }
    const grupoId = await tx.proximoId('pagamentos_grupos'), createdAt = nowUtcIso();
    tx.add('INSERT INTO pagamentos_grupos(id,atendimento_id,recebido_por_id,valor_total,observacoes,created_at) VALUES (?,?,?,?,?,?)', [grupoId,atendimentoId,recebidoPorId,valorTotal,observacoes,createdAt]);
    const restantes = alocacoes.map(a=>({ ...a, restante: centavos(a.valor) }));
    let representante: Record<string, unknown> | null = null;
    for (const forma of formas) {
      const pagamentoId = await tx.proximoId('pagamentos');
      const pagamento = { id: pagamentoId, atendimento_id: atendimentoId, pagamento_grupo_id: grupoId, recebido_por_id: recebidoPorId, ...forma, observacoes, created_at: createdAt, cancelado: 0, motivo_cancelamento: null };
      representante ??= pagamento;
      const campos = Object.keys(pagamento);
      tx.add(`INSERT INTO pagamentos(${campos.join(',')}) VALUES (${campos.map(()=>'?').join(',')})`, Object.values(pagamento));
      let saldoForma = centavos(forma.valor);
      for (const a of restantes) {
        const valor = Math.min(saldoForma, a.restante);
        if (valor <= 0) continue;
        const item = itens.get(a.item_id)!.item;
        const origem = item.adicionado_em_execucao ? 'acrescimo' : 'avaliacao';
        const percentual = Number(item.adicionado_em_execucao ? item.comissao_acrescimo : item.comissao_venda) || 0;
        const alocacaoId = await tx.proximoId('pagamentos_alocacoes');
        tx.add(`INSERT INTO pagamentos_alocacoes(id,pagamento_id,item_atendimento_id,etapa_modelo_id,valor_alocado,criado_por_id,origem_comissao,percentual_comissao,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`, [alocacaoId,pagamentoId,a.item_id,a.etapa_modelo_id,valor/100,item.criado_por_id,origem,percentual,createdAt]);
        if (percentual > 0 && item.criado_por_id) tx.add(`INSERT INTO comissoes(atendimento_id,item_atendimento_id,usuario_id,tipo,origem,percentual,valor_base,valor_comissao,pagamento_alocacao_id,created_at)
          VALUES (?,?,?,'venda',?,?,?,?,?,?)`, [atendimentoId,a.item_id,item.criado_por_id,origem,percentual,valor/100,Math.round(valor*percentual/100)/100,alocacaoId,createdAt]);
        a.restante -= valor; saldoForma -= valor;
      }
      if (saldoForma) throw new CreditoErro('Não foi possível distribuir o recebimento', 400);
    }
    if (restantes.some(a=>a.restante)) throw new CreditoErro('Não foi possível distribuir as alocações', 400);
    for (const itemId of itens.keys()) tx.recalcular(itemId, input.rastrear);
    return { body: representante, status: 201 };
  });
}
