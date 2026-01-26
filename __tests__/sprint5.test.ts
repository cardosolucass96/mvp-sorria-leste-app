/**
 * Testes automatizados - Sprint 5
 * 
 * Verifica:
 * - API CRUD de atendimentos
 * - Páginas de atendimentos (lista, novo, detalhes)
 * - Pipeline e transições de status
 * - Operações de banco de dados
 */

import { query, queryOne, execute, closeDb } from '../lib/db';
import fs from 'fs';
import path from 'path';

// Interfaces para os testes
interface CountResult {
  count: number;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  avaliador_id: number | null;
  status: string;
  created_at: string;
  finalizado_at: string | null;
}

interface Cliente {
  id: number;
  nome: string;
}

describe('Sprint 5 - Atendimentos e Pipeline', () => {

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT 5
  // ============================================
  describe('Arquivos do Projeto', () => {

    test('app/api/atendimentos/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'atendimentos', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/atendimentos/[id]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/atendimentos/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/atendimentos/novo/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'atendimentos', 'novo', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/atendimentos/[id]/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

  });

  // ============================================
  // TESTES DA API DE ATENDIMENTOS
  // ============================================
  describe('API de Atendimentos - Estrutura', () => {

    test('API route deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route deve ter método POST', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function POST');
    });

    test('API route [id] deve ter método GET', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function GET');
    });

    test('API route [id] deve ter método PUT', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('export async function PUT');
    });

    test('API deve incluir dados do cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('cliente_nome');
      expect(content).toContain('INNER JOIN clientes');
    });

  });

  // ============================================
  // TESTES DE BANCO - OPERAÇÕES DE ATENDIMENTO
  // ============================================
  describe('Operações de Banco - Atendimentos', () => {

    let clienteTesteId: number;

    beforeAll(() => {
      // Cria cliente para testes
      const result = execute(
        "INSERT INTO clientes (nome, cpf) VALUES (?, ?)",
        ['Cliente Teste Sprint5', '999.999.999-99']
      );
      clienteTesteId = Number(result.lastInsertRowid);
    });

    afterAll(() => {
      // Limpa atendimentos de teste
      execute('DELETE FROM atendimentos WHERE cliente_id = ?', [clienteTesteId]);
      execute('DELETE FROM clientes WHERE id = ?', [clienteTesteId]);
    });

    test('deve conseguir criar novo atendimento', () => {
      const result = execute(
        "INSERT INTO atendimentos (cliente_id, status) VALUES (?, 'triagem')",
        [clienteTesteId]
      );

      expect(result.lastInsertRowid).toBeGreaterThan(0);

      const atendimento = queryOne<Atendimento>(
        'SELECT * FROM atendimentos WHERE id = ?',
        [result.lastInsertRowid]
      );

      expect(atendimento).toBeDefined();
      expect(atendimento?.cliente_id).toBe(clienteTesteId);
      expect(atendimento?.status).toBe('triagem');

      // Cleanup
      execute('DELETE FROM atendimentos WHERE id = ?', [result.lastInsertRowid]);
    });

    test('deve conseguir buscar atendimento por ID', () => {
      const result = execute(
        "INSERT INTO atendimentos (cliente_id, status) VALUES (?, 'triagem')",
        [clienteTesteId]
      );

      const atendimento = queryOne<Atendimento>(
        'SELECT * FROM atendimentos WHERE id = ?',
        [result.lastInsertRowid]
      );

      expect(atendimento).toBeDefined();
      expect(atendimento?.id).toBe(Number(result.lastInsertRowid));

      // Cleanup
      execute('DELETE FROM atendimentos WHERE id = ?', [result.lastInsertRowid]);
    });

    test('deve conseguir atualizar status do atendimento', () => {
      const result = execute(
        "INSERT INTO atendimentos (cliente_id, status) VALUES (?, 'triagem')",
        [clienteTesteId]
      );

      const atendimentoId = result.lastInsertRowid;

      execute(
        "UPDATE atendimentos SET status = 'avaliacao' WHERE id = ?",
        [atendimentoId]
      );

      const atendimento = queryOne<Atendimento>(
        'SELECT * FROM atendimentos WHERE id = ?',
        [atendimentoId]
      );

      expect(atendimento?.status).toBe('avaliacao');

      // Cleanup
      execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);
    });

    test('deve conseguir vincular avaliador ao atendimento', () => {
      const result = execute(
        "INSERT INTO atendimentos (cliente_id, status) VALUES (?, 'triagem')",
        [clienteTesteId]
      );

      const atendimentoId = result.lastInsertRowid;

      // Pega um avaliador
      const avaliador = queryOne<{ id: number }>(
        "SELECT id FROM usuarios WHERE role = 'avaliador' LIMIT 1"
      );

      if (avaliador) {
        execute(
          'UPDATE atendimentos SET avaliador_id = ? WHERE id = ?',
          [avaliador.id, atendimentoId]
        );

        const atendimento = queryOne<Atendimento>(
          'SELECT * FROM atendimentos WHERE id = ?',
          [atendimentoId]
        );

        expect(atendimento?.avaliador_id).toBe(avaliador.id);
      }

      // Cleanup
      execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);
    });

  });

  // ============================================
  // TESTES DE STATUS E TRANSIÇÕES
  // ============================================
  describe('Status e Transições', () => {

    test('API deve validar transições de status', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('validarTransicao');
      expect(content).toContain('transicoesPermitidas');
    });

    test('status válidos devem ser: triagem, avaliacao, aguardando_pagamento, em_execucao, finalizado', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('triagem');
      expect(content).toContain('avaliacao');
      expect(content).toContain('aguardando_pagamento');
      expect(content).toContain('em_execucao');
      expect(content).toContain('finalizado');
    });

    test('avaliação→pagamento deve exigir procedimentos', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('pelo menos um procedimento');
    });

    test('pagamento→execução deve exigir pagamento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('registrar pelo menos um pagamento');
    });

    test('execução→finalizado deve exigir tudo concluído e pago', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'route.ts'),
        'utf-8'
      );
      expect(content).toContain('procedimentos não concluídos');
      expect(content).toContain('Pagamento incompleto');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE PIPELINE (KANBAN)
  // ============================================
  describe('Página Pipeline/Kanban', () => {

    test('deve ter visualização Kanban', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('kanban');
      expect(content).toContain('viewMode');
    });

    test('deve ter visualização Lista', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('lista');
      expect(content).toContain('<table');
    });

    test('deve ter toggle entre Kanban e Lista', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain("setViewMode('kanban')");
      expect(content).toContain("setViewMode('lista')");
    });

    test('deve mostrar colunas por status', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('STATUS_ORDER');
      expect(content).toContain('atendimentosPorStatus');
    });

    test('deve ter link para novo atendimento', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('/atendimentos/novo');
      expect(content).toContain('Novo Atendimento');
    });

    test('deve ter campo de busca', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('busca');
      expect(content).toContain('Buscar');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE NOVO ATENDIMENTO
  // ============================================
  describe('Página Novo Atendimento', () => {

    test('deve ter seleção de cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('clienteId');
      expect(content).toContain('Selecione o Cliente');
    });

    test('deve ter busca de clientes', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('clientesFiltrados');
      expect(content).toContain('busca');
    });

    test('deve ter seleção de avaliador opcional', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('avaliadorId');
      expect(content).toContain('avaliadores');
    });

    test('deve ter link para cadastrar novo cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', 'novo', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('/clientes/novo');
      expect(content).toContain('Cadastrar novo cliente');
    });

  });

  // ============================================
  // TESTES DA PÁGINA DE DETALHES
  // ============================================
  describe('Página Detalhes do Atendimento', () => {

    test('deve mostrar dados do cliente', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('cliente_nome');
      expect(content).toContain('cliente_telefone');
    });

    test('deve mostrar status atual', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('statusConfig');
      expect(content).toContain('STATUS_CONFIG');
    });

    test('deve mostrar resumo financeiro', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('total');
      expect(content).toContain('total_pago');
      expect(content).toContain('Financeiro');
    });

    test('deve mostrar lista de procedimentos', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('itens');
      expect(content).toContain('Procedimentos');
    });

    test('deve ter botão para avançar status', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('handleMudarStatus');
      expect(content).toContain('proximoStatus');
      expect(content).toContain('Avançar para');
    });

    test('deve ter timeline de status', () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), 'app', 'atendimentos', '[id]', 'page.tsx'),
        'utf-8'
      );
      expect(content).toContain('Pipeline');
      expect(content).toContain('isPast');
      expect(content).toContain('isAtual');
    });

  });

  // ============================================
  // TESTES DE INTEGRIDADE DO SCHEMA
  // ============================================
  describe('Schema de Atendimentos', () => {

    test('tabela atendimentos deve ter campo cliente_id', () => {
      const result = query<{ name: string }>(
        "PRAGMA table_info(atendimentos)"
      );
      const campos = result.map(r => r.name);
      expect(campos).toContain('cliente_id');
    });

    test('tabela atendimentos deve ter campo avaliador_id', () => {
      const result = query<{ name: string }>(
        "PRAGMA table_info(atendimentos)"
      );
      const campos = result.map(r => r.name);
      expect(campos).toContain('avaliador_id');
    });

    test('tabela atendimentos deve ter campo status', () => {
      const result = query<{ name: string }>(
        "PRAGMA table_info(atendimentos)"
      );
      const campos = result.map(r => r.name);
      expect(campos).toContain('status');
    });

    test('tabela atendimentos deve ter campo finalizado_at', () => {
      const result = query<{ name: string }>(
        "PRAGMA table_info(atendimentos)"
      );
      const campos = result.map(r => r.name);
      expect(campos).toContain('finalizado_at');
    });

  });

  // Cleanup após todos os testes
  afterAll(() => {
    closeDb();
  });

});
