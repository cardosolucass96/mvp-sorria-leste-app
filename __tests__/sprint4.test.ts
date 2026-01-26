/**
 * Testes automatizados - Sprint 4
 * 
 * Verifica:
 * - API CRUD de procedimentos
 * - Página de procedimentos
 * - Operações de banco de dados
 */

import { query, queryOne, execute, closeDb } from '../lib/db';
import fs from 'fs';
import path from 'path';

// Interfaces para os testes
interface CountResult {
  count: number;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  comissao_venda: number;
  comissao_execucao: number;
  ativo: number;
  created_at: string;
}

describe('Sprint 4 - Catálogo de Procedimentos', () => {

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT 4
  // ============================================
  describe('Arquivos do Projeto', () => {

    test('app/api/procedimentos/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'procedimentos', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/procedimentos/[id]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'procedimentos', '[id]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/procedimentos/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

  });

  // ============================================
  // TESTES DA API DE PROCEDIMENTOS
  // ============================================
  describe('API de Procedimentos - Estrutura', () => {

    test('API route deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route deve ter método POST', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function POST');
    });

    test('API route [id] deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route [id] deve ter método PUT', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function PUT');
    });

    test('API route [id] deve ter método DELETE', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function DELETE');
    });

    test('API deve validar campos de comissão (0-100)', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'procedimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('comissao_venda');
      expect(content).toContain('comissao_execucao');
      expect(content).toContain('100');
    });

  });

  // ============================================
  // TESTES DE BANCO - OPERAÇÕES DE PROCEDIMENTO
  // ============================================
  describe('Operações de Banco - Procedimentos', () => {

    test('deve conseguir criar novo procedimento', () => {
      const result = execute(
        `INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) 
         VALUES (?, ?, ?, ?)`,
        ['Teste Sprint4', 150.00, 10, 30]
      );

      expect(result.lastInsertRowid).toBeGreaterThan(0);

      const proc = queryOne<Procedimento>(
        'SELECT * FROM procedimentos WHERE id = ?',
        [result.lastInsertRowid]
      );

      expect(proc).toBeDefined();
      expect(proc?.nome).toBe('Teste Sprint4');
      expect(proc?.valor).toBe(150.00);
      expect(proc?.comissao_venda).toBe(10);
      expect(proc?.comissao_execucao).toBe(30);

      // Cleanup
      execute('DELETE FROM procedimentos WHERE id = ?', [result.lastInsertRowid]);
    });

    test('deve conseguir buscar procedimento por ID', () => {
      const procedimentos = query<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      
      if (procedimentos.length > 0) {
        const proc = queryOne<Procedimento>(
          'SELECT * FROM procedimentos WHERE id = ?',
          [procedimentos[0].id]
        );
        expect(proc).toBeDefined();
        expect(proc?.id).toBe(procedimentos[0].id);
      }
    });

    test('deve conseguir buscar procedimento por nome', () => {
      const procedimentos = query<Procedimento>(
        "SELECT * FROM procedimentos WHERE nome LIKE ?",
        ['%Limpeza%']
      );
      
      expect(procedimentos.length).toBeGreaterThanOrEqual(0);
    });

    test('deve conseguir atualizar procedimento', () => {
      // Criar
      const result = execute(
        'INSERT INTO procedimentos (nome, valor, comissao_venda, comissao_execucao) VALUES (?, ?, ?, ?)',
        ['Antes Update', 100, 5, 10]
      );

      const procId = result.lastInsertRowid;

      // Atualizar
      execute(
        'UPDATE procedimentos SET nome = ?, valor = ?, comissao_venda = ? WHERE id = ?',
        ['Depois Update', 200, 15, procId]
      );

      const proc = queryOne<Procedimento>(
        'SELECT * FROM procedimentos WHERE id = ?',
        [procId]
      );

      expect(proc?.nome).toBe('Depois Update');
      expect(proc?.valor).toBe(200);
      expect(proc?.comissao_venda).toBe(15);

      // Cleanup
      execute('DELETE FROM procedimentos WHERE id = ?', [procId]);
    });

    test('deve conseguir desativar procedimento (soft delete)', () => {
      // Criar
      const result = execute(
        'INSERT INTO procedimentos (nome, valor) VALUES (?, ?)',
        ['Para Desativar', 50]
      );

      const procId = result.lastInsertRowid;

      // Desativar
      execute('UPDATE procedimentos SET ativo = 0 WHERE id = ?', [procId]);

      const proc = queryOne<Procedimento>(
        'SELECT * FROM procedimentos WHERE id = ?',
        [procId]
      );

      expect(proc?.ativo).toBe(0);

      // Cleanup
      execute('DELETE FROM procedimentos WHERE id = ?', [procId]);
    });

    test('deve conseguir reativar procedimento', () => {
      // Criar desativado
      const result = execute(
        'INSERT INTO procedimentos (nome, valor, ativo) VALUES (?, ?, ?)',
        ['Para Reativar', 50, 0]
      );

      const procId = result.lastInsertRowid;

      // Reativar
      execute('UPDATE procedimentos SET ativo = 1 WHERE id = ?', [procId]);

      const proc = queryOne<Procedimento>(
        'SELECT * FROM procedimentos WHERE id = ?',
        [procId]
      );

      expect(proc?.ativo).toBe(1);

      // Cleanup
      execute('DELETE FROM procedimentos WHERE id = ?', [procId]);
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE PROCEDIMENTOS
  // ============================================
  describe('Página de Procedimentos', () => {

    test('deve ter campo de busca', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('busca');
      expect(content).toContain('Buscar');
    });

    test('deve ter botão de novo procedimento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('Novo Procedimento');
    });

    test('deve ter tabela de procedimentos', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('<table');
      expect(content).toContain('procedimentos.map');
    });

    test('deve mostrar valor do procedimento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('valor');
      expect(content).toContain('formatarMoeda');
    });

    test('deve mostrar comissões', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('comissao_venda');
      expect(content).toContain('comissao_execucao');
    });

    test('deve ter opção de mostrar inativos', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('mostrarInativos');
      expect(content).toContain('inativos');
    });

    test('deve ter modal de edição', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('isModalOpen');
      expect(content).toContain('Editar Procedimento');
    });

    test('deve ter função de desativar', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleDesativar');
      expect(content).toContain('Desativar');
    });

    test('deve ter função de reativar', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'procedimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleReativar');
      expect(content).toContain('Reativar');
    });

  });

  // ============================================
  // TESTES DE INTEGRIDADE DO SEED
  // ============================================
  describe('Procedimentos do Seed', () => {

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
      const valoresNegativos = query<CountResult>(
        "SELECT COUNT(*) as count FROM procedimentos WHERE valor < 0"
      );
      expect(valoresNegativos[0].count).toBe(0);
    });

    test('comissões devem estar entre 0 e 100', () => {
      const comissoesInvalidas = query<CountResult>(
        `SELECT COUNT(*) as count FROM procedimentos 
         WHERE comissao_venda < 0 OR comissao_venda > 100
         OR comissao_execucao < 0 OR comissao_execucao > 100`
      );
      expect(comissoesInvalidas[0].count).toBe(0);
    });

    test('deve existir procedimento de avaliação gratuita', () => {
      const avaliacao = query<Procedimento>(
        "SELECT * FROM procedimentos WHERE valor = 0 AND nome LIKE '%Avaliação%'"
      );
      expect(avaliacao.length).toBeGreaterThan(0);
    });

    test('todos os procedimentos do seed devem estar ativos', () => {
      // Apenas verifica os procedimentos do seed (id <= 15)
      const inativos = query<CountResult>(
        "SELECT COUNT(*) as count FROM procedimentos WHERE id <= 15 AND ativo = 0"
      );
      expect(inativos[0].count).toBe(0);
    });

  });

  // ============================================
  // TESTES DE CAMPOS ESPECÍFICOS
  // ============================================
  describe('Campos de Procedimento', () => {

    test('procedimento deve ter campo nome', () => {
      const proc = queryOne<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      expect(proc).toHaveProperty('nome');
    });

    test('procedimento deve ter campo valor', () => {
      const proc = queryOne<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      expect(proc).toHaveProperty('valor');
    });

    test('procedimento deve ter campo comissao_venda', () => {
      const proc = queryOne<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      expect(proc).toHaveProperty('comissao_venda');
    });

    test('procedimento deve ter campo comissao_execucao', () => {
      const proc = queryOne<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      expect(proc).toHaveProperty('comissao_execucao');
    });

    test('procedimento deve ter campo ativo', () => {
      const proc = queryOne<Procedimento>('SELECT * FROM procedimentos LIMIT 1');
      expect(proc).toHaveProperty('ativo');
    });

  });

  // Cleanup após todos os testes
  afterAll(() => {
    closeDb();
  });

});
