/**
 * Sprint 5 — Testes da máquina de estados /api/atendimentos/[id] PUT
 *
 * Cobre todas as transições válidas e inválidas:
 *   triagem → avaliacao ✓
 *   avaliacao → aguardando_pagamento (requer ≥1 item)
 *   aguardando_pagamento → em_execucao (requer ≥1 item pago)
 *   em_execucao → aguardando_pagamento (volta)
 *   finalizado → nenhuma transição
 *   Transições inválidas (pular etapas, voltar ilegalmente)
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
import {
  ATENDIMENTO_TRIAGEM,
  ATENDIMENTO_AVALIACAO,
  ATENDIMENTO_AGUARDANDO_PGTO,
  ATENDIMENTO_EM_EXECUCAO,
} from '../../helpers/seed';

import { PUT as updateAtendimento } from '@/app/api/atendimentos/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// Helper para mock do atendimento + response pós-update
function mockAtendimentoAndReturn(atendimento: Record<string, unknown>) {
  mockQueryResponse('select * from atendimentos where id', atendimento);
  mockQueryResponse('from atendimentos a', atendimento);
}

// =============================================================================
// Transições VÁLIDAS
// =============================================================================

describe('Máquina de estados — transições válidas', () => {
  it('triagem → avaliacao', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'avaliacao' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.params).toContain('avaliacao');
  });

  it('avaliacao → aguardando_pagamento (com itens)', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_AVALIACAO);
    // Tem itens
    mockQueryResponse('select count(*) as count from itens_atendimento where atendimento_id', { count: 2 });

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/2', {
      method: 'PUT',
      body: { status: 'aguardando_pagamento' },
    }, ctx);

    expect(status).toBe(200);
  });

  it('aguardando_pagamento → em_execucao (com item pago)', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_AGUARDANDO_PGTO);
    // Tem itens pagos
    mockQueryResponse("select count(*) as count from itens_atendimento", { count: 1 });
    // Mock para o liberado_por_id (SELECT id FROM usuarios LIMIT 1)
    mockQueryResponse('select id from usuarios limit', { id: 1 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/3', {
      method: 'PUT',
      body: { status: 'em_execucao' },
    }, ctx);

    expect(status).toBe(200);

    // Verifica que setou liberado_por_id e liberado_em
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
    expect(updateQuery!.sql).toContain('liberado_por_id = ?');
    expect(updateQuery!.sql).toContain("liberado_em = datetime('now'");
  });

  it('em_execucao → aguardando_pagamento (volta permitida)', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_EM_EXECUCAO);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/4', {
      method: 'PUT',
      body: { status: 'aguardando_pagamento' },
    }, ctx);

    expect(status).toBe(200);
  });
});

// =============================================================================
// Transições INVÁLIDAS (bloqueadas)
// =============================================================================

describe('Máquina de estados — transições inválidas', () => {
  it('triagem → aguardando_pagamento (pular etapa)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'aguardando_pagamento' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toContain('Não é possível mudar de "triagem" para "aguardando_pagamento"');
  });

  it('triagem → em_execucao (pular 2 etapas)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'em_execucao' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toContain('Não é possível mudar');
  });

  it('triagem → finalizado (pular direto ao final)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'finalizado' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('avaliacao → em_execucao (pular pagamento)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/2', {
      method: 'PUT',
      body: { status: 'em_execucao' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('avaliacao → triagem (voltar)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/2', {
      method: 'PUT',
      body: { status: 'triagem' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('aguardando_pagamento → avaliacao (voltar indevido)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/3', {
      method: 'PUT',
      body: { status: 'avaliacao' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('aguardando_pagamento → finalizado (pular execução)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/3', {
      method: 'PUT',
      body: { status: 'finalizado' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('em_execucao → triagem (volta muito longe)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/4', {
      method: 'PUT',
      body: { status: 'triagem' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('em_execucao → avaliacao (volta muito longe)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/4', {
      method: 'PUT',
      body: { status: 'avaliacao' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('finalizado → qualquer status (imutável)', async () => {
    const atendimentoFinalizado = { ...ATENDIMENTO_EM_EXECUCAO, id: 5, status: 'finalizado', finalizado_at: '2025-03-01' };

    for (const novoStatus of ['triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao']) {
      resetMockDb();
      mockQueryResponse('select * from atendimentos where id', atendimentoFinalizado);

      const ctx = createRouteContext({ id: '5' });
      const { status } = await callRoute(updateAtendimento, '/api/atendimentos/5', {
        method: 'PUT',
        body: { status: novoStatus },
      }, ctx);

      expect(status).toBe(400);
    }
  });

  it('status inválido/inexistente', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'cancelado' },
    }, ctx);

    expect(status).toBe(400);
  });
});

// =============================================================================
// Condições de transição
// =============================================================================

describe('Máquina de estados — condições', () => {
  it('avaliacao → aguardando_pagamento SEM itens → erro', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('from atendimentos a', ATENDIMENTO_AVALIACAO);
    // Sem itens
    mockQueryResponse('select count(*) as count from itens_atendimento where atendimento_id', { count: 0 });

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/2', {
      method: 'PUT',
      body: { status: 'aguardando_pagamento' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('É necessário adicionar pelo menos um procedimento');
  });

  it('aguardando_pagamento → em_execucao SEM item pago → erro', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from atendimentos a', ATENDIMENTO_AGUARDANDO_PGTO);
    // Sem itens pagos
    mockQueryResponse("select count(*) as count from itens_atendimento", { count: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/3', {
      method: 'PUT',
      body: { status: 'em_execucao' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('É necessário ter pelo menos um procedimento totalmente pago para liberar');
  });
});

// =============================================================================
// Outros cenários de PUT
// =============================================================================

describe('PUT /api/atendimentos/[id] — outros', () => {
  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/999', {
      method: 'PUT',
      body: { status: 'avaliacao' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('atualiza avaliador_id', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { avaliador_id: 3 },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
    expect(updateQuery!.sql).toContain('avaliador_id = ?');
  });

  it('remove avaliador (avaliador_id = null)', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { avaliador_id: null },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
    expect(updateQuery!.params).toContain(null);
  });

  it('rejeita body vazio', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nenhum campo para atualizar');
  });

  it('mesmo status não dispara validação de transição', async () => {
    mockAtendimentoAndReturn(ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateAtendimento, '/api/atendimentos/1', {
      method: 'PUT',
      body: { status: 'triagem' }, // mesmo status
    }, ctx);

    // status === atendimento.status → skip validação → update normal
    expect(status).toBe(200);
  });
});
