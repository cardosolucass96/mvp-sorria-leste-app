/**
 * Sprint 7 — Testes de prontuário eletrônico
 *
 * Cobre: GET  /api/execucao/item/[id]/prontuario
 *        POST /api/execucao/item/[id]/prontuario  (upsert: cria ou atualiza)
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
} from '../../helpers/db-mock';

import { GET as getProntuario, POST as saveProntuario } from '@/app/api/execucao/item/[id]/prontuario/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

const PRONTUARIO_EXEMPLO = {
  id: 1,
  item_atendimento_id: 3,
  usuario_id: 4,
  usuario_nome: 'Dr. Carlos Executor',
  descricao: 'Realizada restauração do dente 11 com resina composta A2. Paciente colaborativo, procedimento sem intercorrências.',
  observacoes: 'Retorno em 7 dias.',
  created_at: '2025-02-10 16:00:00',
  updated_at: '2025-02-10 16:00:00',
};

const DESCRICAO_VALIDA = 'Realizada restauração do dente 11 com resina composta A2. Sem intercorrências.'; // > 50 chars
const DESCRICAO_CURTA = 'Procedimento feito com sucesso. Ok.'; // < 50 chars

// =============================================================================
// GET /api/execucao/item/[id]/prontuario
// =============================================================================

describe('GET /api/execucao/item/[id]/prontuario', () => {
  it('retorna prontuário existente com usuario_nome', async () => {
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ prontuario: typeof PRONTUARIO_EXEMPLO }>(
      getProntuario,
      '/api/execucao/item/3/prontuario',
      {},
      ctx
    );

    expect(status).toBe(200);
    expect(data.prontuario).toBeDefined();
    expect(data.prontuario.descricao).toContain('restauração');
    expect(data.prontuario.usuario_nome).toBe('Dr. Carlos Executor');
  });

  it('retorna prontuario: null quando não existe', async () => {
    // queryOne retorna null (nada mockado)

    const ctx = createRouteContext({ id: '99' });
    const { status, data } = await callRoute<{ prontuario: null }>(
      getProntuario,
      '/api/execucao/item/99/prontuario',
      {},
      ctx
    );

    expect(status).toBe(200);
    expect(data.prontuario).toBeNull();
  });

  it('é único por item (queryOne, não query)', async () => {
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    const { data } = await callRoute<{ prontuario: typeof PRONTUARIO_EXEMPLO }>(
      getProntuario,
      '/api/execucao/item/3/prontuario',
      {},
      ctx
    );

    // Deve retornar objeto, não array
    expect(data.prontuario).not.toBeInstanceOf(Array);
    expect(data.prontuario.id).toBe(1);
  });
});

// =============================================================================
// POST /api/execucao/item/[id]/prontuario  (upsert)
// =============================================================================

describe('POST /api/execucao/item/[id]/prontuario', () => {
  it('cria prontuário novo quando não existe', async () => {
    setLastInsertId(5);
    // queryOne para check existente → null (não mockado)
    // Após insert, retorna prontuário
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ success: boolean; prontuario: typeof PRONTUARIO_EXEMPLO; message: string }>(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_VALIDA, observacoes: 'Retorno em 7 dias.' },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Prontuário criado');
    expect(data.prontuario).toBeDefined();

    // Verifica INSERT
    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO prontuarios'));
    expect(insertQ).toBeDefined();
    expect(insertQ!.params[0]).toBe(3); // item_atendimento_id
    expect(insertQ!.params[1]).toBe(4); // usuario_id
  });

  it('atualiza prontuário existente (upsert)', async () => {
    // queryOne para check existente → encontrado
    mockQueryResponse('select id from prontuarios', { id: 1 });
    // Após update, retorna prontuário
    mockQueryResponse('from prontuarios p', { ...PRONTUARIO_EXEMPLO, descricao: 'Nova descricao atualizada com mais de cinquenta caracteres para validação completa' });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ success: boolean; message: string }>(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: 'Nova descricao atualizada com mais de cinquenta caracteres para validação completa' },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Prontuário atualizado');

    // Verifica UPDATE (não INSERT)
    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.includes('UPDATE prontuarios'));
    expect(updateQ).toBeDefined();
    expect(updateQ!.sql).toContain("updated_at = datetime('now', 'localtime')");
  });

  it('rejeita descrição com menos de 50 caracteres', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_CURTA },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('mínimo');
    expect(data.error).toContain('50');
  });

  it('rejeita sem descrição', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4 },
      },
      ctx
    );

    expect(status).toBe(400);
  });

  it('rejeita descrição vazia', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: '' },
      },
      ctx
    );

    expect(status).toBe(400);
  });

  it('rejeita sem usuario_id', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { descricao: DESCRICAO_VALIDA },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Usuário não identificado');
  });

  it('faz trim na descrição antes de validar', async () => {
    const ctx = createRouteContext({ id: '3' });
    // Espaços antes e depois — após trim, fica com < 50 chars
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: '   ' + DESCRICAO_CURTA + '   ' },
      },
      ctx
    );

    expect(status).toBe(400); // DESCRICAO_CURTA < 50 chars
  });

  it('aceita descrição de exatamente 50 caracteres', async () => {
    const descricao50 = 'A'.repeat(50);
    // queryOne → null (novo prontuário)
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: descricao50 },
      },
      ctx
    );

    expect(status).toBe(200);
  });

  it('salva observações como null quando não fornecidas', async () => {
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_VALIDA },
      },
      ctx
    );

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO prontuarios'));
    expect(insertQ!.params[3]).toBeNull(); // observacoes
  });

  it('salva observações com trim', async () => {
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_VALIDA, observacoes: '  Retorno em 7 dias  ' },
      },
      ctx
    );

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO prontuarios'));
    expect(insertQ!.params[3]).toBe('Retorno em 7 dias');
  });
});
