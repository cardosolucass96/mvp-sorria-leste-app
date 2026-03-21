/**
 * Sprint 7 — Testes de notas de execução
 *
 * Cobre: GET  /api/execucao/item/[id]/notas
 *        POST /api/execucao/item/[id]/notas
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

import { GET as listNotas, POST as addNota } from '@/app/api/execucao/item/[id]/notas/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

const NOTA_EXEMPLO = {
  id: 1,
  item_atendimento_id: 3,
  usuario_id: 4,
  texto: 'Paciente relatou sensibilidade. Agendado retorno em 7 dias.',
  created_at: '2025-02-10 14:30:00',
  usuario_nome: 'Dr. Carlos Executor',
};

// =============================================================================
// GET /api/execucao/item/[id]/notas
// =============================================================================

describe('GET /api/execucao/item/[id]/notas', () => {
  it('retorna lista de notas com usuario_nome', async () => {
    mockQueryResponse('from notas_execucao n', [NOTA_EXEMPLO]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listNotas, '/api/execucao/item/3/notas', {}, ctx);

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].usuario_nome).toBe('Dr. Carlos Executor');
    expect(data[0].texto).toContain('sensibilidade');
  });

  it('retorna lista vazia', async () => {
    mockQueryResponse('from notas_execucao n', []);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listNotas, '/api/execucao/item/3/notas', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('ordena por created_at DESC (mais recente primeiro)', async () => {
    mockQueryResponse('from notas_execucao n', []);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(listNotas, '/api/execucao/item/3/notas', {}, ctx);

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY n.created_at DESC');
  });

  it('retorna múltiplas notas', async () => {
    const notas = [
      { ...NOTA_EXEMPLO, id: 1 },
      { ...NOTA_EXEMPLO, id: 2, texto: 'Segunda consulta realizada.' },
    ];
    mockQueryResponse('from notas_execucao n', notas);

    const ctx = createRouteContext({ id: '3' });
    const { data } = await callRoute(listNotas, '/api/execucao/item/3/notas', {}, ctx);

    expect(data).toHaveLength(2);
  });
});

// =============================================================================
// POST /api/execucao/item/[id]/notas
// =============================================================================

describe('POST /api/execucao/item/[id]/notas', () => {
  it('cria nota com sucesso', async () => {
    setLastInsertId(5);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ id: number; message: string }>(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 4, texto: 'Nota de acompanhamento do procedimento.' },
    }, ctx);

    expect(status).toBe(201);
    expect(data.id).toBe(5);
    expect(data.message).toBe('Nota adicionada com sucesso');
  });

  it('salva dados corretos no banco', async () => {
    setLastInsertId(6);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 4, texto: '  Nota com espaços  ' },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO notas_execucao'));
    expect(insertQ!.params[0]).toBe(3);  // item_atendimento_id
    expect(insertQ!.params[1]).toBe(4);  // usuario_id
    expect(insertQ!.params[2]).toBe('Nota com espaços'); // texto trimmed
  });

  it('rejeita sem usuario_id', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { texto: 'Alguma nota' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Usuário é obrigatório');
  });

  it('rejeita sem texto', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 4 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Texto da nota é obrigatório');
  });

  it('rejeita texto vazio (só espaços)', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 4, texto: '   ' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita texto string vazia', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 4, texto: '' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('OBSERVAÇÃO: qualquer usuario_id é aceito (sem verificação de role)', async () => {
    // A rota não verifica se o usuario é executor do item.
    // Qualquer usuario_id é aceito — pode ser um problema de segurança.
    setLastInsertId(7);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(addNota, '/api/execucao/item/3/notas', {
      method: 'POST',
      body: { usuario_id: 2, texto: 'Nota de um atendente, não executor' },
    }, ctx);

    expect(status).toBe(201); // Aceita sem verificar role
  });
});
