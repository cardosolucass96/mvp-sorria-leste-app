/**
 * Teste de Integração — Edge Cases e Fluxos de Erro
 *
 * Sprint 11 — Testa cenários de borda e proteções:
 *
 * 11.4 Fluxos de erro:
 * - Pular etapas da pipeline
 * - Finalizar sem pagar tudo
 * - Adicionar item em atendimento finalizado
 * - Pagamento distribuído com soma errada
 *
 * 11.5 Cenários de concorrência/edge cases:
 * - Adicionar item durante execução (revert)
 * - Procedimento por_dente com múltiplos dentes
 * - Item com quantidade > 1
 * - Procedimento com comissão 0%
 * - Revert em_execucao → aguardando_pagamento
 */

import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import {
  mockQueryResponse,
  resetMockDb,
  setLastInsertId,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';

// Mock JWT para bypass de autenticação nos testes
jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    nome: 'Admin Teste',
    unidade_ids: [1, 2],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as postAtendimentos } from '@/app/api/atendimentos/route';
import { PUT as putAtendimento } from '@/app/api/atendimentos/[id]/route';
import { POST as postItens, DELETE as deleteItens } from '@/app/api/atendimentos/[id]/itens/route';
import { PUT as putItem } from '@/app/api/atendimentos/[id]/itens/[itemId]/route';
import { POST as postPagamentos } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { POST as postFinalizar } from '@/app/api/atendimentos/[id]/finalizar/route';
import { GET as getDashboard } from '@/app/api/dashboard/route';

const ATENDIMENTO = {
  id: 1,
  cliente_id: 1,
  avaliador_id: 10,
  unidade_id: 1,
  created_at: '2025-01-15',
  finalizado_at: null,
  cliente_nome: 'Maria Silva',
  avaliador_nome: 'Dr. João',
};

const PROCEDIMENTO = {
  id: 100,
  nome: 'Limpeza',
  valor: 200,
  comissao_venda: 10,
  comissao_execucao: 20,
  por_dente: 0,
  ativo: 1,
};

const PROC_POR_DENTE = {
  id: 101,
  nome: 'Restauração',
  valor: 150,
  comissao_venda: 8,
  comissao_execucao: 25,
  por_dente: 1,
  ativo: 1,
};

const PROC_ZERO_COMISSAO = {
  id: 102,
  nome: 'Consulta Avaliação',
  valor: 80,
  comissao_venda: 0,
  comissao_execucao: 0,
  por_dente: 0,
  ativo: 1,
};

