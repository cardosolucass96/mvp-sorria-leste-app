import { execute, query, queryOne } from '@/lib/db';
import { SQLITE_UTC_NOW_EXPRESSION } from '@/lib/time';
import { roundMoney } from '@/lib/helpers/pagamentoFlow';
import type {
  FormaPagamentoComTaxa,
  FormaPagamentoHistorico,
  MetodoPagamento,
} from '@/lib/types';

interface SQLiteTabela {
  name: string;
}

interface SQLiteColuna {
  name: string;
}

interface FormaPagamentoRaw extends FormaPagamentoComTaxa {}

let estruturaPronta = false;

export const METODOS_PAGAMENTO_VALIDOS: MetodoPagamento[] = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'crediario',
  'afins_sorria',
];

export function isMetodoPagamentoValido(value: unknown): value is MetodoPagamento {
  return typeof value === 'string' && METODOS_PAGAMENTO_VALIDOS.includes(value as MetodoPagamento);
}

export function normalizarSubgrupoFormaPagamento(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizarGrupoFormaPagamento(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function calcularValorTaxa(valorBruto: number, taxaPercentual = 0, taxaFixa = 0): number {
  return roundMoney((valorBruto * taxaPercentual) / 100 + taxaFixa);
}

export function calcularValorLiquido(valorBruto: number, taxaPercentual = 0, taxaFixa = 0): number {
  return roundMoney(valorBruto - calcularValorTaxa(valorBruto, taxaPercentual, taxaFixa));
}

export async function garantirEsquemaFormasPagamento() {
  if (estruturaPronta) return;

  const tabelaExiste = await queryOne<SQLiteTabela>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='formas_pagamento'"
  );

  await execute(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unidade_id INTEGER NOT NULL,
      grupo TEXT NOT NULL,
      subgrupo TEXT NOT NULL DEFAULT '',
      metodo_base TEXT NOT NULL CHECK (metodo_base IN ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'crediario', 'afins_sorria')),
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      updated_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      FOREIGN KEY (unidade_id) REFERENCES unidades(id),
      UNIQUE (unidade_id, grupo, subgrupo)
    )
  `);
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_formas_pagamento_unidade ON formas_pagamento(unidade_id)'
  );
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo ON formas_pagamento(unidade_id, ativo)'
  );

  await execute(`
    CREATE TABLE IF NOT EXISTS formas_pagamento_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forma_pagamento_id INTEGER NOT NULL,
      taxa_percentual REAL NOT NULL DEFAULT 0,
      taxa_fixa REAL NOT NULL DEFAULT 0,
      vigente_de TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      vigente_ate TEXT,
      alterado_por_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE CASCADE,
      FOREIGN KEY (alterado_por_id) REFERENCES usuarios(id)
    )
  `);
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_formas_pagamento_historico_forma ON formas_pagamento_historico(forma_pagamento_id, vigente_ate, vigente_de)'
  );

  const colunasPagamentos = await query<SQLiteColuna>('PRAGMA table_info(pagamentos)');
  const ensurePagamentoColuna = async (columnName: string, sql: string) => {
    if (!colunasPagamentos.some((coluna) => coluna.name === columnName)) {
      await execute(sql);
    }
  };

  await ensurePagamentoColuna(
    'forma_pagamento_id',
    'ALTER TABLE pagamentos ADD COLUMN forma_pagamento_id INTEGER REFERENCES formas_pagamento(id)'
  );
  await ensurePagamentoColuna(
    'forma_pagamento_grupo_snapshot',
    'ALTER TABLE pagamentos ADD COLUMN forma_pagamento_grupo_snapshot TEXT'
  );
  await ensurePagamentoColuna(
    'forma_pagamento_subgrupo_snapshot',
    "ALTER TABLE pagamentos ADD COLUMN forma_pagamento_subgrupo_snapshot TEXT NOT NULL DEFAULT ''"
  );
  await ensurePagamentoColuna(
    'taxa_percentual_snapshot',
    'ALTER TABLE pagamentos ADD COLUMN taxa_percentual_snapshot REAL'
  );
  await ensurePagamentoColuna(
    'taxa_fixa_snapshot',
    'ALTER TABLE pagamentos ADD COLUMN taxa_fixa_snapshot REAL'
  );
  await ensurePagamentoColuna(
    'valor_taxa',
    'ALTER TABLE pagamentos ADD COLUMN valor_taxa REAL'
  );
  await ensurePagamentoColuna(
    'valor_liquido',
    'ALTER TABLE pagamentos ADD COLUMN valor_liquido REAL'
  );

  await execute(
    'CREATE INDEX IF NOT EXISTS idx_pagamentos_forma_pagamento_id ON pagamentos(forma_pagamento_id)'
  );

  await execute(`
    UPDATE pagamentos
    SET forma_pagamento_subgrupo_snapshot = COALESCE(forma_pagamento_subgrupo_snapshot, '')
    WHERE forma_pagamento_subgrupo_snapshot IS NULL
  `);

  await execute(`
    UPDATE pagamentos
    SET taxa_percentual_snapshot = COALESCE(taxa_percentual_snapshot, 0),
        taxa_fixa_snapshot = COALESCE(taxa_fixa_snapshot, 0),
        valor_taxa = COALESCE(valor_taxa, 0),
        valor_liquido = COALESCE(valor_liquido, valor)
    WHERE taxa_percentual_snapshot IS NULL
       OR taxa_fixa_snapshot IS NULL
       OR valor_taxa IS NULL
       OR valor_liquido IS NULL
  `);

  if (!tabelaExiste?.name) {
    console.warn('[MIGRATION] Tabelas de formas de pagamento foram criadas automaticamente.');
  }

  estruturaPronta = true;
}

export async function listarFormasPagamentoDaUnidade(
  unidadeId: number,
  options?: { incluirInativas?: boolean }
): Promise<FormaPagamentoComTaxa[]> {
  await garantirEsquemaFormasPagamento();
  const incluirInativas = Boolean(options?.incluirInativas);
  const params: unknown[] = [unidadeId];
  const filtroAtivo = incluirInativas ? '' : 'AND fp.ativo = 1';

  const rows = await query<FormaPagamentoRaw>(
    `SELECT
       fp.*,
       COALESCE(h.taxa_percentual, 0) as taxa_percentual,
       COALESCE(h.taxa_fixa, 0) as taxa_fixa,
       h.vigente_de,
       h.vigente_ate
     FROM formas_pagamento fp
     LEFT JOIN formas_pagamento_historico h ON h.id = (
       SELECT h2.id
       FROM formas_pagamento_historico h2
       WHERE h2.forma_pagamento_id = fp.id
         AND h2.vigente_ate IS NULL
       ORDER BY datetime(h2.vigente_de) DESC, h2.id DESC
       LIMIT 1
     )
     WHERE fp.unidade_id = ?
       ${filtroAtivo}
     ORDER BY fp.grupo COLLATE NOCASE ASC, fp.subgrupo COLLATE NOCASE ASC, fp.id ASC`,
    params
  );

  return rows.map((row) => ({
    ...row,
    subgrupo: row.subgrupo ?? '',
    taxa_percentual: Number(row.taxa_percentual ?? 0),
    taxa_fixa: Number(row.taxa_fixa ?? 0),
  }));
}

export async function buscarFormaPagamentoDaUnidade(
  formaPagamentoId: number,
  unidadeId: number,
  options?: { incluirInativas?: boolean }
): Promise<FormaPagamentoComTaxa | null> {
  await garantirEsquemaFormasPagamento();
  const incluirInativas = Boolean(options?.incluirInativas);
  const filtroAtivo = incluirInativas ? '' : 'AND fp.ativo = 1';

  const row = await queryOne<FormaPagamentoRaw>(
    `SELECT
       fp.*,
       COALESCE(h.taxa_percentual, 0) as taxa_percentual,
       COALESCE(h.taxa_fixa, 0) as taxa_fixa,
       h.vigente_de,
       h.vigente_ate
     FROM formas_pagamento fp
     LEFT JOIN formas_pagamento_historico h ON h.id = (
       SELECT h2.id
       FROM formas_pagamento_historico h2
       WHERE h2.forma_pagamento_id = fp.id
         AND h2.vigente_ate IS NULL
       ORDER BY datetime(h2.vigente_de) DESC, h2.id DESC
       LIMIT 1
     )
     WHERE fp.id = ?
       AND fp.unidade_id = ?
       ${filtroAtivo}`,
    [formaPagamentoId, unidadeId]
  );

  if (!row) return null;

  return {
    ...row,
    subgrupo: row.subgrupo ?? '',
    taxa_percentual: Number(row.taxa_percentual ?? 0),
    taxa_fixa: Number(row.taxa_fixa ?? 0),
  };
}

export async function listarHistoricoFormaPagamento(formaPagamentoId: number): Promise<FormaPagamentoHistorico[]> {
  await garantirEsquemaFormasPagamento();
  const rows = await query<FormaPagamentoHistorico>(
    `SELECT *
     FROM formas_pagamento_historico
     WHERE forma_pagamento_id = ?
     ORDER BY datetime(vigente_de) DESC, id DESC`,
    [formaPagamentoId]
  );

  return rows.map((row) => ({
    ...row,
    taxa_percentual: Number(row.taxa_percentual ?? 0),
    taxa_fixa: Number(row.taxa_fixa ?? 0),
  }));
}
