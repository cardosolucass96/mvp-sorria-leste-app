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
  PROC_CANAL,
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from itens_atendimento i', itensComJoin);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listItens, '/api/atendimentos/3/itens', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(itensComJoin);
  });

  it('retorna lista vazia se sem itens', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_TRIAGEM);
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(listItens, '/api/atendimentos/1/itens', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('ordena por created_at ASC', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_TRIAGEM);
    mockQueryResponse('from itens_atendimento i', []);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(listItens, '/api/atendimentos/1/itens', {}, ctx);

    const queries = getExecutedQueries();
    const itensQuery = queries.find(q => q.sql.includes('itens_atendimento'));
    expect(itensQuery!.sql).toContain('created_at ASC');
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_TRIAGEM);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, criado_por_id: 3 },
    }, ctx);

    expect(status).toBe(201);
  });

  it('adiciona item em em_execucao com status=pago e adicionado_em_execucao=1', async () => {
    setLastInsertId(12);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from procedimentos where id', PROC_CANAL);
    mockQueryResponse('select id, role from usuarios where id', { id: 4, role: 'executor' });
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '4' });
    const { status } = await callRoute(addItem, '/api/atendimentos/4/itens', {
      method: 'POST',
      body: { procedimento_id: 3, executor_id: 4, criado_por_id: 3 },
    }, ctx);

    expect(status).toBe(201);

    // Novo fluxo: item adicionado em execução entra com status=pago e flag adicionado_em_execucao=1;
    // a volta para aguardando_pagamento acontece via flag quando o atendimento for finalizado.
    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertQuery).toBeDefined();
    // Params: ..., valor, valor_original, valor_final, dentes, quantidade, observacoes, status, adicionado_em_execucao
    expect(insertQuery!.params[10]).toBe('pago');
    expect(insertQuery!.params[11]).toBe(1);
  });

  it('rejeita adicionar em aguardando_pagamento', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

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
    mockQueryResponse('from atendimentos where id', atFinalizado);

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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Procedimento é obrigatório');
  });

  it('rejeita se procedimento não existe ou inativo', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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

  it('aceita procedimento por_dente com faces e mantém 1 item por dente', async () => {
    setLastInsertId(19);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ itens: number[] }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: {
        procedimento_id: 2,
        valor: 400,
        dentes: JSON.stringify([
          { dente: '11', faces: [{ nome: 'V' }, { nome: 'D' }] },
          { dente: '21', faces: [{ nome: 'M' }] },
        ]),
      },
    }, ctx);

    expect(status).toBe(201);
    expect(data.itens).toHaveLength(2);

    const inserts = getExecutedQueries().filter(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params[4]).toBe(200);
    expect(inserts[1].params[4]).toBe(200);
  });

  it('rejeita procedimento com tem_face sem face em um dos dentes', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_RESTAURACAO);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ error: string }>(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: {
        procedimento_id: 2,
        valor: 200,
        dentes: JSON.stringify([{ dente: '11', faces: [] }]),
      },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Selecione ao menos uma face para cada dente');
  });

  it('salva valor_original = valor no INSERT (snapshot de orçamento)', async () => {
    setLastInsertId(18);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, valor: 250 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertQuery!.sql).toContain('valor_original');
    // valor = params[4], valor_original = params[5] (por_dente=0 branch)
    expect(insertQuery!.params[4]).toBe(250);
    expect(insertQuery!.params[5]).toBe(250); // valor_original = valor
  });

  it('salva campo dentes quando fornecido (procedimento não por_dente)', async () => {
    setLastInsertId(15);
    // PROC_LIMPEZA tem por_dente=0 → dentes armazenado como string diretamente
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, dentes: '["11","21"]', quantidade: 2 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    // Params: atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, valor_final, dentes, quantidade, ...
    expect(insertQuery!.params[7]).toBe('["11","21"]'); // dentes
    expect(insertQuery!.params[8]).toBe(2); // quantidade
  });

  it('quantidade default é 1', async () => {
    setLastInsertId(16);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1 },
    }, ctx);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    // Params: atendimento_id, procedimento_id, executor_id, criado_por_id, valor, valor_original, valor_final, dentes, quantidade, ...
    expect(insertQuery!.params[8]).toBe(1);
  });

  it('rejeita executor que não existe', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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

  it('aceita usuário com role efetiva de executor mesmo que a role primária seja outra', async () => {
    setLastInsertId(18);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from procedimentos where id', PROC_LIMPEZA);
    mockQueryResponse('select id, role from usuarios where id', { id: 6, role: 'avaliador' });
    mockQueryResponse('select role from usuario_roles where usuario_id', [{ role: 'executor' }]);
    mockQueryResponse('from itens_atendimento i', novoItem);

    const ctx = createRouteContext({ id: '2' });
    const { status } = await callRoute(addItem, '/api/atendimentos/2/itens', {
      method: 'POST',
      body: { procedimento_id: 1, executor_id: 6 },
    }, ctx);

    expect(status).toBe(201);
  });

  it('aceita admin como executor', async () => {
    setLastInsertId(17);
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select id from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);

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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_TRIAGEM);

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
    expect(data.error).toBe('item_id ou group_id é obrigatório');
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(removeItem, '/api/atendimentos/3/itens', {
      method: 'DELETE',
      searchParams: { item_id: '1' },
    }, ctx);

    expect(status).toBe(400);
  });

  it('rejeita remover em em_execucao', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);

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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
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

  it('atualiza valor do item em aguardando_pagamento', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_LIMPEZA_PENDENTE, procedimento_nome: 'Limpeza', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '3', itemId: '1' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/3/itens/1', {
      method: 'PUT',
      body: { valor: 120 },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(update!.sql).toContain('valor = ?');
  });

  it('atualiza status para executando', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
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

  it('ao voltar automaticamente para aguardando_pagamento limpa contexto de liberação da execução', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_CANAL_EXECUTANDO);
    mockQueryResponse('count(*) as total', { total: 2, concluidos: 2, pendentes_pagamento: 1 });
    mockQueryResponse('from itens_atendimento i', { ...ITEM_CANAL_EXECUTANDO, procedimento_nome: 'Canal', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '4', itemId: '3' });
    const { status, data } = await callRoute<{ atendimento_voltou_para_pagamento: boolean }>(
      updateItem,
      '/api/atendimentos/4/itens/3',
      {
        method: 'PUT',
        body: { status: 'concluido', usuario_id: 4 },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data.atendimento_voltou_para_pagamento).toBe(true);

    const queries = getExecutedQueries();
    const updateAtendimento = queries.find(q =>
      q.sql.includes("UPDATE atendimentos") && q.sql.includes("status = 'aguardando_pagamento'")
    );
    expect(updateAtendimento).toBeDefined();
    expect(updateAtendimento!.sql).toContain('liberado_por_id = NULL');
    expect(updateAtendimento!.sql).toContain('liberado_em = NULL');
  });

  it('bloqueia executor não designado de alterar status para executando', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', { ...ITEM_CANAL_EXECUTANDO, executor_id: 4 });

    const ctx = createRouteContext({ id: '4', itemId: '3' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/3', {
      method: 'PUT',
      body: { status: 'concluido', usuario_id: 2 },
    }, ctx);

    expect(status).toBe(403);
  });

  it('permite status sem restrição de executor se sem usuario_id', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
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
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    // item não encontrado

    const ctx = createRouteContext({ id: '4', itemId: '999' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/4/itens/999', {
      method: 'PUT',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(404);
  });

  it('rejeita body vazio', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_RESTAURACAO_PAGO);

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: {},
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Nenhum campo para atualizar');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // valor_original (desconto do atendente durante avaliação/aguardando_pagamento)
  // ───────────────────────────────────────────────────────────────────────────

  it('valor: permite editar durante avaliacao', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_LIMPEZA_PENDENTE, valor: 120, procedimento_nome: 'Limpeza', executor_nome: 'Dr. Carlos' });

    const ctx = createRouteContext({ id: '2', itemId: '1' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/2/itens/1', {
      method: 'PUT',
      body: { valor: 120 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('valor: rejeita edição em triagem', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_TRIAGEM);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);

    const ctx = createRouteContext({ id: '1', itemId: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/1/itens/1', {
      method: 'PUT',
      body: { valor: 100 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toContain('avaliação');
  });

  it('valor: rejeita edição em em_execucao', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_EM_EXECUCAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_RESTAURACAO_PAGO);

    const ctx = createRouteContext({ id: '4', itemId: '2' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/4/itens/2', {
      method: 'PUT',
      body: { valor: 500 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toContain('avaliação');
  });

  it('valor: rejeita valor menor que valor_pago', async () => {
    // Item com valor=400, valor_pago=400 → tentar reduzir para 300
    const itemParcial = { ...ITEM_LIMPEZA_PENDENTE, valor: 400, valor_pago: 400 };
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where id', itemParcial);

    const ctx = createRouteContext({ id: '3', itemId: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/3/itens/1', {
      method: 'PUT',
      body: { valor: 300 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toContain('já foi pago');
    expect(data.error).toContain('400.00');
  });

  it('valor: aceita valor igual a valor_pago', async () => {
    const itemParcial = { ...ITEM_LIMPEZA_PENDENTE, valor: 500, valor_pago: 400 };
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where id', itemParcial);
    mockQueryResponse('from itens_atendimento i', { ...itemParcial, valor: 400, procedimento_nome: 'Limpeza', executor_nome: null });

    const ctx = createRouteContext({ id: '3', itemId: '1' });
    const { status } = await callRoute(updateItem, '/api/atendimentos/3/itens/1', {
      method: 'PUT',
      body: { valor: 400 },
    }, ctx);

    expect(status).toBe(200);
  });

  it('valor: rejeita valor negativo', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);

    const ctx = createRouteContext({ id: '2', itemId: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/2/itens/1', {
      method: 'PUT',
      body: { valor: -10 },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Valor inválido');
  });

  it('valor: rejeita valor não numérico', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);

    const ctx = createRouteContext({ id: '2', itemId: '1' });
    const { status, data } = await callRoute<{ error: string }>(updateItem, '/api/atendimentos/2/itens/1', {
      method: 'PUT',
      body: { valor: 'abc' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Valor inválido');
  });

  it('valor: preserva valor_original quando edita item que já tem snapshot', async () => {
    // Item com valor_original=150 (já snapshotado) → editar valor para 120
    // Update NÃO deve incluir valor_original (fica igual)
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', ITEM_LIMPEZA_PENDENTE);
    mockQueryResponse('from itens_atendimento i', { ...ITEM_LIMPEZA_PENDENTE, valor: 120, procedimento_nome: 'Limpeza', executor_nome: null });

    const ctx = createRouteContext({ id: '2', itemId: '1' });
    await callRoute(updateItem, '/api/atendimentos/2/itens/1', {
      method: 'PUT',
      body: { valor: 120 },
    }, ctx);

    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE itens_atendimento') && q.sql.includes('valor = ?'));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('valor = ?');
    // NÃO deve conter valor_original no update (pois já existe snapshot)
    expect(update!.sql).not.toContain('valor_original = ?');
  });

  it('valor: backfill valor_original para itens legacy (valor_original NULL)', async () => {
    // Item legacy com valor_original=null → ao editar, deve snapshotar valor atual
    const itemLegacy = { ...ITEM_LIMPEZA_PENDENTE, valor: 150, valor_original: null };
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('select * from itens_atendimento where id', itemLegacy);
    mockQueryResponse('from itens_atendimento i', { ...itemLegacy, valor: 100, procedimento_nome: 'Limpeza', executor_nome: null });

    const ctx = createRouteContext({ id: '2', itemId: '1' });
    await callRoute(updateItem, '/api/atendimentos/2/itens/1', {
      method: 'PUT',
      body: { valor: 100 },
    }, ctx);

    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE itens_atendimento') && q.sql.includes('valor_original = ?'));
    expect(update).toBeDefined();
    // Params: [valor, valor_final, desconto_valor, desconto_motivo, desconto_aplicado_por_id, desconto_aplicado_em, valor_original, itemId]
    expect(update!.params[0]).toBe(100); // valor novo
    expect(update!.params[6]).toBe(150); // valor_original = valor atual antes da edição
  });
});
