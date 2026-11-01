import 'server-only';
import { query, queryOne } from '@/lib/db';
import { buscarEtapasComValor } from './item-financeiro';
import { obterValorEfetivoItem } from '../public';
import { CreditoErro, CreditoTransacao, centavos, transacionarCredito } from './credito-transacao';

interface ItemCredito {
  id: number; atendimento_id: number; cliente_id: number; unidade_id: number; status: string;
  valor: number; valor_final: number | null; valor_pago: number; etapa_modelo_id: number | null; procedimento_id: number; etapas_valores: string | null;
  criado_por_id: number; adicionado_em_execucao: number; comissao_venda: number; comissao_acrescimo: number;
}
interface CaixaAlocacao { id: number; pagamento_id: number; valor_alocado: number; etapa_modelo_id: number | null; }
interface CreditoAlocacao { id: string; valor_centavos: number; pagamento_origem_id: number | null; etapa_modelo_id: number | null; }

export async function etapasDoItemCredito(item: ItemCredito) {
  return item.etapa_modelo_id
    ? [{ id: item.etapa_modelo_id, valor: obterValorEfetivoItem(item) }]
    : buscarEtapasComValor(item);
}

export async function carregarCobertura(itemId: number, clienteId: number, unidadeId: number) {
  const item = await queryOne<ItemCredito>(`SELECT i.*,a.cliente_id,a.unidade_id,p.comissao_venda,p.comissao_acrescimo
    FROM itens_atendimento i JOIN atendimentos a ON a.id=i.atendimento_id
    JOIN procedimentos p ON p.id=i.procedimento_id WHERE i.id=?`, [itemId]);
  if (!item) throw new CreditoErro('Procedimento não encontrado', 404);
  if (item.cliente_id !== clienteId) throw new CreditoErro('Procedimento não pertence a este cliente', 403);
  if (item.unidade_id !== unidadeId) throw new CreditoErro('Procedimento não pertence a esta unidade', 403);
  const caixa = await query<CaixaAlocacao>(`SELECT pa.id,pa.pagamento_id,pa.valor_alocado,pa.etapa_modelo_id
    FROM pagamentos_alocacoes pa JOIN pagamentos p ON p.id=pa.pagamento_id
    WHERE pa.item_atendimento_id=? AND p.cancelado=0
    AND NOT EXISTS(SELECT 1 FROM financeiro_liberacoes l WHERE l.alocacao_id=pa.id)`, [itemId]);
  const creditos = await query<CreditoAlocacao>(`SELECT c.id,c.valor_centavos,l.pagamento_origem_id,c.etapa_modelo_id
    FROM financeiro_coberturas c JOIN financeiro_consumos u ON u.id=c.consumo_id
    JOIN financeiro_creditos l ON l.id=u.credito_id WHERE c.item_id=? AND c.liberada=0`, [itemId]);
  const pago = caixa.reduce((s, c) => s + centavos(c.valor_alocado), 0) + creditos.reduce((s, c) => s + c.valor_centavos, 0);
  if (pago !== centavos(item.valor_pago)) throw new CreditoErro('O valor pago deste procedimento precisa de conciliação antes de movimentar crédito');
  return { item, caixa, creditos, pago };
}

