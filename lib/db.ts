import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Caminho do banco de dados SQLite
const DB_PATH = path.join(process.cwd(), 'data', 'sorria-leste.db');

// Garante que o diretório data existe
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Singleton do banco de dados
let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// Helper para executar queries
export function query<T = unknown>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

// Helper para executar query que retorna um único resultado
export function queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

// Helper para executar insert/update/delete
export function execute(sql: string, params: unknown[] = []): Database.RunResult {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

// Helper para executar múltiplos statements (usado no schema)
export function executeMany(sql: string): void {
  getDb().exec(sql);
}

// Fechar conexão (usar em cleanup)
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
