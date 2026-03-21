/**
 * Teste de Integração — Fluxo Orto (Ortodontia)
 *
 * Sprint 11 — Simula o fluxo diferenciado para atendimentos ortodônticos:
 *
 * 1. Criar cliente
 * 2. Criar atendimento orto (pula tri/aval → va direto para aguardando_pagamento)
 * 3. Registrar pagamento
 * 4. Avançar para execução
 * 5. Executar procedimento
 * 6. Finalizar e verificar comissões
 *
 * O fluxo orto é especial porque:
 * - O atendimento começa em aguardando_pagamento (sem triagem/avaliação)
 * - O item já é criado junto com o atendimento
 * - Executor é designado na criação
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

import { POST as postClientes } from '@/app/api/clientes/route';
import { POST as postAtendimentos } from '@/app/api/atendimentos/route';
import { PUT as putAtendimento } from '@/app/api/atendimentos/[id]/route';
import { PUT as putItem } from '@/app/api/atendimentos/[id]/itens/[itemId]/route';
import { POST as postPagamentos } from '@/app/api/atendimentos/[id]/pagamentos/route';
import { POST as postFinalizar } from '@/app/api/atendimentos/[id]/finalizar/route';

const CLIENTE_ORTO = {
  id: 2,
  nome: 'Pedro Santos',
  cpf: '98765432100',
  telefone: '11988888888',
  email: 'pedro@email.com',
  origem: 'indicacao',
  created_at: '2025-02-01T09:00:00',
};

const EXECUTOR_ORTO = {
  id: 30,
  nome: 'Dr. Carlos Ortodontista',
  email: 'carlos@sorria.com',
  role: 'executor',
};

const PROC_ORTO = {
  id: 200,
  nome: 'Manutenção Ortodôntica',
  valor: 350,
  comissao_venda: 5,
  comissao_execucao: 30,
  por_dente: 0,
  ativo: 1,
};

const ATENDIMENTO_ORTO_BASE = {
  id: 10,
  cliente_id: CLIENTE_ORTO.id,
  avaliador_id: null,
  created_at: '2025-02-01T09:00:00',
  finalizado_at: null,
  cliente_nome: CLIENTE_ORTO.nome,
  cliente_cpf: CLIENTE_ORTO.cpf,
  cliente_telefone: CLIENTE_ORTO.telefone,
  avaliador_nome: null,
};

describe('Integração — Fluxo Orto', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // ETAPA 1: Criar cliente
  // ═════════════════════════════════════════════

  describe('Etapa 1 — Criar cliente', () => {
    test('POST /api/clientes cria cliente para orto', async () => {
      mockQueryResponse('select id from clientes where cpf', []);
      setLastInsertId(CLIENTE_ORTO.id);
      mockQueryResponse('select * from clientes where id', CLIENTE_ORTO);

      const { status, data } = await callRoute(postClientes, '/api/clientes', {
        method: 'POST',
        body: {
          nome: CLIENTE_ORTO.nome,
          cpf: CLIENTE_ORTO.cpf,
          telefone: CLIENTE_ORTO.telefone,
          email: CLIENTE_ORTO.email,
          origem: CLIENTE_ORTO.origem,
        },
      });

      expect(status).toBe(201);
      expect(data).toHaveProperty('origem', 'indicacao');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 2: Criar atendimento orto
  // ═════════════════════════════════════════════

  describe('Etapa 2 — Criar atendimento orto (pula triagem/avaliação)', () => {
    test('POST /api/atendimentos com tipo_orto cria atendimento em aguardando_pagamento', async () => {
      // Cliente existe
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      // Sem atendimento aberto
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      // Executor existe e tem role correto
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR_ORTO.id, role: 'executor' });
      // Procedimento existe
      mockQueryResponse('select id, valor, nome from procedimentos where id', {
        id: PROC_ORTO.id, valor: PROC_ORTO.valor, nome: PROC_ORTO.nome,
      });
      setLastInsertId(ATENDIMENTO_ORTO_BASE.id);
      // Atendimento retornado (orto query has NULL as avaliador_nome)
      mockQueryResponse('null as avaliador_nome', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'aguardando_pagamento',
      });

      const { status, data } = await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
          valor: PROC_ORTO.valor,
        },
      });

      expect(status).toBe(201);
      // Fluxo orto pula triagem e vai direto para aguardando_pagamento
      expect(data).toHaveProperty('status', 'aguardando_pagamento');
      expect(data).toHaveProperty('avaliador_id', null);

      // Verifica que o item foi inserido automaticamente
      const queries = getExecutedQueries();
      const insertItem = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      expect(insertItem).toBeDefined();
    });

    test('atendimento orto requer executor_id', async () => {
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });

      const { status, data } = await callRoute<{ error: string }>(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          // sem executor_id
          procedimento_id: PROC_ORTO.id,
        },
      });

      expect(status).toBe(400);
    });

    test('atendimento orto requer procedimento_id', async () => {
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR_ORTO.id, role: 'executor' });

      const { status } = await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          executor_id: EXECUTOR_ORTO.id,
          // sem procedimento_id
        },
      });

      expect(status).toBe(400);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 3: Registrar pagamento
  // ═════════════════════════════════════════════

  describe('Etapa 3 — Pagamento do procedimento orto', () => {
    test('POST /api/atendimentos/10/pagamentos registra pagamento', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'aguardando_pagamento',
      });
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      setLastInsertId(10);
      mockQueryResponse('select * from pagamentos where id', {
        id: 10,
        atendimento_id: ATENDIMENTO_ORTO_BASE.id,
        recebido_por_id: 1,
        valor: PROC_ORTO.valor,
        metodo: 'cartao_debito',
        parcelas: 1,
        created_at: '2025-02-01T10:00:00',
      });

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id) });
      const { status, data } = await callRoute(postPagamentos, '/api/atendimentos/10/pagamentos', {
        method: 'POST',
        body: {
          valor: PROC_ORTO.valor,
          metodo: 'cartao_debito',
          itens: [
            { item_id: 1, valor_aplicado: PROC_ORTO.valor },
          ],
        },
      }, ctx);

      expect(status).toBe(201);
      expect(data).toHaveProperty('valor', PROC_ORTO.valor);
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 4: Avançar para execução
  // ═════════════════════════════════════════════

  describe('Etapa 4 — Aguardando Pagamento → Em Execução', () => {
    test('PUT libera para execução', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'aguardando_pagamento',
      });
      mockQueryResponse('count(*) as count', { count: 1 });
      mockQueryResponse('select id from usuarios limit 1', { id: 1 });
      mockQueryResponse('select \n        a.*', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'em_execucao',
        liberado_por_id: 1,
      });

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id) });
      const { status, data } = await callRoute(putAtendimento, '/api/atendimentos/10', {
        method: 'PUT',
        body: { status: 'em_execucao' },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'em_execucao');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 5: Executar procedimento
  // ═════════════════════════════════════════════

  describe('Etapa 5 — Executar procedimento', () => {
    test('PUT marca item como executando', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'em_execucao',
      });
      mockQueryResponse('select * from itens_atendimento where id', {
        id: 1,
        atendimento_id: ATENDIMENTO_ORTO_BASE.id,
        procedimento_id: PROC_ORTO.id,
        executor_id: EXECUTOR_ORTO.id,
        valor: PROC_ORTO.valor,
        status: 'pago',
      });
      mockQueryResponse('select \n        i.*', {
        id: 1,
        status: 'executando',
        procedimento_nome: PROC_ORTO.nome,
        executor_nome: EXECUTOR_ORTO.nome,
      });

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id), itemId: '1' });
      const { status, data } = await callRoute(putItem, '/api/atendimentos/10/itens/1', {
        method: 'PUT',
        body: { status: 'executando', usuario_id: EXECUTOR_ORTO.id },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'executando');
    });

    test('PUT marca item como concluído', async () => {
      mockQueryResponse('select * from atendimentos where id', {
        ...ATENDIMENTO_ORTO_BASE,
        status: 'em_execucao',
      });
      mockQueryResponse('select * from itens_atendimento where id', {
        id: 1,
        atendimento_id: ATENDIMENTO_ORTO_BASE.id,
        procedimento_id: PROC_ORTO.id,
        executor_id: EXECUTOR_ORTO.id,
        valor: PROC_ORTO.valor,
        status: 'executando',
      });
      mockQueryResponse('select \n        i.*', {
        id: 1,
        status: 'concluido',
        concluido_at: '2025-02-01T12:00:00',
        procedimento_nome: PROC_ORTO.nome,
        executor_nome: EXECUTOR_ORTO.nome,
      });

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id), itemId: '1' });
      const { status, data } = await callRoute(putItem, '/api/atendimentos/10/itens/1', {
        method: 'PUT',
        body: { status: 'concluido', usuario_id: EXECUTOR_ORTO.id },
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('status', 'concluido');
    });
  });

  // ═════════════════════════════════════════════
  // ETAPA 6: Finalizar e verificar comissões
  // ═════════════════════════════════════════════

  describe('Etapa 6 — Finalizar atendimento orto', () => {
    test('POST /api/atendimentos/10/finalizar com comissões corretas', async () => {
      mockQueryResponse('select id, status from atendimentos where id', {
        id: ATENDIMENTO_ORTO_BASE.id,
        status: 'em_execucao',
      });
      // 1 item, concluído e pago
      mockQueryResponse('from itens_atendimento where atendimento_id', [
        {
          id: 1,
          valor: PROC_ORTO.valor,
          valor_pago: PROC_ORTO.valor,
          status: 'concluido',
          criado_por_id: null, // Orto não tem criado_por (não tem avaliador)
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
        },
      ]);
      mockQueryResponse('select id, comissao_venda, comissao_execucao from procedimentos where id', {
        id: PROC_ORTO.id,
        comissao_venda: PROC_ORTO.comissao_venda,
        comissao_execucao: PROC_ORTO.comissao_execucao,
      });

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id) });
      const { status, data } = await callRoute(postFinalizar, '/api/atendimentos/10/finalizar', {
        method: 'POST',
      }, ctx);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Comissão: apenas execução (não há criado_por_id para venda)
      // 30% de 350 = 105
      expect(data.comissoes.venda).toBe(0);
      expect(data.comissoes.execucao).toBe(PROC_ORTO.valor * (PROC_ORTO.comissao_execucao / 100));
      expect(data.comissoes.total).toBe(
        PROC_ORTO.valor * (PROC_ORTO.comissao_execucao / 100)
      );

      // Verifica que apenas 1 comissão foi gerada (só execução, sem venda)
      expect(data.comissoes.detalhes).toHaveLength(1);
      expect(data.comissoes.detalhes[0]).toEqual(
        expect.objectContaining({
          tipo: 'execucao',
          usuario_id: EXECUTOR_ORTO.id,
          valor: PROC_ORTO.valor * (PROC_ORTO.comissao_execucao / 100),
        })
      );
    });

    test('query de finalização atualiza status para finalizado', async () => {
      mockQueryResponse('select id, status from atendimentos where id', {
        id: ATENDIMENTO_ORTO_BASE.id,
        status: 'em_execucao',
      });
      mockQueryResponse('from itens_atendimento where atendimento_id', [
        {
          id: 1,
          valor: 350,
          valor_pago: 350,
          status: 'concluido',
          criado_por_id: null,
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
        },
      ]);
      mockQueryResponse('select id, comissao_venda, comissao_execucao from procedimentos where id', PROC_ORTO);

      const ctx = createRouteContext({ id: String(ATENDIMENTO_ORTO_BASE.id) });
      await callRoute(postFinalizar, '/api/atendimentos/10/finalizar', {
        method: 'POST',
      }, ctx);

      const queries = getExecutedQueries();
      const finalizeQ = queries.find(q =>
        q.sql.toLowerCase().includes("status = 'finalizado'")
      );
      expect(finalizeQ).toBeDefined();
      expect(finalizeQ!.params).toContain(ATENDIMENTO_ORTO_BASE.id);
    });
  });

  // ═════════════════════════════════════════════
  // Fluxo orto vs normal — diferenças
  // ═════════════════════════════════════════════

  describe('Diferenças do fluxo orto', () => {
    test('atendimento orto não passa por triagem nem avaliação', async () => {
      // O atendimento orto é criado diretamente em aguardando_pagamento
      // Verificando via queries executadas
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR_ORTO.id, role: 'executor' });
      mockQueryResponse('select id, valor, nome from procedimentos where id', PROC_ORTO);
      setLastInsertId(50);
      mockQueryResponse('null as avaliador_nome', {
        ...ATENDIMENTO_ORTO_BASE,
        id: 50,
        status: 'aguardando_pagamento',
      });

      await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
        },
      });

      const queries = getExecutedQueries();
      const insertAtend = queries.find(q =>
        q.sql.toLowerCase().includes('insert into atendimentos')
      );
      // Status inserido é aguardando_pagamento (pula triagem e avaliação)
      expect(insertAtend).toBeDefined();
      // O status é hardcoded no SQL, não como parâmetro
      expect(insertAtend!.sql.toLowerCase()).toContain('aguardando_pagamento');
    });

    test('atendimento orto cria item automaticamente na criação', async () => {
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR_ORTO.id, role: 'executor' });
      mockQueryResponse('select id, valor, nome from procedimentos where id', {
        ...PROC_ORTO,
        valor: 400,
      });
      setLastInsertId(51);
      mockQueryResponse('null as avaliador_nome', {
        ...ATENDIMENTO_ORTO_BASE,
        id: 51,
        status: 'aguardando_pagamento',
      });

      await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
          valor: 400,
        },
      });

      const queries = getExecutedQueries();
      const insertItem = queries.find(q =>
        q.sql.toLowerCase().includes('insert into itens_atendimento')
      );
      expect(insertItem).toBeDefined();
      // Valor do item deve ser 400 (custom) ou o padrão do procedimento
      expect(insertItem!.params).toContain(400);
    });

    test('atendimento orto sem avaliador (avaliador_id é null)', async () => {
      mockQueryResponse('select id from clientes where id', { id: CLIENTE_ORTO.id });
      mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
      mockQueryResponse('select id, role from usuarios where id', { id: EXECUTOR_ORTO.id, role: 'executor' });
      mockQueryResponse('select id, valor, nome from procedimentos where id', PROC_ORTO);
      setLastInsertId(52);
      mockQueryResponse('null as avaliador_nome', {
        ...ATENDIMENTO_ORTO_BASE,
        id: 52,
        status: 'aguardando_pagamento',
        avaliador_id: null,
      });

      const { data } = await callRoute(postAtendimentos, '/api/atendimentos', {
        method: 'POST',
        body: {
          cliente_id: CLIENTE_ORTO.id,
          tipo_orto: true,
          executor_id: EXECUTOR_ORTO.id,
          procedimento_id: PROC_ORTO.id,
        },
      });

      expect(data).toHaveProperty('avaliador_id', null);
    });
  });
});
