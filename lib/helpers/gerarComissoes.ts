import { batch, execute, query, queryOne } from '@/lib/db';
import { garantirSchemaComissoesOrigem, garantirSchemaProcedimentosComissaoAcrescimo } from '@/lib/helpers/garantirComissaoSchema';

interface ItemExecucaoComComissao {
  id: number;
  atendimento_id: number;
  executor_id: number | null;
  valor: number;
  comissao_execucao: number;
}

interface PagamentoAlocacaoComissaoRow {
  pagamento_alocacao_id: number;
  atendimento_id: number | null;
  item_atendimento_id: number | null;
  usuario_id: number | null;
  origem: 'avaliacao' | 'acrescimo' | null;
  percentual: number | null;
  valor_base: number;
  created_at: string;
}

function normalizarIds(ids: number[]): number[] {
  return [...new Set(ids
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

export async function gerarComissoesExecucaoItem(itemId: number): Promise<void> {
  await garantirSchemaProcedimentosComissaoAcrescimo();
  await garantirSchemaComissoesOrigem();

  const item = await queryOne<ItemExecucaoComComissao>(
    `SELECT ia.id, ia.atendimento_id, ia.executor_id, ia.valor, p.comissao_execucao
     FROM itens_atendimento ia
     JOIN procedimentos p ON p.id = ia.procedimento_id
     WHERE ia.id = ?`,
    [itemId]
  );

  if (!item || !item.executor_id || !(item.comissao_execucao > 0)) {
    return;
  }

  const jaExiste = await queryOne<{ id: number }>(
    "SELECT id FROM comissoes WHERE item_atendimento_id = ? AND tipo = 'execucao'",
    [itemId]
  );
  if (jaExiste) return;

  const valorBase = Number(item.valor || 0);
  const valorComissao = Number((valorBase * (item.comissao_execucao / 100)).toFixed(2));

  await execute(
    `INSERT INTO comissoes
      (atendimento_id, item_atendimento_id, usuario_id, tipo, origem, percentual, valor_base, valor_comissao)
     VALUES (?, ?, ?, 'execucao', 'execucao', ?, ?, ?)`,
    [item.atendimento_id, itemId, item.executor_id, item.comissao_execucao, valorBase, valorComissao]
  );
}

export async function gerarComissoesVendaPorAlocacoes(alocacaoIds: number[]): Promise<void> {
  const ids = normalizarIds(alocacaoIds);
  if (ids.length === 0) return;

  await garantirSchemaComissoesOrigem();

  const placeholders = ids.map(() => '?').join(',');
  const alocacoes = await query<PagamentoAlocacaoComissaoRow>(
    `SELECT
       pa.id as pagamento_alocacao_id,
       COALESCE(item_direto.atendimento_id, item_origem.atendimento_id) as atendimento_id,
       COALESCE(pa.item_atendimento_id, ag.item_atendimento_origem_id) as item_atendimento_id,
       pa.criado_por_id as usuario_id,
       pa.origem_comissao as origem,
       pa.percentual_comissao as percentual,
       pa.valor_alocado as valor_base,
       pa.created_at
     FROM pagamentos_alocacoes pa
     INNER JOIN pagamentos pg ON pg.id = pa.pagamento_id
     LEFT JOIN itens_atendimento item_direto ON item_direto.id = pa.item_atendimento_id
     LEFT JOIN agendamentos ag ON ag.id = pa.agendamento_id
     LEFT JOIN itens_atendimento item_origem ON item_origem.id = ag.item_atendimento_origem_id
     WHERE pa.id IN (${placeholders})
       AND pg.cancelado = 0`,
    ids
  );

  const inserts = alocacoes
    .filter((alocacao) =>
      alocacao.atendimento_id
      && alocacao.item_atendimento_id
      && alocacao.usuario_id
      && alocacao.origem
      && Number(alocacao.percentual || 0) > 0
      && Number(alocacao.valor_base || 0) > 0
    )
    .map((alocacao) => {
      const percentual = Number(alocacao.percentual || 0);
      const valorBase = Number(Number(alocacao.valor_base || 0).toFixed(2));
      const valorComissao = Number((valorBase * (percentual / 100)).toFixed(2));

      return {
        sql: `INSERT OR IGNORE INTO comissoes
                (atendimento_id, item_atendimento_id, usuario_id, tipo, origem, percentual, valor_base, valor_comissao, pagamento_alocacao_id, created_at)
              VALUES (?, ?, ?, 'venda', ?, ?, ?, ?, ?, ?)`,
        params: [
          alocacao.atendimento_id,
          alocacao.item_atendimento_id,
          alocacao.usuario_id,
          alocacao.origem,
          percentual,
          valorBase,
          valorComissao,
          alocacao.pagamento_alocacao_id,
          alocacao.created_at,
        ],
      };
    });

  if (inserts.length > 0) {
    await batch(inserts);
  }
}

export async function removerComissoesVendaPorAlocacoes(alocacaoIds: number[]): Promise<void> {
  const ids = normalizarIds(alocacaoIds);
  if (ids.length === 0) return;

  await garantirSchemaComissoesOrigem();

  const placeholders = ids.map(() => '?').join(',');
  await execute(
    `DELETE FROM comissoes
     WHERE tipo = 'venda'
       AND pagamento_alocacao_id IN (${placeholders})`,
    ids
  );
}
