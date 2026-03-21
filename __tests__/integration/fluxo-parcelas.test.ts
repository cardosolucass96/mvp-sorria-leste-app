/**
 * Teste de Integração — Fluxo com Parcelas
 *
 * Sprint 11 — Simula o ciclo de parcelas programadas:
 *
 * 1. Criar atendimento e adicionar procedimentos
 * 2. Criar parcelas programadas (múltiplas datas)
 * 3. Registrar pagamentos vinculados às parcelas
 * 4. Verificar marcação de parcelas como pagas
 * 5. Verificar parcelas vencidas
 * 6. Verificar que parcela paga não pode ser removida
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

import { POST as postParcelas, GET as getParcelas, PUT as putParcelas, DELETE as deleteParcelas } from '@/app/api/atendimentos/[id]/parcelas/route';
import { POST as postPagamentos } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { GET as getVencidas } from '@/app/api/parcelas/vencidas/route';

const ATENDIMENTO = {
  id: 5,
  status: 'aguardando_pagamento',
  cliente_id: 1,
};

describe('Integração — Fluxo com Parcelas', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // ETAPA 1: Criar parcelas programadas
  // ═════════════════════════════════════════════

  describe('Etapa 1 — Criar parcelas', () => {
    test('POST /api/atendimentos/5/parcelas cria primeira parcela', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      mockQueryResponse('select max(numero) as max_numero from parcelas', { max_numero: null });
      setLastInsertId(1);
      mockQueryResponse('select * from parcelas where id', {
        id: 1,
        atendimento_id: 5,
        numero: 1,
        valor: 250,
        data_vencimento: '2025-02-15',
        pago: 0,
        pagamento_id: null,
        observacoes: 'Primeira parcela',
        created_at: '2025-01-15',
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: {
          valor: 250,
          data_vencimento: '2025-02-15',
          observacoes: 'Primeira parcela',
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('numero', 1);
      expect(data).toHaveProperty('valor', 250);
      expect(data).toHaveProperty('pago', 0);
    });

    test('POST cria segunda parcela com numero incrementado', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      mockQueryResponse('select max(numero) as max_numero from parcelas', { max_numero: 1 });
      setLastInsertId(2);
      mockQueryResponse('select * from parcelas where id', {
        id: 2,
        atendimento_id: 5,
        numero: 2,
        valor: 250,
        data_vencimento: '2025-03-15',
        pago: 0,
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: {
          valor: 250,
          data_vencimento: '2025-03-15',
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('numero', 2);
    });

    test('POST cria terceira parcela', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      mockQueryResponse('select max(numero) as max_numero from parcelas', { max_numero: 2 });
      setLastInsertId(3);
      mockQueryResponse('select * from parcelas where id', {
        id: 3,
        atendimento_id: 5,
        numero: 3,
        valor: 200,
        data_vencimento: '2025-04-15',
        pago: 0,
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: {
          valor: 200,
          data_vencimento: '2025-04-15',
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('numero', 3);
      expect(data).toHaveProperty('valor', 200);
    });

    test('rejeita parcela sem valor', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute<{ error: string }>(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: {
          data_vencimento: '2025-05-15',
        },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('Valor');
    });

    test('rejeita parcela sem data de vencimento', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute<{ error: string }>(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: {
          valor: 100,
        },
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('vencimento');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 2: Listar parcelas
  // ═════════════════════════════════════════════

  describe('Etapa 2 — Listar parcelas', () => {
    test('GET /api/atendimentos/5/parcelas retorna todas as parcelas', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      mockQueryResponse('select * from parcelas', [
        { id: 1, numero: 1, valor: 250, data_vencimento: '2025-02-15', pago: 0 },
        { id: 2, numero: 2, valor: 250, data_vencimento: '2025-03-15', pago: 0 },
        { id: 3, numero: 3, valor: 200, data_vencimento: '2025-04-15', pago: 0 },
      ]);

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(getParcelas, '/api/atendimentos/5/parcelas', {}, ctx);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(3);
      // Soma total das parcelas: 250 + 250 + 200 = 700
      const soma = (data as any[]).reduce((s: number, p: any) => s + p.valor, 0);
      expect(soma).toBe(700);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 3: Registrar pagamento e vincular parcela
  // ═════════════════════════════════════════════

  describe('Etapa 3 — Pagamento com vínculo a parcelas', () => {
    test('POST pagamento + PUT marca parcela como paga', async () => {
      // 1. Registrar pagamento
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      setLastInsertId(10);
      mockQueryResponse('select * from pagamentos where id', {
        id: 10,
        atendimento_id: 5,
        valor: 250,
        metodo: 'pix',
      });

      const ctx = createRouteContext({ id: '5' });
      const pagResult = await callRoute(postPagamentos, '/api/atendimentos/5/pagamentos', {
        method: 'POST',
        body: {
          valor: 250,
          metodo: 'pix',
          itens: [{ item_id: 1, valor_aplicado: 250 }],
        },
      }, ctx);

      expect(pagResult.status).toBe(201);
      const pagamentoId = (pagResult.data as any).id;

      // 2. Marcar parcela 1 como paga vinculando ao pagamento
      resetMockDb();
      mockQueryResponse('select * from parcelas where id', {
        id: 1,
        atendimento_id: 5,
        numero: 1,
        valor: 250,
        pago: 0,
      });
      mockQueryResponse('select * from parcelas where id', {
        id: 1,
        atendimento_id: 5,
        numero: 1,
        valor: 250,
        pago: 1,
        pagamento_id: pagamentoId,
      });

      const { status, data } = await callRoute(putParcelas, '/api/atendimentos/5/parcelas', {
        method: 'PUT',
        body: { parcela_id: 1, pagamento_id: pagamentoId },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('pago', 1);
      expect(data).toHaveProperty('pagamento_id', pagamentoId);

      // Verifica SQL de UPDATE parcela
      const queries = getExecutedQueries();
      const updateParcela = queries.find(q =>
        q.sql.toLowerCase().includes('update parcelas set pago = 1')
      );
      expect(updateParcela).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 4: Parcela paga não pode ser removida
  // ═════════════════════════════════════════════

  describe('Etapa 4 — Proteção de parcela paga', () => {
    test('DELETE parcela paga retorna 400', async () => {
      mockQueryResponse('select * from parcelas where id', {
        id: 1,
        atendimento_id: 5,
        numero: 1,
        valor: 250,
        pago: 1, // já paga
        pagamento_id: 10,
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute<{ error: string }>(
        deleteParcelas,
        '/api/atendimentos/5/parcelas',
        {
          method: 'DELETE',
          searchParams: { parcela_id: '1' },
        },
        ctx
      );

      expect(status).toBe(400);
      expect(data.error).toContain('paga');
    });

    test('DELETE parcela não paga funciona', async () => {
      mockQueryResponse('select * from parcelas where id', {
        id: 3,
        atendimento_id: 5,
        numero: 3,
        valor: 200,
        pago: 0,
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(
        deleteParcelas,
        '/api/atendimentos/5/parcelas',
        {
          method: 'DELETE',
          searchParams: { parcela_id: '3' },
        },
        ctx
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty('message');

      // Verifica query de DELETE executada
      const queries = getExecutedQueries();
      const deleteQ = queries.find(q =>
        q.sql.toLowerCase().includes('delete from parcelas')
      );
      expect(deleteQ).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 5: Parcelas vencidas
  // ═════════════════════════════════════════════

  describe('Etapa 5 — Parcelas vencidas', () => {
    test('GET /api/parcelas/vencidas retorna parcelas com data_vencimento no passado', async () => {
      mockQueryResponse('from parcelas p', [
        {
          id: 2,
          atendimento_id: 5,
          numero: 2,
          valor: 250,
          data_vencimento: '2025-01-15', // no passado
          pago: 0,
          cliente_nome: 'Maria Silva',
        },
      ]);

      const { status, data } = await callRoute(getVencidas, '/api/parcelas/vencidas');

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      // Verifica que a query usa data de hoje para filtrar
      const queries = getExecutedQueries();
      const vencidasQuery = queries.find(q =>
        q.sql.toLowerCase().includes('data_vencimento <')
      );
      expect(vencidasQuery).toBeDefined();
    });

    test('parcelas pagas não aparecem como vencidas', async () => {
      // Retorna vazio — todas as parcelas estão pagas
      mockQueryResponse('from parcelas p', []);

      const { status, data } = await callRoute(getVencidas, '/api/parcelas/vencidas');

      expect(status).toBe(200);
      expect(data).toHaveLength(0);

      // Verifica que a query filtra por pago = 0
      const queries = getExecutedQueries();
      const vencidasQuery = queries[0];
      expect(vencidasQuery.sql.toLowerCase()).toContain('pago = 0');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 6: Validações de parcelas
  // ═════════════════════════════════════════════

  describe('Etapa 6 — Validações', () => {
    test('PUT parcela inexistente retorna 404', async () => {
      // Mock retorna null — parcela não encontrada
      mockQueryResponse('select * from parcelas where id', null as any);

      const ctx = createRouteContext({ id: '5' });
      const { status } = await callRoute(putParcelas, '/api/atendimentos/5/parcelas', {
        method: 'PUT',
        body: { parcela_id: 999 },
      }, ctx);

      expect(status).toBe(404);
    });

    test('PUT sem parcela_id retorna 400', async () => {
      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute<{ error: string }>(putParcelas, '/api/atendimentos/5/parcelas', {
        method: 'PUT',
        body: {},
      }, ctx);

      expect(status).toBe(400);
      expect(data.error).toContain('parcela');
    });

    test('DELETE sem parcela_id retorna 400', async () => {
      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute<{ error: string }>(
        deleteParcelas,
        '/api/atendimentos/5/parcelas',
        { method: 'DELETE' },
        ctx
      );

      expect(status).toBe(400);
    });

    test('parcela para atendimento inexistente retorna 404', async () => {
      mockQueryResponse('select * from atendimentos where id', null as any);

      const ctx = createRouteContext({ id: '999' });
      const { status } = await callRoute(postParcelas, '/api/atendimentos/999/parcelas', {
        method: 'POST',
        body: { valor: 100, data_vencimento: '2025-06-01' },
      }, ctx);

      expect(status).toBe(404);
    });

    test('numeração automática de parcelas é sequencial', async () => {
      mockQueryResponse('select * from atendimentos where id', ATENDIMENTO);
      // Já existem 5 parcelas
      mockQueryResponse('select max(numero) as max_numero from parcelas', { max_numero: 5 });
      setLastInsertId(6);
      mockQueryResponse('select * from parcelas where id', {
        id: 6,
        atendimento_id: 5,
        numero: 6,
        valor: 100,
        data_vencimento: '2025-07-15',
        pago: 0,
      });

      const ctx = createRouteContext({ id: '5' });
      const { status, data } = await callRoute(postParcelas, '/api/atendimentos/5/parcelas', {
        method: 'POST',
        body: { valor: 100, data_vencimento: '2025-07-15' },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('numero', 6);
    });
  });

  // ═════════════════════════════════════════════
  // Múltiplos pagamentos para mesma parcela
  // ═════════════════════════════════════════════

  describe('Fluxo completo — 3 parcelas com pagamentos sequenciais', () => {
    test('cada pagamento marca parcela correspondente como paga', async () => {
      const ctx = createRouteContext({ id: '5' });
      const parcelas = [
        { id: 1, numero: 1, valor: 250, data_vencimento: '2025-02-15' },
        { id: 2, numero: 2, valor: 250, data_vencimento: '2025-03-15' },
        { id: 3, numero: 3, valor: 200, data_vencimento: '2025-04-15' },
      ];

      for (let i = 0; i < parcelas.length; i++) {
        resetMockDb();
        setupCloudflareContextMock();

        const parcela = parcelas[i];

        // 1. Registrar pagamento
        mockQueryResponse('select * from atendimentos where id', {
          ...ATENDIMENTO,
          status: i < 2 ? 'aguardando_pagamento' : 'em_execucao',
        });
        mockQueryResponse('select id from usuarios limit 1', { id: 1 });
        setLastInsertId(100 + i);
        mockQueryResponse('select * from pagamentos where id', {
          id: 100 + i,
          atendimento_id: 5,
          valor: parcela.valor,
          metodo: 'pix',
        });

        const pagResult = await callRoute(postPagamentos, '/api/atendimentos/5/pagamentos', {
          method: 'POST',
          body: {
            valor: parcela.valor,
            metodo: 'pix',
            itens: [{ item_id: i + 1, valor_aplicado: parcela.valor }],
          },
        }, ctx);

        expect(pagResult.status).toBe(201);

        // 2. Marcar parcela como paga
        resetMockDb();
        setupCloudflareContextMock();

        mockQueryResponse('select * from parcelas where id', {
          ...parcela,
          atendimento_id: 5,
          pago: 0,
        });
        mockQueryResponse('select * from parcelas where id', {
          ...parcela,
          atendimento_id: 5,
          pago: 1,
          pagamento_id: 100 + i,
        });

        const putResult = await callRoute(putParcelas, '/api/atendimentos/5/parcelas', {
          method: 'PUT',
          body: { parcela_id: parcela.id, pagamento_id: 100 + i },
        }, ctx);

        expect(putResult.status).toBe(200);
        expect(putResult.data).toHaveProperty('pago', 1);
      }
    });
  });
});
