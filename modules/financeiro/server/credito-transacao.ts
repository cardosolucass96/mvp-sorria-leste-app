import 'server-only';
import { batch, query, queryOne } from '@/lib/db';
import { centavos, distribuirCreditoFIFO } from '../domain/credito';
export { centavos } from '../domain/credito';
import { serviceResult } from '@/shared/result';
import { comandosRecalcularCredito } from './credito-cobertura';

export class CreditoErro extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
export interface LoteCredito { id: string; cliente_id: number; pagamento_origem_id: number | null; disponivel: number; }
export interface Comando { sql: string; params: unknown[]; }

export class CreditoTransacao {
  readonly id = crypto.randomUUID();
  readonly comandos: Comando[] = [];
  private readonly contas = new Map<number, number>();
  private readonly ids = new Map<string, number>();
  private readonly lotes = new Map<number, LoteCredito[]>();
  add(sql: string, params: unknown[] = []) { this.comandos.push({ sql, params }); }

  async proximoId(tabela: 'movimentacoes_saldo' | 'pagamentos' | 'pagamentos_grupos' | 'pagamentos_alocacoes' | 'comissoes') {
    if (!this.ids.has(tabela)) {
      const row = await queryOne<{ id: number }>(`SELECT MAX(COALESCE((SELECT MAX(id) FROM ${tabela}),0),COALESCE((SELECT seq FROM sqlite_sequence WHERE name=?),0)) id`, [tabela]);
      this.ids.set(tabela, row?.id ?? 0);
    }
    const id = this.ids.get(tabela)! + 1;
    this.ids.set(tabela, id);
    return id;
  }

  async conta(clienteId: number) {
    if (this.contas.has(clienteId)) return this.contas.get(clienteId)!;
    const saldo = centavos((await queryOne<{ saldo: number }>('SELECT saldo FROM saldo_clientes WHERE cliente_id=?', [clienteId]))?.saldo ?? 0);
    if (!Number.isSafeInteger(saldo) || saldo < 0) throw new CreditoErro('Saldo precisa de conciliação antes de movimentar');
    const conta = await queryOne('SELECT cliente_id FROM financeiro_contas WHERE cliente_id=?', [clienteId]);
    let lotes: LoteCredito[];
    if (!conta) {
      this.add(`INSERT INTO financeiro_contas VALUES (?,?,COALESCE((SELECT MAX(id) FROM movimentacoes_saldo WHERE cliente_id=?),0))`, [clienteId, saldo, clienteId]);
      lotes = [];
      if (saldo > 0) {
        const id = crypto.randomUUID();
        this.add(`INSERT INTO financeiro_creditos(id,cliente_id,valor_centavos,operacao_id,origem) VALUES (?,?,?,?,'abertura')`, [id, clienteId, saldo, this.id]);
        lotes.push({ id, cliente_id: clienteId, pagamento_origem_id: null, disponivel: saldo });
      }
    } else {
      lotes = await query<LoteCredito>(`SELECT c.id,c.cliente_id,c.pagamento_origem_id,
        c.valor_centavos-COALESCE((SELECT SUM(valor_centavos) FROM financeiro_consumos WHERE credito_id=c.id),0) disponivel
        FROM financeiro_creditos c WHERE c.cliente_id=? ORDER BY c.rowid`, [clienteId]);
      if (lotes.reduce((sum, l) => sum + l.disponivel, 0) !== saldo) throw new CreditoErro('Saldo e origem dos créditos divergem; concilie antes de movimentar');
    }
    this.lotes.set(clienteId, lotes);
    this.contas.set(clienteId, saldo);
    return saldo;
  }

