import { execute, query, queryOne } from '@/lib/db';
import { SQLITE_UTC_NOW_EXPRESSION } from '@/lib/time';

interface SQLiteTabela {
  name: string;
}

interface SQLiteColuna {
  name: string;
}

let estruturaPronta = false;

export async function garantirEsquemaPagamentosGrupos() {
  if (estruturaPronta) return;

  const tabelaExiste = await queryOne<SQLiteTabela>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pagamentos_grupos'"
  );

  await execute(`
    CREATE TABLE IF NOT EXISTS pagamentos_grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atendimento_id INTEGER NOT NULL,
      recebido_por_id INTEGER NOT NULL,
      valor_total REAL NOT NULL,
      observacoes TEXT,
      cancelado INTEGER NOT NULL DEFAULT 0,
      motivo_cancelamento TEXT,
      created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW_EXPRESSION}),
      FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id),
      FOREIGN KEY (recebido_por_id) REFERENCES usuarios(id)
    )
  `);
  await execute(
    'CREATE INDEX IF NOT EXISTS idx_pagamentos_grupos_atendimento ON pagamentos_grupos(atendimento_id)'
  );

  const colunas = await query<SQLiteColuna>('PRAGMA table_info(pagamentos)');
  const temPagamentoGrupoId = colunas.some((coluna) => coluna.name === 'pagamento_grupo_id');

  if (!temPagamentoGrupoId) {
    await execute(
      'ALTER TABLE pagamentos ADD COLUMN pagamento_grupo_id INTEGER REFERENCES pagamentos_grupos(id)'
    );
  }

  await execute(
    'CREATE INDEX IF NOT EXISTS idx_pagamentos_pagamento_grupo ON pagamentos(pagamento_grupo_id)'
  );

  const colunasAlocacoes = await query<SQLiteColuna>('PRAGMA table_info(pagamentos_alocacoes)');
  const temCriadoPorId = colunasAlocacoes.some((coluna) => coluna.name === 'criado_por_id');
  const temOrigemComissao = colunasAlocacoes.some((coluna) => coluna.name === 'origem_comissao');
  const temPercentualComissao = colunasAlocacoes.some((coluna) => coluna.name === 'percentual_comissao');

  if (!temCriadoPorId) {
    await execute('ALTER TABLE pagamentos_alocacoes ADD COLUMN criado_por_id INTEGER REFERENCES usuarios(id)');
  }
  if (!temOrigemComissao) {
    await execute("ALTER TABLE pagamentos_alocacoes ADD COLUMN origem_comissao TEXT CHECK (origem_comissao IN ('avaliacao', 'acrescimo'))");
  }
  if (!temPercentualComissao) {
    await execute('ALTER TABLE pagamentos_alocacoes ADD COLUMN percentual_comissao REAL');
  }

  await execute(`
    UPDATE pagamentos_alocacoes
    SET criado_por_id = (
          SELECT i.criado_por_id
          FROM itens_atendimento i
          WHERE i.id = pagamentos_alocacoes.item_atendimento_id
        ),
        origem_comissao = (
          SELECT CASE WHEN i.adicionado_em_execucao = 1 THEN 'acrescimo' ELSE 'avaliacao' END
          FROM itens_atendimento i
          WHERE i.id = pagamentos_alocacoes.item_atendimento_id
        ),
        percentual_comissao = (
          SELECT CASE
                   WHEN i.adicionado_em_execucao = 1 THEN p.comissao_acrescimo
                   ELSE p.comissao_venda
                 END
          FROM itens_atendimento i
          INNER JOIN procedimentos p ON p.id = i.procedimento_id
          WHERE i.id = pagamentos_alocacoes.item_atendimento_id
        )
    WHERE item_atendimento_id IS NOT NULL
      AND (
        criado_por_id IS NULL
        OR origem_comissao IS NULL
        OR percentual_comissao IS NULL
      )
  `);

  await execute(`
    UPDATE pagamentos_alocacoes
    SET criado_por_id = (
          SELECT i.criado_por_id
          FROM agendamentos ag
          INNER JOIN itens_atendimento i ON i.id = ag.item_atendimento_origem_id
          WHERE ag.id = pagamentos_alocacoes.agendamento_id
        ),
        origem_comissao = (
          SELECT CASE WHEN i.adicionado_em_execucao = 1 THEN 'acrescimo' ELSE 'avaliacao' END
          FROM agendamentos ag
          INNER JOIN itens_atendimento i ON i.id = ag.item_atendimento_origem_id
          WHERE ag.id = pagamentos_alocacoes.agendamento_id
        ),
        percentual_comissao = (
          SELECT CASE
                   WHEN i.adicionado_em_execucao = 1 THEN p.comissao_acrescimo
                   ELSE p.comissao_venda
                 END
          FROM agendamentos ag
          INNER JOIN itens_atendimento i ON i.id = ag.item_atendimento_origem_id
          INNER JOIN procedimentos p ON p.id = i.procedimento_id
          WHERE ag.id = pagamentos_alocacoes.agendamento_id
        )
    WHERE agendamento_id IS NOT NULL
      AND (
        criado_por_id IS NULL
        OR origem_comissao IS NULL
        OR percentual_comissao IS NULL
      )
  `);

  if (!tabelaExiste?.name) {
    console.warn('[MIGRATION] Tabela pagamentos_grupos foi criada automaticamente para recuperar deploy sem migration.');
  } else if (!temPagamentoGrupoId) {
    console.warn('[MIGRATION] Coluna pagamentos.pagamento_grupo_id foi adicionada automaticamente.');
  } else if (!temCriadoPorId || !temOrigemComissao || !temPercentualComissao) {
    console.warn('[MIGRATION] Snapshot comercial em pagamentos_alocacoes foi adicionado automaticamente.');
  }

  estruturaPronta = true;
}
