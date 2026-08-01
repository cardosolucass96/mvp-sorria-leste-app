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

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn(),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { extractToken, verifyToken } from '@/lib/auth/jwt';
import { GET as getProntuario, POST as saveProntuario } from '@/app/api/execucao/item/[id]/prontuario/route';

const mockVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockExtractToken = extractToken as jest.MockedFunction<typeof extractToken>;

function makeExecutorPayload() {
  return {
    sub: 4,
    email: 'executor@test.com',
    role: 'executor',
    roles: ['executor'],
    nome: 'Dr. Carlos Executor',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
}

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  mockVerifyToken.mockResolvedValue(makeExecutorPayload());
  mockExtractToken.mockReturnValue('mock-token');
  mockQueryResponse('from itens_atendimento i', {
    id: 3,
    executor_id: 4,
    unidade_id: 1,
    atendimento_status: 'em_execucao',
    item_status: 'executando',
  });
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

const DESCRICAO_VALIDA = 'Realizada restauração do dente 11 com resina composta A2. Sem intercorrências.'; // > 10 chars
const DESCRICAO_CURTA = 'Curta'; // < 10 chars

// =============================================================================
// GET /api/execucao/item/[id]/prontuario
// =============================================================================

describe('GET /api/execucao/item/[id]/prontuario', () => {
  it('exige autenticação', async () => {
    mockExtractToken.mockReturnValueOnce(null);
    const { status } = await callRoute(
      getProntuario,
      '/api/execucao/item/3/prontuario',
      { headers: { Authorization: '' } },
      createRouteContext({ id: '3' })
    );

    expect(status).toBe(401);
  });

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

  it('não expõe prontuário de outra unidade', async () => {
    mockQueryResponse('from itens_atendimento i', {
      id: 3,
      executor_id: 4,
      unidade_id: 2,
      atendimento_status: 'em_execucao',
      item_status: 'executando',
    });

    const { status } = await callRoute(
      getProntuario,
      '/api/execucao/item/3/prontuario',
      {},
      createRouteContext({ id: '3' })
    );

    expect(status).toBe(404);
  });
});

// =============================================================================
// POST /api/execucao/item/[id]/prontuario  (upsert)
// =============================================================================

describe('POST /api/execucao/item/[id]/prontuario', () => {
  it('permanece restrito ao executor responsável', async () => {
    mockVerifyToken.mockResolvedValue({
      ...makeExecutorPayload(),
      sub: 8,
      role: 'admin',
      roles: ['admin'],
    });

    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_VALIDA },
      },
      createRouteContext({ id: '3' })
    );

    expect(status).toBe(403);
    expect(getExecutedQueries().some((query) => query.sql.includes('INSERT INTO prontuarios'))).toBe(false);
  });

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
    expect(updateQ!.sql).toContain('updated_at = ?');
  });

  it('bloqueia sobrescrita quando o item já está em uma evolução em lote', async () => {
    mockQueryResponse('from prontuario_evolucao_itens pei', { id: 8, legacy_prontuario_id: null });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: DESCRICAO_VALIDA },
      },
      ctx
    );

    expect(status).toBe(409);
    expect(data.error).toContain('evolução em lote');
    expect(getExecutedQueries().some((q) => q.sql.includes('INSERT INTO prontuarios'))).toBe(false);
    expect(getExecutedQueries().some((q) => q.sql.includes('UPDATE prontuarios'))).toBe(false);
  });

  it('rejeita descrição com menos de 10 caracteres', async () => {
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
    expect(data.error).toContain('10');
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

  it('deriva o usuário do JWT quando usuario_id não é enviado', async () => {
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);
    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { descricao: DESCRICAO_VALIDA },
      },
      ctx
    );

    expect(status).toBe(200);
    const insertQ = getExecutedQueries().find(q => q.sql.includes('INSERT INTO prontuarios'));
    expect(insertQ?.params[1]).toBe(4);
  });

  it('faz trim na descrição antes de validar', async () => {
    const ctx = createRouteContext({ id: '3' });
    // Espaços antes e depois — após trim, fica com < 10 chars
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: '   ' + DESCRICAO_CURTA + '   ' },
      },
      ctx
    );

    expect(status).toBe(400); // DESCRICAO_CURTA < 10 chars
  });

  it('aceita descrição de exatamente 10 caracteres', async () => {
    const descricao10 = 'A'.repeat(10);
    // queryOne → null (novo prontuário)
    mockQueryResponse('from prontuarios p', PRONTUARIO_EXEMPLO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      saveProntuario,
      '/api/execucao/item/3/prontuario',
      {
        method: 'POST',
        body: { usuario_id: 4, descricao: descricao10 },
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
