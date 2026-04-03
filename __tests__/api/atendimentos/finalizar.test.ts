/**
 * Testes de finalização de atendimento (rota redesenhada)
 *
 * Cobre: POST /api/atendimentos/[id]/finalizar
 *   - Apenas motivo_saida='sem_tratamento' é aceito (saída sem procedimentos)
 *   - Demais motivos retornam 400 (usar fluxo normal de conclusão de itens)
 *   - Validações (status em_execucao, atendimento existe)
 *   - UPDATE de status e finalizado_at e motivo_saida
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
  ATENDIMENTO_EM_EXECUCAO,
  ATENDIMENTO_AGUARDANDO_PGTO,
  ATENDIMENTO_TRIAGEM,
  ATENDIMENTO_AVALIACAO,
} from '../../helpers/seed';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin Teste',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as finalizar } from '@/app/api/atendimentos/[id]/finalizar/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// Validações básicas
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — validações', () => {
  it('rejeita se atendimento não encontrado', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/999/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('rejeita se atendimento está em triagem', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_TRIAGEM]);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/1/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });

  it('rejeita se atendimento está em avaliação', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_AVALIACAO]);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(finalizar, '/api/atendimentos/2/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita se atendimento está aguardando_pagamento', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_AGUARDANDO_PGTO]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(finalizar, '/api/atendimentos/3/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita se atendimento já está finalizado', async () => {
    const finalizado = { ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' };
    mockQueryResponse('from atendimentos where id', [finalizado]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });
});

// =============================================================================
// Novo comportamento: apenas motivo_saida=sem_tratamento é aceito
// =============================================================================

describe('POST /api/atendimentos/[id]/finalizar — novo fluxo', () => {
  it('rejeita quando motivo_saida não é sem_tratamento (default tratamento_completo)', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_EM_EXECUCAO]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Use o fluxo normal: conclua os procedimentos para finalizar o atendimento');
  });

  it('rejeita motivo_saida=tratamento_completo explícito', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_EM_EXECUCAO]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'tratamento_completo' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Use o fluxo normal: conclua os procedimentos para finalizar o atendimento');
  });

  it('rejeita motivo_saida=continuacao', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_EM_EXECUCAO]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'continuacao' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Use o fluxo normal: conclua os procedimentos para finalizar o atendimento');
  });

  it('finaliza com sucesso quando motivo_saida=sem_tratamento', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_EM_EXECUCAO]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{
      success: boolean;
      message: string;
    }>(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Atendimento finalizado com sucesso');
  });

  it('UPDATE define status finalizado, finalizado_at e motivo_saida', async () => {
    mockQueryResponse('from atendimentos where id', [ATENDIMENTO_EM_EXECUCAO]);

    const ctx = createRouteContext({ id: '4' });
    await callRoute(finalizar, '/api/atendimentos/4/finalizar', {
      method: 'POST',
      body: { motivo_saida: 'sem_tratamento' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateAtendimento = queries.find(q =>
      q.sql.includes("UPDATE atendimentos SET status = 'finalizado'")
    );
    expect(updateAtendimento).toBeDefined();
    expect(updateAtendimento!.sql).toContain('finalizado_at');
    expect(updateAtendimento!.sql).toContain("datetime('now', 'localtime')");
    expect(updateAtendimento!.sql).toContain('motivo_saida');
    expect(updateAtendimento!.params).toContain('sem_tratamento');
  });

  it('sem proteção contra finalização duplicada (status check apenas)', async () => {
    const finalizadoAtendimento = { ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' };
    mockQueryResponse('from atendimentos where id', [finalizadoAtendimento]);

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(
      finalizar, '/api/atendimentos/4/finalizar', {
        method: 'POST',
        body: { motivo_saida: 'sem_tratamento' },
      }, ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento não está em execução');
  });
});
