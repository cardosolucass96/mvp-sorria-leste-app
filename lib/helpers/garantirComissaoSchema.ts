import { execute, query } from '@/lib/db';

interface SQLiteColumn {
  name: string;
}

let schemaProcedimentosGarantido = false;
let schemaComissoesGarantido = false;

export async function garantirSchemaProcedimentosComissaoAcrescimo() {
  if (schemaProcedimentosGarantido) return;

  const colunasProcedimentos = await query<SQLiteColumn>('PRAGMA table_info(procedimentos)');
  const temComissaoAcrescimoProcedimentos = colunasProcedimentos.some((coluna) => coluna.name === 'comissao_acrescimo');

  if (!temComissaoAcrescimoProcedimentos) {
    await execute('ALTER TABLE procedimentos ADD COLUMN comissao_acrescimo REAL NOT NULL DEFAULT 10');
    console.warn('[MIGRATION] Coluna procedimentos.comissao_acrescimo foi adicionada automaticamente.');
  }

  const colunasEtapas = await query<SQLiteColumn>('PRAGMA table_info(procedimento_etapas_modelo)');
  const temComissaoAcrescimoEtapas = colunasEtapas.some((coluna) => coluna.name === 'comissao_acrescimo');

  if (!temComissaoAcrescimoEtapas) {
    await execute('ALTER TABLE procedimento_etapas_modelo ADD COLUMN comissao_acrescimo REAL NOT NULL DEFAULT 10');
    console.warn('[MIGRATION] Coluna procedimento_etapas_modelo.comissao_acrescimo foi adicionada automaticamente.');
  }

  schemaProcedimentosGarantido = true;
}

export async function garantirSchemaComissoesOrigem() {
  if (schemaComissoesGarantido) return;

  const colunasComissoes = await query<SQLiteColumn>('PRAGMA table_info(comissoes)');
  const temOrigem = colunasComissoes.some((coluna) => coluna.name === 'origem');

  if (!temOrigem) {
    await execute("ALTER TABLE comissoes ADD COLUMN origem TEXT NOT NULL DEFAULT 'avaliacao'");
    await execute("UPDATE comissoes SET origem = 'execucao' WHERE tipo = 'execucao'");
    console.warn('[MIGRATION] Coluna comissoes.origem foi adicionada automaticamente.');
  }

  schemaComissoesGarantido = true;
}