  async movimento(clienteId: number, tipo: string, delta: number, info: { itemId?: number; atendimentoId?: number; pagamentoId?: number; destinoId?: number; observacoes?: string | null } = {}) {
    const anterior = await this.conta(clienteId);
    const novo = anterior + delta;
    if (!Number.isSafeInteger(novo) || novo < 0) throw new CreditoErro('Saldo insuficiente', 400);
    const id = await this.proximoId('movimentacoes_saldo');
    this.add(`INSERT INTO movimentacoes_saldo(id,cliente_id,tipo,valor,saldo_anterior,saldo_novo,item_atendimento_id,atendimento_id,pagamento_id,cliente_destino_id,observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, clienteId, tipo, Math.abs(delta)/100, anterior/100, novo/100, info.itemId ?? null, info.atendimentoId ?? null, info.pagamentoId ?? null, info.destinoId ?? null, info.observacoes ?? null]);
    this.add(`INSERT INTO saldo_clientes(cliente_id,saldo) VALUES (?,?) ON CONFLICT(cliente_id) DO UPDATE SET saldo=excluded.saldo,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`, [clienteId, novo/100]);
    this.contas.set(clienteId, novo);
    return { id, saldo: novo/100 };
  }

  novoCredito(clienteId: number, valor: number, origem: string, movimentoId: number, pagamentoId: number | null = null) {
    const id = crypto.randomUUID();
    this.add(`INSERT INTO financeiro_creditos(id,cliente_id,pagamento_origem_id,movimento_id,valor_centavos,operacao_id,origem) VALUES (?,?,?,?,?,?,?)`, [id, clienteId, pagamentoId, movimentoId, valor, this.id, origem]);
    this.lotes.get(clienteId)!.push({ id, cliente_id: clienteId, pagamento_origem_id: pagamentoId, disponivel: valor });
  }

  async consumir(clienteId: number, valor: number, tipo: string) {
    await this.conta(clienteId);
    const partes: Array<{ consumoId: string; lote: LoteCredito; valor: number }> = [];
    // FIFO determinístico: primeiro o crédito mais antigo. A origem não se perde na transferência.
    const distribuicao = distribuirCreditoFIFO(this.lotes.get(clienteId)!, valor);
    if (distribuicao.restante) throw new CreditoErro('Saldo insuficiente', 400);
    for (const { lote, valor: usado } of distribuicao.partes) {
      const consumoId = crypto.randomUUID();
      this.add('INSERT INTO financeiro_consumos VALUES (?,?,?,?,?)', [consumoId, lote.id, usado, tipo, this.id]);
      lote.disponivel -= usado;
      partes.push({ consumoId, lote, valor: usado });
    }
    return partes;
  }

  recalcular(itemId: number, rastrear = true) {
    if (rastrear) this.add('INSERT OR IGNORE INTO financeiro_itens VALUES (?)', [itemId]);
    this.comandos.push(...comandosRecalcularCredito(itemId));
  }
}

export async function consultarRepeticaoCredito(clienteId: number, tipo: string, entrada: unknown, chave?: string) {
  if (!chave) return null;
  if (chave.length > 128) return serviceResult({ error: 'Chave de operação inválida' }, { status: 400 });
  const row = await queryOne<{ assinatura: string; resposta: string; status: number }>(
    'SELECT assinatura,resposta,status FROM financeiro_operacoes WHERE chave=?', [`${clienteId}:${tipo}:${chave}`]);
  if (!row) return null;
  if (row.assinatura !== JSON.stringify(entrada)) return serviceResult({ error: 'Chave de operação já usada com dados diferentes' }, { status: 409 });
  return serviceResult(JSON.parse(row.resposta), { status: row.status });
}

export async function transacionarCredito(
  clienteId: number, tipo: string, entrada: unknown, chave: string | undefined,
  planejar: (tx: CreditoTransacao) => Promise<{ body: unknown; status: number }>,
) {
  if (chave && chave.length > 128) return serviceResult({ error: 'Chave de operação inválida' }, { status: 400 });
  const key = `${clienteId}:${tipo}:${chave || crypto.randomUUID()}`;
  const assinatura = JSON.stringify(entrada);
  const replay = async () => {
    const row = await queryOne<{ assinatura: string; resposta: string; status: number }>('SELECT assinatura,resposta,status FROM financeiro_operacoes WHERE chave=?', [key]);
    if (!row) return null;
    if (row.assinatura !== assinatura) throw new CreditoErro('Chave de operação já usada com dados diferentes');
    return serviceResult(JSON.parse(row.resposta), { status: row.status });
  };
  try {
    const existing = await replay();
    if (existing) return existing;
    const versao = (await queryOne<{ versao: number }>('SELECT versao FROM financeiro_versao WHERE id=1'))!.versao;
    const tx = new CreditoTransacao();
    const result = await planejar(tx);
    await batch([{ sql: `INSERT INTO financeiro_operacoes(id,chave,assinatura,tipo,cliente_id,resposta,status,validado)
      VALUES (?,?,?,?,?,?,?,CASE WHEN (SELECT versao FROM financeiro_versao WHERE id=1)=? THEN 1 ELSE 0 END)`,
      params: [tx.id, key, assinatura, tipo, clienteId, JSON.stringify(result.body), result.status, versao] }, ...tx.comandos]);
    return serviceResult(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof CreditoErro) return serviceResult({ error: error.message }, { status: error.status });
    if (/financeiro_conflito|financeiro_operacoes.chave/.test(String(error))) {
      try { const existing = await replay(); if (existing) return existing; }
      catch (replayError) { if (replayError instanceof CreditoErro) return serviceResult({ error: replayError.message }, { status: 409 }); throw replayError; }
      return serviceResult({ error: 'Os valores mudaram durante a operação. Atualize e tente novamente.' }, { status: 409 });
    }
    throw error;
  }
}