describe('Integração — Edge Cases e Fluxos de Erro', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // 11.4 — FLUXOS DE ERRO: Pular etapas
  // ═════════════════════════════════════════════

  describe('Pular etapas da pipeline', () => {
    test('triagem → aguardando_pagamento (pula avaliação) → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'triagem',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'aguardando_pagamento' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('triagem');
    });

    test('triagem → em_execucao (pula 2 etapas) → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'triagem',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'em_execucao' },
      }, ctx);

      expect(status).toBe(400);
    });

    test('triagem → finalizado (pula tudo) → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'triagem',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'finalizado' },
      }, ctx);

      expect(status).toBe(400);
    });

    test('avaliacao → em_execucao (pula aguardando_pagamento) → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'em_execucao' },
      }, ctx);

      expect(status).toBe(400);
    });

    test('aguardando_pagamento → finalizado (pula execução) → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'aguardando_pagamento',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'finalizado' },
      }, ctx);

      expect(status).toBe(400);
    });

    test('finalizado → qualquer status → 400 (estado terminal)', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'finalizado',
        finalizado_at: '2025-01-20',
      });

      const ctx = createRouteContext({ id: '1' });
      for (const novoStatus of ['triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao']) {
        resetMockDb();
        setupCloudflareContextMock();
        mockQueryResponse('from atendimentos where id', {
          ...ATENDIMENTO,
          status: 'finalizado',
        });

        const { status } = await callRoute(putAtendimento, '/api/atendimentos/1', {
          method: 'PUT',
          body: { status: novoStatus },
        }, ctx);

        expect(status).toBe(400);
      }
    });
  });

  // ═════════════════════════════════════════════
  // 11.4 — Finalizar sem pagar tudo
  // ═════════════════════════════════════════════

  describe('Finalizar — novo fluxo (apenas sem_tratamento)', () => {
    test('finalizar sem motivo_saida (default tratamento_completo) → 400', async () => {
      mockQueryResponse('from atendimentos where id', [{
        id: 1,
        status: 'em_execucao',
        unidade_id: 1,
      }]);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('fluxo normal');
    });

    test('finalizar com motivo_saida=sem_tratamento → 200', async () => {
      mockQueryResponse('from atendimentos where id', [{
        id: 1,
        status: 'em_execucao',
        unidade_id: 1,
      }]);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ success: boolean }>(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
        body: { motivo_saida: 'sem_tratamento' },
      }, ctx);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('finalizar atendimento que não está em execução → 400', async () => {
      mockQueryResponse('from atendimentos where id', [{
        id: 1,
        status: 'aguardando_pagamento',
        unidade_id: 1,
      }]);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
        body: { motivo_saida: 'sem_tratamento' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('não está em execução');
    });
  });

  // ═════════════════════════════════════════════
  // 11.4 — Adicionar item em atendimento finalizado
  // ═════════════════════════════════════════════

  describe('Adicionar item em atendimento finalizado', () => {
    test('POST /api/atendimentos/1/itens com status finalizado → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'finalizado',
        finalizado_at: '2025-01-20',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: { procedimento_id: 100 },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('Não é possível adicionar');
    });

    test('POST /api/atendimentos/1/itens com status aguardando_pagamento → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'aguardando_pagamento',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: { procedimento_id: 100 },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('Não é possível adicionar');
    });
  });

  // ═════════════════════════════════════════════
  // 11.4 — Pagamento distribuído com soma errada
  // ═════════════════════════════════════════════

  describe('Pagamento — validações básicas', () => {
    test('pagamento sem valor → 400', async () => {
      mockQueryResponse('from atendimentos where id', { ...ATENDIMENTO, status: 'aguardando_pagamento' });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: { metodo: 'pix' },
      }, ctx);

      expect(status).toBe(400);
    });

    test('pagamento sem método → 400', async () => {
      mockQueryResponse('from atendimentos where id', { ...ATENDIMENTO, status: 'aguardando_pagamento' });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: { valor: 500 },
      }, ctx);

      expect(status).toBe(400);
    });

    test('método de pagamento inválido → 400', async () => {
      mockQueryResponse('from atendimentos where id', { ...ATENDIMENTO, status: 'aguardando_pagamento' });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: { valor: 500, metodo: 'bitcoin' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('inválido');
    });

    test('pagamento em status que não aceita → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'triagem',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postPagamentos, '/api/atendimentos/1/pagamentos', {
        method: 'POST',
        body: { valor: 500, metodo: 'pix' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('status');
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Adicionar item durante execução (revert)
  // ═════════════════════════════════════════════

  describe('Adicionar item durante execução → flag adicionado_em_execucao', () => {
    test('POST item em atendimento em_execucao insere com status=pago e flag adicionado_em_execucao=1', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'em_execucao',
      });
      mockQueryResponse('from procedimentos where id', PROCEDIMENTO);
      setLastInsertId(3);
      mockQueryResponse('where i.id = ?', {
        id: 3,
        atendimento_id: 1,
        procedimento_id: 100,
        executor_id: null,
        valor: 200,
        status: 'pago',
        procedimento_nome: PROCEDIMENTO.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO.id,
        },
      }, ctx);

      expect(status).toBe(201);

      // Novo comportamento: não há revert direto. O item é inserido com status='pago'
      // e flag adicionado_em_execucao=1 para ser visto pelo executor. A volta para
      // aguardando_pagamento acontece na finalização, quando o atendimento detecta
      // itens com adicionado_em_execucao=1 e valor_pago<valor.
      const queries = getExecutedQueries();
      const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
      expect(insertQuery).toBeDefined();
      // Params: ..., valor, valor_original, dentes, quantidade, observacoes, status, adicionado_em_execucao
      expect(insertQuery!.params[9]).toBe('pago');
      expect(insertQuery!.params[10]).toBe(1);
    });

    test('adicionar item em avaliação NÃO reverte status', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from procedimentos where id', PROCEDIMENTO);
      setLastInsertId(4);
      mockQueryResponse('where i.id = ?', {
        id: 4,
        atendimento_id: 1,
        procedimento_id: 100,
        valor: 200,
        status: 'pendente',
        procedimento_nome: PROCEDIMENTO.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: { procedimento_id: PROCEDIMENTO.id },
      }, ctx);

      const queries = getExecutedQueries();
      const revertQuery = queries.find(q =>
        q.sql.toLowerCase().includes("update atendimentos set status = 'aguardando_pagamento'")
      );
      // Não deve reverter — já está em avaliação
      expect(revertQuery).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Revert em_execucao → aguardando_pagamento
  // ═════════════════════════════════════════════

  describe('Revert em_execucao → aguardando_pagamento', () => {
    test('PUT status aguardando_pagamento quando em em_execucao é permitido', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'em_execucao',
      });
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO,
        status: 'aguardando_pagamento',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'aguardando_pagamento' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'aguardando_pagamento');
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Procedimento por_dente com múltiplos dentes
  // ═════════════════════════════════════════════

  describe('Procedimento por_dente', () => {
    test('adicionar item com múltiplos dentes registra dentes e quantidade', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from procedimentos where id', PROC_POR_DENTE);
      setLastInsertId(5);
      mockQueryResponse('where i.id = ?', {
        id: 5,
        atendimento_id: 1,
        procedimento_id: PROC_POR_DENTE.id,
        valor: PROC_POR_DENTE.valor,
        dentes: '11,12,13,21,22',
        quantidade: 5,
        status: 'pendente',
        procedimento_nome: PROC_POR_DENTE.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROC_POR_DENTE.id,
          dentes: '11,12,13,21,22',
          quantidade: 5,
          valor: PROC_POR_DENTE.valor,
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('dentes', '11,12,13,21,22');
      expect(data).toHaveProperty('quantidade', 5);

      // Verifica que INSERT tem os dentes guardados
      const queries = getExecutedQueries();
      const insertQ = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      expect(insertQ).toBeDefined();
      expect(insertQ!.params).toContain('11,12,13,21,22');
      expect(insertQ!.params).toContain(5);
    });

    test('item sem dentes usa quantidade = 1 por padrão', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from procedimentos where id', PROCEDIMENTO);
      setLastInsertId(6);
      mockQueryResponse('where i.id = ?', {
        id: 6,
        atendimento_id: 1,
        procedimento_id: PROCEDIMENTO.id,
        valor: PROCEDIMENTO.valor,
        dentes: null,
        quantidade: 1,
        status: 'pendente',
        procedimento_nome: PROCEDIMENTO.nome,
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO.id,
          // sem dentes nem quantidade
        },
      }, ctx);

      expect(status).toBe(201);
      // Quantidade padrão = 1
      const queries = getExecutedQueries();
      const insertQ = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      expect(insertQ!.params).toContain(1); // quantidade
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Procedimento com comissão 0%
  // ═════════════════════════════════════════════

  describe('Finalizar — rota redesenhada (sem comissões)', () => {
    test('finalizar sem motivo_saida retorna erro sobre fluxo normal', async () => {
      mockQueryResponse('from atendimentos where id', [{
        id: 1,
        status: 'em_execucao',
        unidade_id: 1,
      }]);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('fluxo normal');
    });

    test('finalizar com sem_tratamento funciona sem itens', async () => {
      mockQueryResponse('from atendimentos where id', [{
        id: 1,
        status: 'em_execucao',
        unidade_id: 1,
      }]);

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ success: boolean }>(postFinalizar, '/api/atendimentos/1/finalizar', {
        method: 'POST',
        body: { motivo_saida: 'sem_tratamento' },
      }, ctx);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Transições de avaliação dependem de itens
  // ═════════════════════════════════════════════

  describe('Avaliação → Aguardando Pagamento exige itens', () => {
    test('avaliação → aguardando_pagamento sem itens → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('select count(*) as count from itens_atendimento', { count: 0 });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'aguardando_pagamento' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('pelo menos um procedimento');
    });
  });

  // ═════════════════════════════════════════════
  // 11.5 — Aguardando Pagamento → Em Execução exige pago
  // ═════════════════════════════════════════════

  describe('Aguardando → Em Execução exige pagamento', () => {
    test('aguardando → em_execucao sem pagamento ativo → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'aguardando_pagamento',
      });
      // 0 pagamentos ativos
      mockQueryResponse('count(*) as count from pagamentos where atendimento_id', { count: 0 });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(putAtendimento, '/api/atendimentos/1', {
        method: 'PUT',
        body: { status: 'em_execucao' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('pagamento');
    });
  });

  // ═════════════════════════════════════════════
  // Remover item só na avaliação
  // ═════════════════════════════════════════════

  describe('Remover item', () => {
    test('DELETE item na avaliação funciona', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from itens_atendimento where id', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: 100,
        valor: 200,
        status: 'pendente',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute(deleteItens, '/api/atendimentos/1/itens', {
        method: 'DELETE',
        searchParams: { item_id: '1' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('message');
    });

    test('DELETE item fora de avaliação → 400', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'em_execucao',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(deleteItens, '/api/atendimentos/1/itens', {
        method: 'DELETE',
        searchParams: { item_id: '1' },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('avaliação');
    });

    test('DELETE sem item_id → 400', async () => {
      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(deleteItens, '/api/atendimentos/1/itens', {
        method: 'DELETE',
      }, ctx);

      expect(status).toBe(400);
    });
  });

  // ═════════════════════════════════════════════
  // Executor designado é verificado
  // ═════════════════════════════════════════════

  describe('Validação de executor no item', () => {
    test('apenas executor designado pode marcar concluído', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'em_execucao',
      });
      mockQueryResponse('from itens_atendimento where id', {
        id: 1,
        atendimento_id: 1,
        procedimento_id: 100,
        executor_id: 20, // executor designado
        valor: 200,
        status: 'executando',
      });

      const ctx = createRouteContext({ id: '1', itemId: '1' });
      const { status, data } = await callRoute<{ error: string }>(putItem, '/api/atendimentos/1/itens/1', {
        method: 'PUT',
        body: {
          status: 'concluido',
          usuario_id: 99, // outro usuário, não o executor 20
        },
      }, ctx);

      expect(status).toBe(403);
      expect(data.error).toContain('executor designado');
    });
  });

  // ═════════════════════════════════════════════
  // Atendimento duplicado por cliente
  // ═════════════════════════════════════════════

  describe('Proteção de atendimento duplicado', () => {
    test('criar atendimento para cliente com atendimento aberto → 400', async () => {
      mockQueryResponse('select id from clientes where id', { id: 1 });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 1 }); // já tem 1 aberto

      const { status, data } = await callRoute<{ error: string }>(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: { cliente_id: 1 },
      });

      expect(status).toBe(400);
    });
  });

  // ═════════════════════════════════════════════
  // Valor customizado de procedimento
  // ═════════════════════════════════════════════

  describe('Valor customizado de procedimento', () => {
    test('POST item com valor customizado usa valor informado', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from procedimentos where id', {
        ...PROCEDIMENTO,
        valor: 200, // valor padrão
      });
      setLastInsertId(7);
      mockQueryResponse('where i.id = ?', {
        id: 7,
        valor: 350, // valor customizado
        procedimento_nome: PROCEDIMENTO.nome,
        status: 'pendente',
      });

      const ctx = createRouteContext({ id: '1' });
      await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO.id,
          valor: 350, // valor diferente do padrão
        },
      }, ctx);

      // Verifica que o INSERT usa o valor customizado (350), não o padrão (200)
      const queries = getExecutedQueries();
      const insertQ = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      expect(insertQ!.params).toContain(350);
    });

    test('POST item sem valor usa valor padrão do procedimento', async () => {
      mockQueryResponse('from atendimentos where id', {
        ...ATENDIMENTO,
        status: 'avaliacao',
      });
      mockQueryResponse('from procedimentos where id', {
        ...PROCEDIMENTO,
        valor: 200,
      });
      setLastInsertId(8);
      mockQueryResponse('where i.id = ?', {
        id: 8,
        valor: 200,
        procedimento_nome: PROCEDIMENTO.nome,
        status: 'pendente',
      });

      const ctx = createRouteContext({ id: '1' });
      await callRoute(postItens, '/api/atendimentos/1/itens', {
        method: 'POST',
        body: {
          procedimento_id: PROCEDIMENTO.id,
          // sem valor → usa o padrão
        },
      }, ctx);

      const queries = getExecutedQueries();
      const insertQ = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      // Usa o valor padrão do procedimento (200)
      expect(insertQ!.params).toContain(200);
    });
  });

  // ═════════════════════════════════════════════
  // Todos os métodos de pagamento aceitos
  // ═════════════════════════════════════════════

  describe('Métodos de pagamento aceitos', () => {
    const metodos = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito'];

    metodos.forEach((metodo) => {
      test(`método "${metodo}" é aceito`, async () => {
        mockQueryResponse('from atendimentos where id', {
          ...ATENDIMENTO,
          status: 'aguardando_pagamento',
        });
        mockQueryResponse('select id from usuarios limit 1', { id: 1 });
        setLastInsertId(1);
        mockQueryResponse('select * from pagamentos where id', {
          id: 1,
          atendimento_id: 1,
          valor: 100,
          metodo,
        });

        const ctx = createRouteContext({ id: '1' });
        const { status } = await callRoute(postPagamentos, '/api/atendimentos/1/pagamentos', {
          method: 'POST',
          body: { valor: 100, metodo },
        }, ctx);

        expect(status).toBe(201);
      });
    });
  });
});