export function creditarRastreado(clienteId: number, unidadeId: number, valor: number, pagamentoId: number | null, observacoes: string | null, chave?: string) {
  return transacionarCredito(clienteId, 'credito', { unidadeId, valor, pagamentoId, observacoes }, chave, async tx => {
    const quantia = centavos(valor);
    if (pagamentoId) {
      const p = await queryOne<{ cliente_id: number; unidade_id: number; cancelado: number; valor: number }>(`SELECT p.*,a.cliente_id,a.unidade_id FROM pagamentos p JOIN atendimentos a ON a.id=p.atendimento_id WHERE p.id=?`, [pagamentoId]);
      if (!p) throw new CreditoErro('Pagamento não encontrado', 404);
      if (p.cliente_id !== clienteId || p.unidade_id !== unidadeId) throw new CreditoErro('Pagamento não pertence a este cliente e unidade', 403);
      if (p.cancelado) throw new CreditoErro('Pagamento cancelado não pode originar crédito', 400);
      const usado = await queryOne<{ total: number }>(`SELECT
        COALESCE((SELECT SUM(ROUND(valor_alocado*100)) FROM pagamentos_alocacoes WHERE pagamento_id=?),0)
        +COALESCE((SELECT SUM(valor_centavos) FROM financeiro_creditos WHERE pagamento_origem_id=? AND origem='pagamento'),0)
        +COALESCE((SELECT SUM(ROUND(m.valor*100)) FROM movimentacoes_saldo m WHERE m.pagamento_id=? AND m.tipo='credito'
          AND NOT EXISTS(SELECT 1 FROM financeiro_creditos c WHERE c.movimento_id=m.id)),0) total`, [pagamentoId, pagamentoId, pagamentoId]);
      if (quantia > centavos(p.valor) - (usado?.total ?? 0)) throw new CreditoErro('Valor do pagamento já destinado; devolva o procedimento para convertê-lo em crédito');
    }
    const movimento = await tx.movimento(clienteId, 'credito', quantia, { pagamentoId: pagamentoId ?? undefined, observacoes });
    tx.novoCredito(clienteId, quantia, pagamentoId ? 'pagamento' : 'manual', movimento.id, pagamentoId);
    return { body: { saldo: movimento.saldo }, status: 201 };
  });
}

async function comissaoCredito(tx: CreditoTransacao, coberturaId: string, item: ItemCredito, valorCentavos: number) {
  const origem = item.adicionado_em_execucao ? 'acrescimo' : 'avaliacao';
  const percentual = Number(item.adicionado_em_execucao ? item.comissao_acrescimo : item.comissao_venda);
  if (!(percentual > 0) || !item.criado_por_id) return;
  const id = await tx.proximoId('comissoes');
  tx.add(`INSERT INTO comissoes(id,atendimento_id,item_atendimento_id,usuario_id,tipo,origem,percentual,valor_base,valor_comissao)
    VALUES (?,?,?,?,'venda',?,?,?,?)`, [id, item.atendimento_id, item.id, item.criado_por_id, origem, percentual, valorCentavos/100, Math.round(valorCentavos * percentual / 100)/100]);
  tx.add('INSERT INTO financeiro_comissoes_credito VALUES (?,?)', [coberturaId, id]);
}

export function debitarRastreado(clienteId: number, unidadeId: number, itemId: number, atendimentoId: number, observacoes: string | null, chave?: string) {
  return transacionarCredito(clienteId, 'uso', { unidadeId, itemId, atendimentoId, observacoes }, chave, async tx => {
    const { item, caixa, creditos, pago } = await carregarCobertura(itemId, clienteId, unidadeId);
    if (item.atendimento_id !== atendimentoId) throw new CreditoErro('Item de atendimento não encontrado', 404);
    const total = centavos(obterValorEfetivoItem(item)), restante = total - pago;
    if (restante <= 0) throw new CreditoErro('Item já está totalmente pago', 400);
    const etapas = await etapasDoItemCredito(item);
    const destinos: Array<{ etapa: number | null; valor: number }> = etapas.length ? etapas.map(e => ({
      etapa: e.id,
      valor: Math.max(0, centavos(e.valor ?? 0)
        - caixa.filter(c => c.etapa_modelo_id === e.id).reduce((s, c) => s + centavos(c.valor_alocado), 0)
        - creditos.filter(c => c.etapa_modelo_id === e.id).reduce((s, c) => s + c.valor_centavos, 0)),
    })) : [{ etapa: null, valor: restante }];
    if (destinos.reduce((s, d) => s+d.valor, 0) !== restante) throw new CreditoErro('Os pagamentos das sessões precisam de conciliação antes de usar crédito');
    const partes = await tx.consumir(clienteId, restante, 'uso');
    const movimento = await tx.movimento(clienteId, 'debito', -restante, { itemId, atendimentoId, observacoes });
    for (const parte of partes) {
      let disponivel = parte.valor;
      for (const destino of destinos) {
        const valor = Math.min(disponivel, destino.valor);
        if (valor <= 0) continue;
        const id = crypto.randomUUID();
        tx.add('INSERT INTO financeiro_coberturas(id,item_id,etapa_modelo_id,consumo_id,valor_centavos) VALUES (?,?,?,?,?)', [id, itemId, destino.etapa, parte.consumoId, valor]);
        await comissaoCredito(tx, id, item, valor);
        disponivel -= valor; destino.valor -= valor;
      }
    }
    tx.recalcular(itemId);
    return { body: { saldo: movimento.saldo, item: { id: itemId, atendimento_id: atendimentoId, valor: total/100, valor_final: item.valor_final, valor_pago: total/100, status: ['executando','concluido'].includes(item.status) ? item.status : 'pago' } }, status: 200 };
  });
}

