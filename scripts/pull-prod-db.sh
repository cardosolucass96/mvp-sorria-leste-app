#!/bin/bash
set -euo pipefail

DB_NAME="sorria-leste-db"
TMP_EXPORT=".tmp-prod-data.sql"
TMP_FILTERED=".tmp-prod-filtered.sql"

cleanup() {
  rm -f "$TMP_EXPORT" "$TMP_FILTERED"
}
trap cleanup EXIT

APP_TABLES=()
while IFS= read -r table_name; do
  APP_TABLES+=("$table_name")
done < <(
  awk '
    /^CREATE TABLE IF NOT EXISTS / {
      table_name = $6
      gsub(/[("`]/, "", table_name)
      print table_name
    }
  ' lib/schema.sql
)

if [ "${#APP_TABLES[@]}" -eq 0 ]; then
  echo "❌ Nenhuma tabela encontrada em lib/schema.sql"
  exit 1
fi

echo "📦 Exportando dados de produção (sem schema)..."
npx wrangler d1 export "$DB_NAME" --remote --no-schema --output="$TMP_EXPORT"

echo "🔍 Filtrando tabelas definidas no schema local..."
{
  echo "PRAGMA foreign_keys=OFF;"
  echo "PRAGMA defer_foreign_keys=TRUE;"
  awk -v tables="$(printf '%s\n' "${APP_TABLES[@]}" | paste -sd'|' -)" '
    BEGIN {
      split(tables, names, "|")
      for (i in names) allowed[names[i]] = 1
    }
    /^INSERT INTO / {
      table_name = $3
      gsub(/^["`]|["`]$/, "", table_name)
      if (allowed[table_name]) print
    }
    END {
      print "PRAGMA foreign_keys=ON;"
    }
  ' "$TMP_EXPORT"
} > "$TMP_FILTERED"

echo "🗑️  Limpando banco local..."
rm -rf .wrangler/state/v3/d1

echo "📐 Aplicando schema local..."
npx wrangler d1 execute "$DB_NAME" --local --file=lib/schema.sql

echo "💾 Importando dados de produção..."
npx wrangler d1 execute "$DB_NAME" --local --file="$TMP_FILTERED"

echo "✅ Banco local sincronizado com produção!"
