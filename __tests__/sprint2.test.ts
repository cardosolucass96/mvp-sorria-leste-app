/**
 * Testes automatizados - Sprint 2
 * 
 * Verifica:
 * - API de login
 * - API de CRUD de usuários
 * - Arquivos de autenticação
 * - Componentes de layout atualizados
 */

import { query, queryOne, execute, closeDb } from '../lib/db';
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

describe('Sprint 2 - Login Simples + Usuários', () => {

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT 2
  // ============================================
  describe('Arquivos do Projeto', () => {

    test('contexts/AuthContext.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'contexts', 'AuthContext.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/login/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'login', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/login/layout.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'login', 'layout.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/usuarios/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'usuarios', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/auth/login/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'auth', 'login', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/usuarios/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'usuarios', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/usuarios/[id]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'usuarios', '[id]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

  });

  // ============================================
  // TESTES DO CONTEXTO DE AUTENTICAÇÃO
  // ============================================
  describe('Contexto de Autenticação', () => {

    test('AuthContext deve exportar AuthProvider', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('export function AuthProvider');
    });

    test('AuthContext deve exportar useAuth', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('export function useAuth');
    });

    test('AuthContext deve ter função login', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('login:');
    });

    test('AuthContext deve ter função logout', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('logout:');
    });

    test('AuthContext deve ter função hasRole', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('hasRole:');
    });

    test('AuthContext deve usar localStorage', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'contexts', 'AuthContext.tsx'),
        'utf-8'
      );
      expect(content).toContain('localStorage');
    });

  });

  // ============================================
  // TESTES DO LAYOUT ATUALIZADO
  // ============================================
  describe('Layout com Autenticação', () => {

    test('app/layout.tsx deve importar AuthProvider', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'layout.tsx'),
        'utf-8'
      );
      expect(content).toContain('AuthProvider');
    });

    test('AppLayout deve usar useAuth', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'components', 'layout', 'AppLayout.tsx'),
        'utf-8'
      );
      expect(content).toContain('useAuth');
    });

    test('Sidebar deve filtrar menu por role', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'components', 'layout', 'Sidebar.tsx'),
        'utf-8'
      );
      expect(content).toContain('roles');
      expect(content).toContain('hasRole');
    });

    test('Header deve mostrar informações do usuário', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'components', 'layout', 'Header.tsx'),
        'utf-8'
      );
      expect(content).toContain('user');
      expect(content).toContain('logout');
    });

  });

  // ============================================
  // TESTES DE BANCO - OPERAÇÕES DE USUÁRIO
  // ============================================
  describe('Operações de Banco - Usuários', () => {

    test('deve conseguir buscar usuário por email', () => {
      const user = queryOne<Usuario>(
        "SELECT * FROM usuarios WHERE email = ?",
        ['admin@sorrialeste.com']
      );
      expect(user).toBeDefined();
      expect(user?.email).toBe('admin@sorrialeste.com');
    });

    test('deve retornar undefined para email inexistente', () => {
      const user = queryOne<Usuario>(
        "SELECT * FROM usuarios WHERE email = ?",
        ['naoexiste@email.com']
      );
      expect(user).toBeUndefined();
    });

    test('deve conseguir criar novo usuário', () => {
      const testEmail = `test-${Date.now()}@test.com`;
      
      execute(
        'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
        ['Teste Sprint2', testEmail, 'atendente']
      );

      const user = queryOne<Usuario>(
        'SELECT * FROM usuarios WHERE email = ?',
        [testEmail]
      );

      expect(user).toBeDefined();
      expect(user?.nome).toBe('Teste Sprint2');
      expect(user?.role).toBe('atendente');
      expect(user?.ativo).toBe(1);

      // Cleanup
      execute('DELETE FROM usuarios WHERE email = ?', [testEmail]);
    });

    test('deve conseguir atualizar usuário', () => {
      const testEmail = `test-update-${Date.now()}@test.com`;
      
      // Criar
      execute(
        'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
        ['Antes Update', testEmail, 'atendente']
      );

      // Atualizar
      execute(
        'UPDATE usuarios SET nome = ?, role = ? WHERE email = ?',
        ['Depois Update', 'avaliador', testEmail]
      );

      const user = queryOne<Usuario>(
        'SELECT * FROM usuarios WHERE email = ?',
        [testEmail]
      );

      expect(user?.nome).toBe('Depois Update');
      expect(user?.role).toBe('avaliador');

      // Cleanup
      execute('DELETE FROM usuarios WHERE email = ?', [testEmail]);
    });

    test('deve conseguir desativar usuário (soft delete)', () => {
      const testEmail = `test-delete-${Date.now()}@test.com`;
      
      // Criar
      execute(
        'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
        ['Para Desativar', testEmail, 'executor']
      );

      // Desativar
      execute(
        'UPDATE usuarios SET ativo = 0 WHERE email = ?',
        [testEmail]
      );

      const user = queryOne<Usuario>(
        'SELECT * FROM usuarios WHERE email = ?',
        [testEmail]
      );

      expect(user?.ativo).toBe(0);

      // Cleanup
      execute('DELETE FROM usuarios WHERE email = ?', [testEmail]);
    });

    test('não deve permitir emails duplicados', () => {
      const testEmail = `test-dup-${Date.now()}@test.com`;
      
      // Criar primeiro
      execute(
        'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
        ['Usuario 1', testEmail, 'atendente']
      );

      // Tentar criar duplicado deve falhar
      expect(() => {
        execute(
          'INSERT INTO usuarios (nome, email, role) VALUES (?, ?, ?)',
          ['Usuario 2', testEmail, 'avaliador']
        );
      }).toThrow();

      // Cleanup
      execute('DELETE FROM usuarios WHERE email = ?', [testEmail]);
    });

  });

  // ============================================
  // TESTES DE ROLES E PERMISSÕES
  // ============================================
  describe('Roles e Permissões', () => {

    test('roles válidos devem ser: admin, atendente, avaliador, executor', () => {
      const roles = query<{ role: string }>(
        'SELECT DISTINCT role FROM usuarios ORDER BY role'
      );
      
      const roleList = roles.map(r => r.role).sort();
      expect(roleList).toEqual(['admin', 'atendente', 'avaliador', 'executor']);
    });

    test('deve existir pelo menos um admin', () => {
      const admins = query<CountResult>(
        "SELECT COUNT(*) as count FROM usuarios WHERE role = 'admin' AND ativo = 1"
      );
      expect(admins[0].count).toBeGreaterThanOrEqual(1);
    });

    test('Sidebar deve definir roles para itens restritos', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'components', 'layout', 'Sidebar.tsx'),
        'utf-8'
      );
      
      // Verifica se usuários é restrito a admin
      expect(content).toContain("href: '/usuarios'");
      expect(content).toContain("roles: ['admin']");
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE LOGIN
  // ============================================
  describe('Página de Login', () => {

    test('página de login deve ter formulário', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'login', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('<form');
      expect(content).toContain('email');
    });

    test('página de login deve ter emails de teste', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'login', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('testEmails');
      expect(content).toContain('admin@sorrialeste.com');
    });

    test('página de login deve usar useAuth', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'login', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('useAuth');
      expect(content).toContain('login');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE USUÁRIOS
  // ============================================
  describe('Página de Usuários', () => {

    test('deve ter listagem de usuários', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'usuarios', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('usuarios');
      expect(content).toContain('<table');
    });

    test('deve ter formulário de criação/edição', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'usuarios', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleSubmit');
      expect(content).toContain('formData');
    });

    test('deve ter função de desativar usuário', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'usuarios', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleDelete');
      expect(content).toContain('Desativar');
    });

    test('deve ter função de reativar usuário', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'usuarios', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleReactivate');
      expect(content).toContain('Reativar');
    });

  });

  // Cleanup após todos os testes
  afterAll(() => {
    closeDb();
  });

});