export function estornarRastreado(clienteId: number, valor: number, observacoes: string | null, chave?: string) {
  return transacionarCredito(clienteId, 'devolucao', { valor, observacoes }, chave, async tx => {
    await tx.consumir(clienteId, centavos(valor), 'devolucao');
    const movimento = await tx.movimento(clienteId, 'estorno', -centavos(valor), { observacoes });
    return { body: { saldo: movimento.saldo }, status: 200 };
  });
}

export function transferirRastreado(clienteId: number, destinoId: number, valor: number, observacoes: string | null, chave?: string) {
  return transacionarCredito(clienteId, 'transferencia', { destinoId, valor, observacoes }, chave, async tx => {
    const partes = await tx.consumir(clienteId, centavos(valor), 'transferencia');
    const saida = await tx.movimento(clienteId, 'transferencia_saida', -centavos(valor), { destinoId, observacoes });
    const entrada = await tx.movimento(destinoId, 'transferencia_entrada', centavos(valor), { destinoId: clienteId, observacoes });
    for (const parte of partes) tx.novoCredito(destinoId, parte.valor, 'transferencia', entrada.id, parte.lote.pagamento_origem_id);
    return { body: { saldo_origem: saida.saldo, saldo_destino: entrada.saldo }, status: 200 };
  });
}

export function devolverProcedimentoRastreado(clienteId: number, unidadeId: number, itemId: number, chave?: string) {
  return transacionarCredito(clienteId, 'devolucao_procedimento', { unidadeId, itemId }, chave, async tx => {
    const { item, caixa, creditos, pago } = await carregarCobertura(itemId, clienteId, unidadeId);
    if (!pago) throw new CreditoErro('Procedimento não possui valor pago para estornar', 400);
    if (item.status === 'concluido') throw new CreditoErro('Não é possível estornar um procedimento já concluído', 400);
    const movimento = await tx.movimento(clienteId, 'estorno', pago, { itemId, atendimentoId: item.atendimento_id, observacoes: 'Devolução de procedimento para crédito' });
    for (const a of caixa) {
      tx.add('INSERT INTO financeiro_liberacoes VALUES (?,?)', [a.id, tx.id]);
      tx.novoCredito(clienteId, centavos(a.valor_alocado), 'procedimento', movimento.id, a.pagamento_id);
      tx.add("DELETE FROM comissoes WHERE tipo='venda' AND pagamento_alocacao_id=?", [a.id]);
    }
    for (const c of creditos) {
      tx.add('UPDATE financeiro_coberturas SET liberada=1 WHERE id=?', [c.id]);
      tx.novoCredito(clienteId, c.valor_centavos, 'devolucao_credito', movimento.id, c.pagamento_origem_id);
      const comissao = await queryOne<{ comissao_id: number }>('SELECT comissao_id FROM financeiro_comissoes_credito WHERE cobertura_id=?', [c.id]);
      if (comissao) {
        tx.add('DELETE FROM financeiro_comissoes_credito WHERE cobertura_id=?', [c.id]);
        tx.add('DELETE FROM comissoes WHERE id=?', [comissao.comissao_id]);
      }
    }
    // A devolução conserva a semântica anterior: o procedimento volta a pendente.
    tx.add("UPDATE itens_atendimento SET status='pendente' WHERE id=?", [itemId]);
    tx.recalcular(itemId);
    return { body: { saldo_novo: movimento.saldo, valor_creditado: pago/100 }, status: 200 };
  });
}
