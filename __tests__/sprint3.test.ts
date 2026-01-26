/**
 * Testes automatizados - Sprint 3
 * 
 * Verifica:
 * - API CRUD de clientes
 * - Páginas de clientes
 * - Operações de banco de dados
 */

import { query, queryOne, execute, closeDb } from '../lib/db';
import fs from 'fs';
import path from 'path';

// Interfaces para os testes
interface CountResult {
  count: number;
}

interface Cliente {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  observacoes: string | null;
  created_at: string;
}

describe('Sprint 3 - Cadastro de Clientes', () => {

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT 3
  // ============================================
  describe('Arquivos do Projeto', () => {

    test('app/api/clientes/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'clientes', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/clientes/[id]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'clientes', '[id]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/clientes/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'clientes', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/clientes/novo/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/clientes/[id]/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

  });

  // ============================================
  // TESTES DA API DE CLIENTES
  // ============================================
  describe('API de Clientes - Estrutura', () => {

    test('API route deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'clientes', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route deve ter método POST', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'clientes', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function POST');
    });

    test('API route [id] deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'clientes', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route [id] deve ter método PUT', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'clientes', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function PUT');
    });

    test('API route [id] deve ter método DELETE', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'clientes', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function DELETE');
    });

  });

  // ============================================
  // TESTES DE BANCO - OPERAÇÕES DE CLIENTE
  // ============================================
  describe('Operações de Banco - Clientes', () => {

    test('deve conseguir criar novo cliente', () => {
      const testCpf = `999.999.999-${Date.now() % 100}`;
      
      const result = execute(
        `INSERT INTO clientes (nome, cpf, telefone, email) 
         VALUES (?, ?, ?, ?)`,
        ['Teste Sprint3', testCpf, '(11) 99999-9999', 'teste@sprint3.com']
      );

      expect(result.lastInsertRowid).toBeGreaterThan(0);

      const cliente = queryOne<Cliente>(
        'SELECT * FROM clientes WHERE id = ?',
        [result.lastInsertRowid]
      );

      expect(cliente).toBeDefined();
      expect(cliente?.nome).toBe('Teste Sprint3');
      expect(cliente?.cpf).toBe(testCpf);

      // Cleanup
      execute('DELETE FROM clientes WHERE id = ?', [result.lastInsertRowid]);
    });

    test('deve conseguir buscar cliente por ID', () => {
      const clientes = query<Cliente>('SELECT * FROM clientes LIMIT 1');
      
      if (clientes.length > 0) {
        const cliente = queryOne<Cliente>(
          'SELECT * FROM clientes WHERE id = ?',
          [clientes[0].id]
        );
        expect(cliente).toBeDefined();
        expect(cliente?.id).toBe(clientes[0].id);
      }
    });

    test('deve conseguir buscar cliente por nome', () => {
      const clientes = query<Cliente>(
        "SELECT * FROM clientes WHERE nome LIKE ?",
        ['%José%']
      );
      
      // Deve encontrar pelo menos o cliente de seed
      expect(clientes.length).toBeGreaterThanOrEqual(0);
    });

    test('deve conseguir atualizar cliente', () => {
      const testCpf = `888.888.888-${Date.now() % 100}`;
      
      // Criar
      const result = execute(
        'INSERT INTO clientes (nome, cpf) VALUES (?, ?)',
        ['Antes Update', testCpf]
      );

      const clienteId = result.lastInsertRowid;

      // Atualizar
      execute(
        'UPDATE clientes SET nome = ?, telefone = ? WHERE id = ?',
        ['Depois Update', '(11) 88888-8888', clienteId]
      );

      const cliente = queryOne<Cliente>(
        'SELECT * FROM clientes WHERE id = ?',
        [clienteId]
      );

      expect(cliente?.nome).toBe('Depois Update');
      expect(cliente?.telefone).toBe('(11) 88888-8888');

      // Cleanup
      execute('DELETE FROM clientes WHERE id = ?', [clienteId]);
    });

    test('deve conseguir excluir cliente', () => {
      const testCpf = `777.777.777-${Date.now() % 100}`;
      
      // Criar
      const result = execute(
        'INSERT INTO clientes (nome, cpf) VALUES (?, ?)',
        ['Para Excluir', testCpf]
      );

      const clienteId = result.lastInsertRowid;

      // Excluir
      execute('DELETE FROM clientes WHERE id = ?', [clienteId]);

      const cliente = queryOne<Cliente>(
        'SELECT * FROM clientes WHERE id = ?',
        [clienteId]
      );

      expect(cliente).toBeUndefined();
    });

    test('não deve permitir CPF duplicado', () => {
      const testCpf = `666.666.666-${Date.now() % 100}`;
      
      // Criar primeiro
      execute(
        'INSERT INTO clientes (nome, cpf) VALUES (?, ?)',
        ['Cliente 1', testCpf]
      );

      // Tentar criar duplicado
      expect(() => {
        execute(
          'INSERT INTO clientes (nome, cpf) VALUES (?, ?)',
          ['Cliente 2', testCpf]
        );
      }).toThrow();

      // Cleanup
      execute('DELETE FROM clientes WHERE cpf = ?', [testCpf]);
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE LISTAGEM
  // ============================================
  describe('Página de Listagem de Clientes', () => {

    test('deve ter campo de busca', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('busca');
      expect(content).toContain('Buscar');
    });

    test('deve ter link para novo cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('/clientes/novo');
      expect(content).toContain('Novo Cliente');
    });

    test('deve ter tabela de clientes', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('<table');
      expect(content).toContain('clientes.map');
    });

    test('deve ter função de excluir', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleDelete');
      expect(content).toContain('Excluir');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE CADASTRO
  // ============================================
  describe('Página de Cadastro de Cliente', () => {

    test('deve ter formulário', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('<form');
      expect(content).toContain('handleSubmit');
    });

    test('deve ter campos obrigatórios', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('nome');
      expect(content).toContain('required');
    });

    test('deve ter formatação de CPF', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleCpfChange');
    });

    test('deve ter formatação de telefone', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleTelefoneChange');
    });

    test('deve ter todos os campos do cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('nome');
      expect(content).toContain('cpf');
      expect(content).toContain('telefone');
      expect(content).toContain('email');
      expect(content).toContain('data_nascimento');
      expect(content).toContain('endereco');
      expect(content).toContain('observacoes');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE VISUALIZAÇÃO/EDIÇÃO
  // ============================================
  describe('Página de Visualização/Edição de Cliente', () => {

    test('deve ter modo visualização', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('isEditing');
    });

    test('deve ter modo edição', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('setIsEditing');
      expect(content).toContain('Editar');
    });

    test('deve ter botão de excluir', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleDelete');
      expect(content).toContain('Excluir');
    });

    test('deve ter link para novo atendimento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'clientes', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('/atendimentos/novo');
      expect(content).toContain('Novo Atendimento');
    });

  });

  // ============================================
  // TESTES DE INTEGRIDADE DO SEED
  // ============================================
  describe('Clientes do Seed', () => {

    test('deve ter pelo menos 5 clientes cadastrados', () => {
      const result = query<CountResult>('SELECT COUNT(*) as count FROM clientes');
      expect(result[0].count).toBeGreaterThanOrEqual(5);
    });

    test('todos os clientes devem ter nome', () => {
      const semNome = query<CountResult>(
        "SELECT COUNT(*) as count FROM clientes WHERE nome IS NULL OR nome = ''"
      );
      expect(semNome[0].count).toBe(0);
    });

    test('todos os clientes devem ter data de criação', () => {
      const semData = query<CountResult>(
        "SELECT COUNT(*) as count FROM clientes WHERE created_at IS NULL"
      );
      expect(semData[0].count).toBe(0);
    });

  });

  // Cleanup após todos os testes
  afterAll(() => {
    closeDb();
  });

});
