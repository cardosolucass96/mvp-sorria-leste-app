/**
 * Sprint 5 — Testes de itens de atendimento
 *
 * Cobre: GET lista itens, POST adicionar item, DELETE remover item,
 *        PUT [itemId] atualizar item (status, executor, valor)
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
import {
  ATENDIMENTO_TRIAGEM,
  ATENDIMENTO_AVALIACAO,
  ATENDIMENTO_AGUARDANDO_PGTO,
  ATENDIMENTO_EM_EXECUCAO,
  ITEM_LIMPEZA_PENDENTE,
  ITEM_RESTAURACAO_PAGO,
  ITEM_CANAL_EXECUTANDO,
  PROC_LIMPEZA,
  PROC_RESTAURACAO,
  USUARIO_EXECUTOR,
} from '../../helpers/seed';

import { GET as listItens, POST as addItem, DELETE as removeItem } from '@/app/api/atendimentos/[id]/itens/route';
import { PUT as updateItem } from '@/app/api/atendimentos/[id]/itens/[itemId]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/atendimentos/[id]/itens
// =============================================================================

describe('GET /api/atendimentos/[id]/itens', () => {
  it('retorna lista de itens com JOINs', async () => {
    const itensComJoin = [
      { ...ITEM_LIMPEZA_PENDENTE, procedimento_nome: 'Limpeza Dental', executor_nome: 'Dr. Carlos Executor', criado_por_nome: 'Dr. João Avaliador' },
    ];
    mockQueryResponse('from itens_atendimento i', itensComJoin);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listItens, '/api/atendimentos/3/itens', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(itensComJoin);
  });

  it('retorna lista vazia se sem itens', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(listItens, '/api/atendimentos/1/itens', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('ordena por created_at ASC', async () => {
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(listItens, '/api/atendimentos/1/itens', {}, ctx);

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY i.created_at ASC');
  });
});

// =============================================================================
// POST /api/atendimentos/[id]/itens  (adicionar)
// =============================================================================

describe('POST /api/atendimentos/[id]/itens', () => {
  const novoItem = {
    ...ITEM_LIMPEZA_PENDENTE,
    id: 10,
    procedimento_nome: 'Limpeza Dental',
    executor_nome: 'Dr. Carlos Executor',
  };

  it('adiciona item em triagem', async () => {
    setLastInsertId(10);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(addItem, '/api/atendimentos/1/itens', {
      method: 'POST',
      body: { procedimento_id: 1, criado_por_id: 3 },
    }, ctx);

    expect(status).toBe(201);
  });

  it('adiciona item em avaliacao', async () => {
    setLastInsertId(11);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, criado_por_id: 3 },
    }, ctx);

    expect(status).toBe(201);
  });

  it('adiciona item em em_execucao → volta para aguardando_pagamento', async () => {
    setLastInsertId(12);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);
    mockQueryResponse('select id, role from usuarios where id', { id: 4, role: 'executor' });
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(addItem, '/api/atendimentos/4/itens', {
      method: 'POST',
      body: { procedimento_id: 2, executor_id: 4, criado_por_id: 3 },
    }, ctx);

    expect(status).toBe(201);

    // Verifica que voltou para aguardando_pagamento
    const queries = getExecutedQueries();
    const statusUpdate = queries.find(q => q.sql.includes("UPDATE atendimentos SET status = 'aguardando_pagamento'"));
    expect(statusUpdate).toBeDefined();
  });

  it('rejeita adicionar em aguardando_pagamento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/3/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Não é possível adicionar procedimentos neste status');
  });

  it('rejeita adicionar em finalizado', async () => {
    const atFinalizado = { ...ATENDIMENTO_EM_EXECUCAO, status: 'finalizado' };
    mockQueryResponse('select * from atendimentos where id', atFinalizado);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(addItem, '/api/atendimentos/4/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/999/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('rejeita se procedimento_id não enviado', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Procedimento é obrigatório');
  });

  it('rejeita se procedimento não existe ou inativo', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    // procedimento não encontrado (não mockado)

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 999 },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Procedimento não encontrado ou inativo');
  });

  it('usa valor do procedimento quando não especificado', async () => {
    setLastInsertId(13);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA); // valor = 150
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    // valor = procedimento.valor = 150
    expect(insertQuery!.params[4]).toBe(150);
  });

  it('usa valor customizado quando especificado', async () => {
    setLastInsertId(14);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, valor: 300 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertQuery!.params[4]).toBe(300);
  });

  it('salva campo dentes quando fornecido', async () => {
    setLastInsertId(15);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 2, dentes: '["11","21"]', quantidade: 2 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertQuery!.params[5]).toBe('["11","21"]'); // dentes
    expect(insertQuery!.params[6]).toBe(2); // quantidade
  });

  it('quantidade default é 1', async () => {
    setLastInsertId(16);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertQuery!.params[6]).toBe(1);
  });

  it('rejeita executor que não existe', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    // Executor não encontrado

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, executor_id: 999 },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Executor não encontrado');
  });

  it('rejeita se usuário selecionado não é executor', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('select id, role from usuarios where id', { id: 2, role: 'atendente' });

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, executor_id: 2 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Usuário selecionado não é executor');
  });

  it('aceita admin como executor', async () => {
    setLastInsertId(17);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('select id, role from usuarios where id', { id: 1, role: 'admin' });
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, executor_id: 1 },
    }, ctx);

    expect(status).toBe(201);
  });
});

// =============================================================================
// DELETE /api/atendimentos/[id]/itens  (remover)
// =============================================================================

describe('DELETE /api/atendimentos/[id]/itens', () => {
  it('remove item durante avaliação', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ message: string }>(removeItem, '/api/atendimentos/2/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(200);
    expect(data.message).toBe('Item removido com sucesso');

    const queries = getExecutedQueries();
    const deleteQuery = queries.find(q => q.sql.includes('DELETE FROM itens_atendimento'));
    expect(deleteQuery).toBeDefined();
  });

  it('rejeita se atendimento não está em avaliação', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_TRIAGEM);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(removeItem, '/api/atendimentos/1/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Só é possível remover procedimentos durante a avaliação');
  });

  it('rejeita se item_id não enviado', async () => {
    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(removeItem, '/api/atendimentos/2/itens', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('ID do item é obrigatório');
  });

  it('rejeita se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status } = await callRoute(removeItem, '/api/atendimentos/999/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(404);
  });

  it('rejeita se item não encontrado no atendimento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    // item não encontrado (não mockado)

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(removeItem, '/api/atendimentos/2/itens', {
      method: 'DELETE',
      searchParams: { item_id: '999' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Item não encontrado');
  });

  it('rejeita remover em aguardando_pagamento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(removeItem, '/api/atendimentos/3/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita remover em em_execucao', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(removeItem, '/api/atendimentos/4/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(400);
  });
});

// =============================================================================
// PUT /api/atendimentos/[id]/itens/[itemId]  (atualizar item)
// =============================================================================

describe('PUT /api/atendimentos/[id]/itens/[itemId]', () => {
  it('atualiza executor_id', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_RESTAURACAO_PAGO);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_RESTAURACAO_PAGO, procedimento_nome: 'Restauração', executor_nome: 'Novo' });

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { executor_id: 4 },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(update!.sql).toContain('executor_id = ?');
  });

  it('atualiza valor do item', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_RESTAURACAO_PAGO);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_RESTAURACAO_PAGO, procedimento_nome: 'Restauração', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { valor: 500 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('atualiza status para executando', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    const item = { ...ITEM_RESTAURACAO_PAGO, executor_id: 4 };
    mockQueryResponse('select * from itens_atendimento where id', item);
    mockQueryResponse('from itens_atendimento i', { ...item, procedimento_nome: 'Restauração', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { status: 'executando', usuario_id: 4 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('marca concluido_at automaticamente ao concluir', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_CANAL_EXECUTANDO);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_CANAL_EXECUTANDO, procedimento_nome: 'Canal', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '4', itemId: '3' });
    await callRoute(updateItem, '/api/atendimentos/4/itens/3', {
      method: 'PUT',
      body: { status: 'concluido', usuario_id: 4 },
    }, ctx);

    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(update!.sql).toContain('concluido_at = CURRENT_TIMESTAMP');
  });

  it('bloqueia executor não designado de alterar status para executando', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    const item = { ...ITEM_RESTAURACAO_PAGO, executor_id: 4 };
    mockQueryResponse('select * from itens_atendimento where id', item);

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { status: 'executando', usuario_id: 99 }, // outro user
    }, ctx);

    expect(status).toBe(403);
    expect(data.error).toBe('Apenas o executor designado pode alterar o status deste procedimento');
  });

  it('bloqueia executor não designado de concluir', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', { ...ITEM_CANAL_EXECUTANDO, executor_id: 4 });

    const ctx = createRouteContext({ id: '4', itemId: '3' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/3', {
      method: 'PUT',
      body: { status: 'concluido', usuario_id: 2 },
    }, ctx);

    expect(status).toBe(403);
  });

  it('permite status sem restrição de executor se sem usuario_id', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', { ...ITEM_RESTAURACAO_PAGO, executor_id: 4 });
    mockQueryResponse('from itens_atendimento i', { ...ITEM_RESTAURACAO_PAGO, procedimento_nome: 'Restauração', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    // Sem usuario_id → sem verificação de executor
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { status: 'executando' },
    }, ctx);

    expect(status).toBe(200);
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999', itemId: '1' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/999/itens/1', {
      method: 'PUT',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(404);
  });

  it('retorna 404 se item não existe', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    // item não encontrado

    const ctx = createRouteContext({ id: '4', itemId: '999' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/999', {
      method: 'PUT',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(404);
  });

  it('rejeita body vazio', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_RESTAURACAO_PAGO);

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nenhum campo para atualizar');
  });
});
