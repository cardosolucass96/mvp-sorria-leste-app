/**
 * Sprint 6 Tests - Avaliação
 * Testes para o workflow de avaliação do dentista
 */

import { query, queryOne, execute, checkpoint } from '../lib/db';
import fs from 'fs';
import path from 'path';

interface CountResult {
  count: number;
}

interface IdResult {
  id: number;
}

interface ProcedimentoResult {
  id: number;
  valor: number;
}

interface StatusResult {
  status: string;
}

interface RoleResult {
  role: string;
}

interface ExecutorResult {
  executor_id: number | null;
}

interface ItemResult {
  id: number;
  executor_id: number | null;
}

describe('Sprint 6 - Avaliação', () => {
  // Setup: garantir dados necessários
  beforeAll(() => {
    // Reativar todos os procedimentos e usuários
    execute('UPDATE procedimentos SET ativo = 1');
    execute('UPDATE usuarios SET ativo = 1');
  });

  // ============================================
  // TESTES DOS ARQUIVOS DA SPRINT 6
  // ============================================
  describe('Arquivos do Projeto', () => {
    
    test('app/api/atendimentos/[id]/itens/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'itens', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/api/atendimentos/[id]/itens/[itemId]/route.ts deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'api', 'atendimentos', '[id]', 'itens', '[itemId]', 'route.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/avaliacao/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'avaliacao', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('app/avaliacao/[id]/page.tsx deve existir', () => {
      const filePath = path.join(process.cwd(), 'app', 'avaliacao', '[id]', 'page.tsx');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('API - Itens de Atendimento', () => {
    let atendimentoId: number;
    let itemId: number;
    
    // Criar atendimento para testes
    beforeAll(() => {
      // Limpar dados anteriores
      execute('DELETE FROM itens_atendimento WHERE atendimento_id IN (SELECT id FROM atendimentos WHERE observacoes LIKE ?)', ['%TESTE_SPRINT6%']);
      execute('DELETE FROM atendimentos WHERE observacoes LIKE ?', ['%TESTE_SPRINT6%']);
      
      // Criar atendimento de teste
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes)
        VALUES (1, 'avaliacao', 'TESTE_SPRINT6')
      `);
      const result = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_SPRINT6']);
      atendimentoId = result!.id;
      
      // Forçar sync do WAL para que o servidor veja as alterações
      checkpoint();
    });

    afterAll(() => {
      // Limpar dados de teste
      execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [atendimentoId]);
      execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);
    });

    test('POST /api/atendimentos/[id]/itens - adiciona item', async () => {
      const procedimento = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1'
      );
      
      expect(procedimento).toBeDefined();
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: procedimento!.id,
          valor: procedimento!.valor,
          criado_por_id: 1,
        }),
      });

      expect(res.status).toBe(201);
      
      const data = await res.json();
      expect(data.id).toBeDefined();
      itemId = data.id;
    });

    test('POST /api/atendimentos/[id]/itens - adiciona item com executor', async () => {
      const procedimento = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1 OFFSET 1'
      );
      const executor = queryOne<IdResult>(
        "SELECT id FROM usuarios WHERE role = 'executor' AND ativo = 1 LIMIT 1"
      );
      
      expect(procedimento).toBeDefined();
      expect(executor).toBeDefined();
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: procedimento!.id,
          executor_id: executor!.id,
          valor: procedimento!.valor,
          criado_por_id: 1,
        }),
      });

      expect(res.status).toBe(201);
      
      const data = await res.json();
      expect(data.executor_id).toBe(executor!.id);
    });

    test('GET /api/atendimentos/[id]/itens - lista itens', async () => {
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`);
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
    });

    test('PUT /api/atendimentos/[id]/itens/[itemId] - atualiza executor', async () => {
      const executor = queryOne<IdResult>(
        "SELECT id FROM usuarios WHERE role = 'executor' AND ativo = 1 LIMIT 1"
      );
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor_id: executor!.id,
        }),
      });

      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.executor_id).toBe(executor!.id);
    });

    test('DELETE /api/atendimentos/[id]/itens - remove item', async () => {
      const res = await fetch(
        `http://localhost:3000/api/atendimentos/${atendimentoId}/itens?item_id=${itemId}&usuario_id=1`,
        { method: 'DELETE' }
      );

      expect(res.status).toBe(200);
      
      // Verificar que foi removido
      const itens = query<ItemResult>(
        'SELECT * FROM itens_atendimento WHERE id = ?',
        [itemId]
      );
      expect(itens.length).toBe(0);
    });
  });

  describe('Regras de Negócio - Itens', () => {
    let atendimentoId: number;
    
    beforeEach(() => {
      // Criar atendimento para cada teste
      execute('DELETE FROM itens_atendimento WHERE atendimento_id IN (SELECT id FROM atendimentos WHERE observacoes LIKE ?)', ['%TESTE_REGRAS%']);
      execute('DELETE FROM atendimentos WHERE observacoes LIKE ?', ['%TESTE_REGRAS%']);
      
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes)
        VALUES (1, 'avaliacao', 'TESTE_REGRAS')
      `);
      const result = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_REGRAS']);
      atendimentoId = result!.id;
      
      // Forçar sync do WAL para que o servidor veja as alterações
      checkpoint();
    });

    afterEach(() => {
      execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [atendimentoId]);
      execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);
    });

    test('não permite remover item fora do status avaliação', async () => {
      // Adicionar item
      const proc = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1'
      );
      
      const addRes = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: proc!.id,
          valor: proc!.valor,
          criado_por_id: 1,
        }),
      });
      
      const item = await addRes.json();
      
      // Mudar status para aguardando_pagamento
      execute('UPDATE atendimentos SET status = ? WHERE id = ?', ['aguardando_pagamento', atendimentoId]);
      
      // Tentar remover
      const res = await fetch(
        `http://localhost:3000/api/atendimentos/${atendimentoId}/itens?item_id=${item.id}&usuario_id=1`,
        { method: 'DELETE' }
      );

      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('avaliação');
    });

    test('adicionar item em execução reverte para aguardando_pagamento', async () => {
      // Adicionar primeiro item
      const proc = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1'
      );
      
      await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: proc!.id,
          valor: proc!.valor,
          criado_por_id: 1,
        }),
      });
      
      // Avançar para em_execucao
      execute('UPDATE atendimentos SET status = ? WHERE id = ?', ['em_execucao', atendimentoId]);
      
      // Adicionar novo item
      const proc2 = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1 OFFSET 1'
      );
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: proc2!.id,
          valor: proc2!.valor,
          criado_por_id: 1,
        }),
      });

      expect(res.status).toBe(201);
      
      // Verificar que status voltou
      const atend = queryOne<StatusResult>(
        'SELECT status FROM atendimentos WHERE id = ?',
        [atendimentoId]
      );
      expect(atend!.status).toBe('aguardando_pagamento');
    });

    test('não permite adicionar item em status finalizado', async () => {
      execute('UPDATE atendimentos SET status = ? WHERE id = ?', ['finalizado', atendimentoId]);
      
      const proc = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1'
      );
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: proc!.id,
          valor: proc!.valor,
          criado_por_id: 1,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Fila de Avaliação', () => {
    let atendimentoTriagem: number;
    let atendimentoAvaliacao: number;
    
    beforeAll(() => {
      // Criar atendimentos de teste
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes)
        VALUES (1, 'triagem', 'TESTE_FILA_TRIAGEM')
      `);
      const res1 = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_FILA_TRIAGEM']);
      atendimentoTriagem = res1!.id;
      
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes)
        VALUES (2, 'avaliacao', 'TESTE_FILA_AVALIACAO')
      `);
      const res2 = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_FILA_AVALIACAO']);
      atendimentoAvaliacao = res2!.id;
      
      // Forçar sync do WAL para que o servidor veja as alterações
      checkpoint();
    });

    afterAll(() => {
      execute('DELETE FROM atendimentos WHERE observacoes LIKE ?', ['%TESTE_FILA%']);
    });

    test('GET /api/atendimentos filtra por status triagem e avaliacao', async () => {
      // Testar filtro triagem
      const resTriagem = await fetch('http://localhost:3000/api/atendimentos?status=triagem');
      expect(resTriagem.status).toBe(200);
      
      const triagens = await resTriagem.json();
      const temTriagem = triagens.some((a: { id: number }) => a.id === atendimentoTriagem);
      expect(temTriagem).toBe(true);
      
      // Testar filtro avaliação
      const resAvaliacao = await fetch('http://localhost:3000/api/atendimentos?status=avaliacao');
      expect(resAvaliacao.status).toBe(200);
      
      const avaliacoes = await resAvaliacao.json();
      const temAvaliacao = avaliacoes.some((a: { id: number }) => a.id === atendimentoAvaliacao);
      expect(temAvaliacao).toBe(true);
    });
  });

  describe('Workflow Completo de Avaliação', () => {
    let atendimentoId: number;
    
    beforeAll(() => {
      // Criar atendimento em avaliação
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes, avaliador_id)
        VALUES (1, 'avaliacao', 'TESTE_WORKFLOW', 1)
      `);
      const result = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_WORKFLOW']);
      atendimentoId = result!.id;
      
      // Forçar sync do WAL para que o servidor veja as alterações
      checkpoint();
    });

    afterAll(() => {
      execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [atendimentoId]);
      execute('DELETE FROM atendimentos WHERE id = ?', [atendimentoId]);
    });

    test('1. Adiciona procedimentos durante avaliação', async () => {
      const procs = query<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 3'
      );
      
      for (const proc of procs) {
        const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            procedimento_id: proc.id,
            valor: proc.valor,
            criado_por_id: 1,
          }),
        });
        expect(res.status).toBe(201);
      }
      
      // Verificar itens
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens`);
      const itens = await res.json();
      expect(itens.length).toBe(3);
    });

    test('2. Define executores para os procedimentos', async () => {
      const itens = query<ItemResult>(
        'SELECT id FROM itens_atendimento WHERE atendimento_id = ?',
        [atendimentoId]
      );
      
      const executor = queryOne<IdResult>(
        "SELECT id FROM usuarios WHERE role = 'executor' AND ativo = 1 LIMIT 1"
      );
      
      for (const item of itens) {
        const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}/itens/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            executor_id: executor!.id,
          }),
        });
        expect(res.status).toBe(200);
      }
      
      // Verificar executores
      const itensAtualizados = query<ExecutorResult>(
        'SELECT executor_id FROM itens_atendimento WHERE atendimento_id = ?',
        [atendimentoId]
      );
      
      for (const item of itensAtualizados) {
        expect(item.executor_id).toBe(executor!.id);
      }
    });

    test('3. Finaliza avaliação (avança para aguardando_pagamento)', async () => {
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aguardando_pagamento' }),
      });

      expect(res.status).toBe(200);
      
      // Verificar status
      const atend = queryOne<StatusResult>(
        'SELECT status FROM atendimentos WHERE id = ?',
        [atendimentoId]
      );
      expect(atend!.status).toBe('aguardando_pagamento');
    });

    test('4. Atendimento tem total calculado', async () => {
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendimentoId}`);
      const data = await res.json();
      
      expect(data.total).toBeDefined();
      expect(data.total).toBeGreaterThan(0);
      expect(data.itens).toBeDefined();
      expect(data.itens.length).toBe(3);
    });
  });

  describe('Dados de Privacidade', () => {
    test('atendimento retorna nome do cliente', async () => {
      let atend = queryOne<IdResult>(
        "SELECT id FROM atendimentos WHERE status = 'avaliacao' LIMIT 1"
      );
      
      let createdId: number | null = null;
      
      if (!atend) {
        // Criar um para teste
        execute(`
          INSERT INTO atendimentos (cliente_id, status, observacoes)
          VALUES (1, 'avaliacao', 'TESTE_PRIVACIDADE')
        `);
        const result = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_PRIVACIDADE']);
        createdId = result!.id;
        atend = result;
        
        // Forçar sync do WAL para que o servidor veja as alterações
        checkpoint();
      }
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atend!.id}`);
      const data = await res.json();
      
      // Deve ter nome do cliente
      expect(data.cliente_nome).toBeDefined();
      
      // Limpar se criado
      if (createdId) {
        execute('DELETE FROM atendimentos WHERE id = ?', [createdId]);
      }
    });
  });

  describe('Seleção de Executor', () => {
    test('lista apenas executores e admins como opções', () => {
      const executores = query<RoleResult>(
        "SELECT role FROM usuarios WHERE (role = 'executor' OR role = 'admin') AND ativo = 1"
      );
      
      expect(executores.length).toBeGreaterThan(0);
      
      for (const exec of executores) {
        expect(['executor', 'admin']).toContain(exec.role);
      }
    });

    test('procedimento pode ter executor null inicialmente', async () => {
      execute(`
        INSERT INTO atendimentos (cliente_id, status, observacoes)
        VALUES (1, 'avaliacao', 'TESTE_EXECUTOR_NULL')
      `);
      const atend = queryOne<IdResult>('SELECT id FROM atendimentos WHERE observacoes = ? ORDER BY id DESC LIMIT 1', ['TESTE_EXECUTOR_NULL']);
      const atendId = atend!.id;
      
      // Forçar sync do WAL para que o servidor veja as alterações
      checkpoint();
      
      const proc = queryOne<ProcedimentoResult>(
        'SELECT id, valor FROM procedimentos WHERE ativo = 1 LIMIT 1'
      );
      
      const res = await fetch(`http://localhost:3000/api/atendimentos/${atendId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: proc!.id,
          valor: proc!.valor,
          criado_por_id: 1,
          executor_id: null,
        }),
      });

      expect(res.status).toBe(201);
      
      const data = await res.json();
      expect(data.executor_id).toBeNull();
      
      // Limpar
      execute('DELETE FROM itens_atendimento WHERE atendimento_id = ?', [atendId]);
      execute('DELETE FROM atendimentos WHERE id = ?', [atendId]);
    });
  });
});
