#!/bin/bash
set -e

DB_NAME="sorria-leste-db"
TMP_EXPORT=".tmp-prod-data.sql"
TMP_FILTERED=".tmp-prod-filtered.sql"

# Tabelas da aplicação (definidas em lib/schema.sql)
APP_TABLES=(
  agendamentos
  anexos_execucao
  atendimentos
  clientes
  comissoes
  etapas_procedimento
  itens_atendimento
  movimentacoes_saldo
  notas_execucao
  pagamentos
  pagamentos_itens
  parcelas
  procedimentos
  prontuarios
  prontuarios_etapa
  saldo_clientes
  usuarios
)

echo "📦 Exportando dados de produção (sem schema)..."
npx wrangler d1 export "$DB_NAME" --remote --no-schema --output="$TMP_EXPORT"

echo "🔍 Filtrando tabelas internas..."
# Monta pattern grep: só mantém INSERT de tabelas da aplicação
PATTERN=$(printf 'INSERT INTO "%s"' "${APP_TABLES[@]}" | sed 's/INSERT INTO/|INSERT INTO/g' | cut -c2-)
echo "PRAGMA defer_foreign_keys=TRUE;" > "$TMP_FILTERED"
grep -E "^($PATTERN)" "$TMP_EXPORT" >> "$TMP_FILTERED" || true

echo "🗑️  Limpando banco local..."
rm -rf .wrangler/state/v3/d1

echo "📐 Aplicando schema local..."
npx wrangler d1 execute "$DB_NAME" --local --file=lib/schema.sql

echo "💾 Importando dados de produção..."
npx wrangler d1 execute "$DB_NAME" --local --file="$TMP_FILTERED"

rm "$TMP_EXPORT" "$TMP_FILTERED"
echo "✅ Banco local sincronizado com produção!"
