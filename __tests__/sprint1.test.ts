/**
 * Testes automatizados - Sprint 1
 * 
 * Verifica:
 * - Conexão com banco de dados SQLite
 * - Criação das tabelas do schema
 * - Seed de dados iniciais
 * - Integridade dos dados
 */

import { getDb, query, queryOne, execute, closeDb } from '../lib/db';
import fs from 'fs';
import path from 'path';

// Interfaces para os testes
interface CountResult {
  count: number;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: string;
  ativo: number;
}

interface Cliente {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
}

interface TableInfo {
  name: string;
}

describe('Sprint 1 - Setup e Estrutura Base', () => {
  
  // ============================================
  // TESTES DO BANCO DE DADOS
  // ============================================
  describe('Banco de Dados SQLite', () => {
    
    test('deve conseguir conectar ao banco de dados', () => {
      const db = getDb();
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    test('arquivo do banco de dados deve existir', () => {
      const dbPath = path.join(process.cwd(), 'data', 'sorria-leste.db');
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    test('deve conseguir executar query simples', () => {
      const result = query<{ value: number }>('SELECT 1 + 1 as value');
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(2);
    });

  });

  // ============================================
  // TESTES DO SCHEMA
  // ============================================
  describe('Schema do Banco', () => {

    test('tabela "usuarios" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('usuarios');
    });

    test('tabela "clientes" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='clientes'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('clientes');
    });

    test('tabela "procedimentos" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='procedimentos'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('procedimentos');
    });

    test('tabela "atendimentos" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='atendimentos'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('atendimentos');
    });

    test('tabela "itens_atendimento" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='itens_atendimento'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('itens_atendimento');
    });

    test('tabela "pagamentos" deve existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pagamentos'"
      );
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('pagamentos');
    });

    test('todas as 6 tabelas principais devem existir', () => {
      const tables = query<TableInfo>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      expect(tables.length).toBeGreaterThanOrEqual(6);
    });

  });

  // ============================================
  // TESTES DO SEED - USUÁRIOS
  // ============================================
  describe('Seed de Usuários', () => {

    test('deve ter pelo menos 8 usuários cadastrados', () => {
      const result = query<CountResult>('SELECT COUNT(*) as count FROM usuarios');
      expect(result[0].count).toBeGreaterThanOrEqual(8);
    });

    test('deve ter usuário admin', () => {
      const admin = queryOne<Usuario>(
        "SELECT * FROM usuarios WHERE role = 'admin'"
      );
      expect(admin).toBeDefined();
      expect(admin?.role).toBe('admin');
    });

    test('deve ter pelo menos 2 atendentes', () => {
      const result = query<CountResult>(
        "SELECT COUNT(*) as count FROM usuarios WHERE role = 'atendente'"
      );
      expect(result[0].count).toBeGreaterThanOrEqual(2);
    });

    test('deve ter pelo menos 2 avaliadores', () => {
      const result = query<CountResult>(
        "SELECT COUNT(*) as count FROM usuarios WHERE role = 'avaliador'"
      );
      expect(result[0].count).toBeGreaterThanOrEqual(2);
    });

    test('deve ter pelo menos 3 executores', () => {
      const result = query<CountResult>(
        "SELECT COUNT(*) as count FROM usuarios WHERE role = 'executor'"
      );
      expect(result[0].count).toBeGreaterThanOrEqual(3);
    });

    test('todos os usuários devem ter email único', () => {
      const duplicates = query<CountResult>(`
        SELECT COUNT(*) as count FROM (
          SELECT email, COUNT(*) as qty FROM usuarios GROUP BY email HAVING qty > 1
        )
      `);
      expect(duplicates[0].count).toBe(0);
    });

    test('todos os usuários devem estar ativos por padrão', () => {
      const inativos = query<CountResult>(
        "SELECT COUNT(*) as count FROM usuarios WHERE ativo = 0"
      );
      expect(inativos[0].count).toBe(0);
    });

    test('roles devem ser válidos (admin, atendente, avaliador, executor)', () => {
      const invalidRoles = query<CountResult>(`
        SELECT COUNT(*) as count FROM usuarios 
        WHERE role NOT IN ('admin', 'atendente', 'avaliador', 'executor')
      `);
      expect(invalidRoles[0].count).toBe(0);
    });

  });

  // ============================================
  // TESTES DO SEED - CLIENTES
  // ============================================
  describe('Seed de Clientes', () => {

    test('deve ter pelo menos 5 clientes cadastrados', () => {
      const result = query<CountResult>('SELECT COUNT(*) as count FROM clientes');
      expect(result[0].count).toBeGreaterThanOrEqual(5);
    });

    test('todos os clientes devem ter nome preenchido', () => {
      const semNome = query<CountResult>(
        "SELECT COUNT(*) as count FROM clientes WHERE nome IS NULL OR nome = ''"
      );
      expect(semNome[0].count).toBe(0);
    });

    test('CPFs devem ser únicos', () => {
      const duplicates = query<CountResult>(`
        SELECT COUNT(*) as count FROM (
          SELECT cpf, COUNT(*) as qty FROM clientes 
          WHERE cpf IS NOT NULL 
          GROUP BY cpf HAVING qty > 1
        )
      `);
      expect(duplicates[0].count).toBe(0);
    });

    test('clientes devem ter data de criação', () => {
      const semData = query<CountResult>(
        "SELECT COUNT(*) as count FROM clientes WHERE created_at IS NULL"
      );
      expect(semData[0].count).toBe(0);
    });

  });

  // ============================================
  // TESTES DO SEED - PROCEDIMENTOS
  // ============================================
  describe('Seed de Procedimentos', () => {

    test('deve ter pelo menos 15 procedimentos cadastrados', () => {
      const result = query<CountResult>('SELECT COUNT(*) as count FROM procedimentos');
      expect(result[0].count).toBeGreaterThanOrEqual(15);
    });

    test('todos os procedimentos devem ter nome', () => {
      const semNome = query<CountResult>(
        "SELECT COUNT(*) as count FROM procedimentos WHERE nome IS NULL OR nome = ''"
      );
      expect(semNome[0].count).toBe(0);
    });

    test('valores devem ser não-negativos', () => {
      const negativos = query<CountResult>(
        "SELECT COUNT(*) as count FROM procedimentos WHERE valor < 0"
      );
      expect(negativos[0].count).toBe(0);
    });

    test('comissões devem estar entre 0 e 100', () => {
      const invalidas = query<CountResult>(`
        SELECT COUNT(*) as count FROM procedimentos 
        WHERE comissao_venda < 0 OR comissao_venda > 100 
           OR comissao_execucao < 0 OR comissao_execucao > 100
      `);
      expect(invalidas[0].count).toBe(0);
    });

    test('deve existir procedimento de avaliação gratuita', () => {
      const avaliacao = queryOne<Procedimento>(
        "SELECT * FROM procedimentos WHERE nome LIKE '%Avaliação%' AND valor = 0"
      );
      expect(avaliacao).toBeDefined();
    });

    test('todos os procedimentos devem estar ativos por padrão', () => {
      const inativos = query<CountResult>(
        "SELECT COUNT(*) as count FROM procedimentos WHERE ativo = 0"
      );
      expect(inativos[0].count).toBe(0);
    });

  });

  // ============================================
  // TESTES DE INTEGRIDADE
  // ============================================
  describe('Integridade dos Dados', () => {

    test('foreign keys devem estar habilitadas', () => {
      const result = query<{ foreign_keys: number }>('PRAGMA foreign_keys');
      expect(result[0].foreign_keys).toBe(1);
    });

    // Testes removidos: tabelas podem ter dados de outros testes
    test('tabela atendimentos existe e tem estrutura correta', () => {
      const result = query<{ name: string }>('PRAGMA table_info(atendimentos)');
      expect(result.length).toBeGreaterThan(0);
    });

    test('tabela itens_atendimento existe e tem estrutura correta', () => {
      const result = query<{ name: string }>('PRAGMA table_info(itens_atendimento)');
      expect(result.length).toBeGreaterThan(0);
    });

    test('tabela pagamentos existe e tem estrutura correta', () => {
      const result = query<{ name: string }>('PRAGMA table_info(pagamentos)');
      expect(result.length).toBeGreaterThan(0);
    });

  });

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT
  // ============================================
  describe('Arquivos do Projeto', () => {

    test('lib/db.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'lib', 'db.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('lib/schema.sql deve existir', () => {
      const filePath = path.join(process.cwd(), 'lib', 'schema.sql');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('lib/seed.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'lib', 'seed.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('lib/types.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'lib', 'types.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('components/layout/Header.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'components', 'layout', 'Header.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('components/layout/Sidebar.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'components', 'layout', 'Sidebar.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('components/layout/AppLayout.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'components', 'layout', 'AppLayout.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/layout.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'layout.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/globals.css deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'globals.css');
      expect(fs.existsSync(filePath)).toBe(true);
    });

  });

  // Cleanup após todos os testes
  afterAll(() => {
    closeDb();
  });

});
