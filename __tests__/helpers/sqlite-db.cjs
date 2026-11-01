// SQL real em memória; somente o transporte D1 é substituído. Requer Node 22+.
const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function createSqliteDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(join(process.cwd(), 'lib/schema.sql'), 'utf8'));
  function prepare(sql, params = []) {
    return {
      bind: (...values) => prepare(sql, values),
      first: async column => {
        const row = sqlite.prepare(sql).get(...params);
        return row ? (column ? row[column] : row) : null;
      },
      all: async () => ({ results: sqlite.prepare(sql).all(...params), success: true }),
      raw: async () => sqlite.prepare(sql).all(...params).map(Object.values),
      run: async () => {
        const result = sqlite.prepare(sql).run(...params);
        return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  const binding = {
    prepare,
    exec: async sql => { sqlite.exec(sql); return { count: 0, duration: 0 }; },
    batch: async statements => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, binding };
}
module.exports = { createSqliteDb };
