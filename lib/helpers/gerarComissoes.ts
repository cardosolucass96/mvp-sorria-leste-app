import { queryOne, batch } from '@/lib/db';

interface ItemComComissao {
  id: number;
  atendimento_id: number;
  criado_por_id: number | null;
  executor_id: number | null;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
}

export async function gerarComissoesItem(itemId: number): Promise<void> {
  const item = await queryOne<ItemComComissao>(
    `SELECT ia.id, ia.atendimento_id, ia.criado_por_id, ia.executor_id, ia.valor,
            p.comissao_venda, p.comissao_execucao
     FROM itens_atendimento ia
     JOIN procedimentos p ON p.id = ia.procedimento_id
     WHERE ia.id = ?`,
    [itemId]
  );

  if (!item) return;

  // Proteger contra duplicata
  const jaExiste = await queryOne<{ id: number }>(
    'SELECT id FROM comissoes WHERE item_atendimento_id = ?',
    [itemId]
  );
  if (jaExiste) return;

  const inserts: { sql: string; params: unknown[] }[] = [];

  // Comissão de venda (para o avaliador/criador)
  if (item.criado_por_id && item.comissao_venda > 0) {
    const valor = item.valor * (item.comissao_venda / 100);
    inserts.push({
      sql: `INSERT INTO comissoes
              (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao)
            VALUES (?, ?, ?, 'venda', ?, ?, ?)`,
      params: [item.atendimento_id, itemId, item.criado_por_id, item.comissao_venda, item.valor, valor],
    });
  }

  // Comissão de execução (para o executor)
  if (item.executor_id && item.comissao_execucao > 0) {
    const valor = item.valor * (item.comissao_execucao / 100);
    inserts.push({
      sql: `INSERT INTO comissoes
              (atendimento_id, item_atendimento_id, usuario_id, tipo, percentual, valor_base, valor_comissao)
            VALUES (?, ?, ?, 'execucao', ?, ?, ?)`,
      params: [item.atendimento_id, itemId, item.executor_id, item.comissao_execucao, item.valor, valor],
    });
  }

  if (inserts.length > 0) {
    await batch(inserts);
  }
}
