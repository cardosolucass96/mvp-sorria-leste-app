/**
 * Sprint 5 — Testes CRUD /api/atendimentos
 *
 * Cobre: GET lista (filtros, busca), POST normal (triagem),
 *        GET [id] detalhe com itens e totais
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
  CLIENTE_BASICO,
  USUARIO_AVALIADOR,
  ITEM_LIMPEZA_PENDENTE,
  ITEM_RESTAURACAO_PAGO,
} from '../../helpers/seed';

import { GET as listAtendimentos, POST as createAtendimento } from '@/app/api/atendimentos/route';
import { GET as getAtendimento } from '@/app/api/atendimentos/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/atendimentos  (listar)
// =============================================================================

describe('GET /api/atendimentos', () => {
  const atendimentoComCliente = {
    ...ATENDIMENTO_TRIAGEM,
    cliente_nome: 'Lucas Cardoso',
    cliente_cpf: '52998224725',
    cliente_telefone: '11999887766',
    avaliador_nome: 'Dr. João Avaliador',
  };

  it('retorna lista de atendimentos com dados do cliente', async () => {
    mockQueryResponse('from atendimentos a', [atendimentoComCliente]);

    const { status, data } = await callRoute(listAtendimentos, '/api/atendimentos');

    expect(status).toBe(200);
    expect(data).toEqual([atendimentoComCliente]);
  });

  it('filtra por status', async () => {
    mockQueryResponse('from atendimentos a', [atendimentoComCliente]);

    await callRoute(listAtendimentos, '/api/atendimentos', {
      searchParams: { status: 'triagem' },
    });

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('a.status = ?');
    expect(queries[0].params).toContain('triagem');
  });

  it('filtra por cliente_id', async () => {
    mockQueryResponse('from atendimentos a', [atendimentoComCliente]);

    await callRoute(listAtendimentos, '/api/atendimentos', {
      searchParams: { cliente_id: '1' },
    });

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('a.cliente_id = ?');
    expect(queries[0].params).toContain(1);
  });

  it('busca por nome ou CPF do cliente', async () => {
    mockQueryResponse('from atendimentos a', [atendimentoComCliente]);

    await callRoute(listAtendimentos, '/api/atendimentos', {
      searchParams: { busca: 'Lucas' },
    });

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('c.nome LIKE ?');
    expect(queries[0].sql).toContain('c.cpf LIKE ?');
    expect(queries[0].params).toContain('%Lucas%');
  });

  it('combina múltiplos filtros', async () => {
    mockQueryResponse('from atendimentos a', []);

    await callRoute(listAtendimentos, '/api/atendimentos', {
      searchParams: { status: 'avaliacao', busca: 'Ana' },
    });

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('a.status = ?');
    expect(queries[0].sql).toContain('c.nome LIKE ?');
    expect(queries[0].sql).toContain('AND');
  });

  it('ordena por created_at DESC (mais recentes primeiro)', async () => {
    mockQueryResponse('from atendimentos a', []);

    await callRoute(listAtendimentos, '/api/atendimentos');

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY a.created_at DESC');
  });

  it('retorna lista vazia', async () => {
    mockQueryResponse('from atendimentos a', []);

    const { status, data } = await callRoute(listAtendimentos, '/api/atendimentos');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });
});

// =============================================================================
// POST /api/atendimentos  (criar — fluxo normal)
// =============================================================================

describe('POST /api/atendimentos (fluxo normal)', () => {
  const novoAtendimento = {
    ...ATENDIMENTO_TRIAGEM,
    id: 10,
    cliente_nome: 'Lucas Cardoso',
    cliente_cpf: '52998224725',
    cliente_telefone: '11999887766',
    avaliador_nome: 'Dr. João Avaliador',
  };

  it('cria atendimento com status triagem', async () => {
    setLastInsertId(10);
    // Cliente existe
    mockQueryResponse('select id from clientes where id', { id: 1 });
    // Sem atendimento aberto
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    // Avaliador válido
    mockQueryResponse('select id, role from usuarios where id', { id: 3, role: 'avaliador' });
    // Retorno pós-INSERT
    mockQueryResponse('from atendimentos a', novoAtendimento);

    const { status, data } = await callRoute<Record<string, unknown>>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, avaliador_id: 3 },
    });

    expect(status).toBe(201);
    expect(data.cliente_nome).toBe('Lucas Cardoso');

    // Verifica INSERT com status triagem
    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery!.sql).toContain("'triagem'");
  });

  it('cria atendimento sem avaliador', async () => {
    setLastInsertId(11);
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('from atendimentos a', novoAtendimento);

    const { status } = await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1 },
    });

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    // avaliador_id deve ser null
    expect(insertQuery!.params[1]).toBeNull();
  });

  it('rejeita se cliente_id não enviado', async () => {
    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: {},
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Cliente é obrigatório');
  });

  it('rejeita se cliente não existe', async () => {
    // queryOne retorna null (não mockado)
    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 999 },
    });

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });

  it('bloqueia se cliente já tem atendimento aberto', async () => {
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 1 });

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Cliente já possui atendimento em aberto');
  });

  it('rejeita avaliador que não existe', async () => {
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    // Avaliador não encontrado (não mockado)

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, avaliador_id: 999 },
    });

    expect(status).toBe(404);
    expect(data.error).toBe('Avaliador não encontrado');
  });

  it('rejeita se usuário selecionado não é avaliador', async () => {
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('select id, role from usuarios where id', { id: 4, role: 'executor' });

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, avaliador_id: 4 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Usuário selecionado não é avaliador');
  });

  it('aceita admin como avaliador', async () => {
    setLastInsertId(12);
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('select id, role from usuarios where id', { id: 1, role: 'admin' });
    mockQueryResponse('from atendimentos a', novoAtendimento);

    const { status } = await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, avaliador_id: 1 },
    });

    expect(status).toBe(201);
  });
});

// =============================================================================
// GET /api/atendimentos/[id]  (detalhe com itens e totais)
// =============================================================================

describe('GET /api/atendimentos/[id]', () => {
  const atendimentoDetalhe = {
    ...ATENDIMENTO_AGUARDANDO_PGTO,
    cliente_nome: 'Roberto Souza',
    cliente_cpf: '11144477735',
    cliente_telefone: '21988776655',
    cliente_email: 'roberto@email.com',
    avaliador_nome: 'Dr. João Avaliador',
    liberado_por_nome: null,
  };

  const itensComJoin = [
    { ...ITEM_LIMPEZA_PENDENTE, procedimento_nome: 'Limpeza Dental', executor_nome: 'Dr. Carlos Executor', criado_por_nome: 'Dr. João Avaliador' },
  ];

  it('retorna atendimento com itens e totais', async () => {
    // Atendimento
    mockQueryResponse('from atendimentos a', atendimentoDetalhe);
    // Itens
    mockQueryResponse('from itens_atendimento i', itensComJoin);
    // Total valor
    mockQueryResponse('select sum(valor) as total from itens_atendimento', { total: 150 });
    // Total pago
    mockQueryResponse('select sum(valor_pago) as total from itens_atendimento', { total: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/3', {}, ctx);

    expect(status).toBe(200);
    expect(data.id).toBe(3);
    expect(data.cliente_nome).toBe('Roberto Souza');
    expect(data.itens).toEqual(itensComJoin);
    expect(data.total).toBe(150);
    expect(data.total_pago).toBe(0);
  });

  it('retorna 404 se atendimento não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(getAtendimento, '/api/atendimentos/999', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Atendimento não encontrado');
  });

  it('retorna totais como 0 quando sem itens', async () => {
    mockQueryResponse('from atendimentos a', atendimentoDetalhe);
    mockQueryResponse('from itens_atendimento i', []);
    mockQueryResponse('select sum(valor) as total from itens_atendimento', { total: null });
    mockQueryResponse('select sum(valor_pago) as total from itens_atendimento', { total: null });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/3', {}, ctx);

    expect(status).toBe(200);
    expect(data.total).toBe(0);
    expect(data.total_pago).toBe(0);
    expect(data.itens).toEqual([]);
  });

  it('calcula totais corretamente com múltiplos itens', async () => {
    mockQueryResponse('from atendimentos a', {
      ...ATENDIMENTO_EM_EXECUCAO,
      cliente_nome: 'Lucas Cardoso',
      cliente_cpf: '52998224725',
      cliente_telefone: '11999887766',
      cliente_email: 'lucas@email.com',
      avaliador_nome: 'Dr. João Avaliador',
      liberado_por_nome: 'Admin Sistema',
    });
    mockQueryResponse('from itens_atendimento i', [
      { ...ITEM_RESTAURACAO_PAGO, procedimento_nome: 'Restauração', executor_nome: 'Dr. Carlos Executor', criado_por_nome: 'Dr. João Avaliador' },
    ]);
    mockQueryResponse('select sum(valor) as total from itens_atendimento', { total: 1200 });
    mockQueryResponse('select sum(valor_pago) as total from itens_atendimento', { total: 800 });

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/4', {}, ctx);

    expect(status).toBe(200);
    expect(data.total).toBe(1200);
    expect(data.total_pago).toBe(800);
  });
});
