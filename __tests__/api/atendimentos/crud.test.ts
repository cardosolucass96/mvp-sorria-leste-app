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
  ITEM_LIMPEZA_PENDENTE,
  ITEM_RESTAURACAO_PAGO,
} from '../../helpers/seed';

// Mock JWT para bypass de autenticação nos testes
jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1,
    email: 'admin@test.com',
    role: 'admin',
    nome: 'Admin Teste',
    unidade_ids: [1, 2],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { GET as listAtendimentos, POST as createAtendimento } from '@/app/api/atendimentos/route';
import { GET as getAtendimento, DELETE as archiveAtendimento } from '@/app/api/atendimentos/[id]/route';

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

  it('faz fallback para quem está criando quando não há avaliador primário', async () => {
    setLastInsertId(11);
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('from usuarios u', []);
    mockQueryResponse('from atendimentos a', { ...novoAtendimento, id: 11, avaliador_id: 1, avaliador_nome: 'Admin Teste' });

    const { status, data } = await callRoute<Record<string, unknown>>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1 },
    });

    expect(status).toBe(201);
    expect(data.avaliador_id).toBe(1);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertQuery!.params[1]).toBe(1);
  });

  it('usa o único avaliador primário da unidade como padrão', async () => {
    setLastInsertId(12);
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('from usuarios u', [{ id: 45 }]);
    mockQueryResponse('from atendimentos a', { ...novoAtendimento, id: 12, avaliador_id: 45, avaliador_nome: 'Eduardo' });

    const { status, data } = await callRoute<Record<string, unknown>>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1 },
    });

    expect(status).toBe(201);
    expect(data.avaliador_id).toBe(45);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertQuery!.params[1]).toBe(45);
  });

  it('faz fallback para quem está criando quando não há avaliador primário único', async () => {
    setLastInsertId(13);
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as count from atendimentos', { count: 0 });
    mockQueryResponse('from usuarios u', [{ id: 45 }, { id: 46 }]);
    mockQueryResponse('from atendimentos a', { ...novoAtendimento, id: 13, avaliador_id: 1, avaliador_nome: 'Admin Teste' });

    const { status, data } = await callRoute<Record<string, unknown>>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1 },
    });

    expect(status).toBe(201);
    expect(data.avaliador_id).toBe(1);

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertQuery!.params[1]).toBe(1);
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

  const itemBase = { ...ITEM_LIMPEZA_PENDENTE, procedimento_nome: 'Limpeza Dental', executor_nome: 'Dr. Carlos Executor', criado_por_nome: 'Dr. João Avaliador' };
  it('retorna atendimento com itens e totais', async () => {
    // Atendimento
    mockQueryResponse('from atendimentos a', atendimentoDetalhe);
    // Itens
    mockQueryResponse('from itens_atendimento i', [itemBase]);
    // Total valor
    mockQueryResponse('select sum(coalesce(valor_final, valor)) as total from itens_atendimento', { total: 150 });
    // Total pago = soma de valor_pago dos itens
    mockQueryResponse('coalesce(sum(valor_pago), 0) as total from itens_atendimento', { total: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/3', {}, ctx);

    expect(status).toBe(200);
    expect(data.id).toBe(3);
    expect(data.cliente_nome).toBe('Roberto Souza');
    expect(data.itens).toEqual([
      expect.objectContaining({
        ...itemBase,
        etapas: [],
        progresso_etapas: null,
        valor_final: 150,
        saldo: 150,
        financeiro_status: 'nao_pago',
        destino_status: null,
        destino_data_agendada: null,
        destino_executor_id: null,
      }),
    ]);
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
    mockQueryResponse('select sum(coalesce(valor_final, valor)) as total from itens_atendimento', { total: null });
    mockQueryResponse('coalesce(sum(valor_pago), 0) as total from itens_atendimento', { total: 0 });

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
    mockQueryResponse('select sum(coalesce(valor_final, valor)) as total from itens_atendimento', { total: 1200 });
    mockQueryResponse('coalesce(sum(valor_pago), 0) as total from itens_atendimento', { total: 800 });

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/4', {}, ctx);

    expect(status).toBe(200);
    expect(data.total).toBe(1200);
    expect(data.total_pago).toBe(800);
  });

  it('usa valor_pago dos itens mesmo sem pagamento registrado no atendimento', async () => {
    mockQueryResponse('from atendimentos a', {
      ...ATENDIMENTO_AGUARDANDO_PGTO,
      cliente_nome: 'Roberto Souza',
      cliente_cpf: '11144477735',
      cliente_telefone: '21988776655',
      cliente_email: 'roberto@email.com',
      avaliador_nome: 'Dr. João Avaliador',
      liberado_por_nome: null,
    });
    mockQueryResponse('from itens_atendimento i', [
      { ...ITEM_RESTAURACAO_PAGO, atendimento_id: 3, procedimento_nome: 'Restauração', executor_nome: 'Dr. Carlos Executor', criado_por_nome: 'Dr. João Avaliador' },
    ]);
    mockQueryResponse('select sum(coalesce(valor_final, valor)) as total from itens_atendimento', { total: 400 });
    mockQueryResponse('coalesce(sum(valor_pago), 0) as total from itens_atendimento', { total: 400 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<Record<string, unknown>>(getAtendimento, '/api/atendimentos/3', {}, ctx);

    expect(status).toBe(200);
    expect(data.total).toBe(400);
    expect(data.total_pago).toBe(400);
  });
});

// =============================================================================
// DELETE /api/atendimentos/[id]  (arquivar/desconsiderar)
// =============================================================================

describe('DELETE /api/atendimentos/[id]', () => {
  it('arquiva atendimento ativo em vez de apagar fisicamente', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AVALIACAO);
    mockQueryResponse('count(*) as count from itens_atendimento where atendimento_id', { count: 0 });
    mockQueryResponse('count(*) as count from pagamentos where atendimento_id', { count: 0 });
    mockQueryResponse("and status in ('pendente', 'agendado')", { count: 0 });

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<Record<string, unknown>>(archiveAtendimento, '/api/atendimentos/2', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.archived).toBe(true);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE atendimentos'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.sql).toContain("status = 'encerrado'");
    expect(updateQuery!.sql).toContain("motivo_saida = COALESCE(motivo_saida, 'sem_tratamento')");
    expect(updateQuery!.sql).toContain("observacoes_encerramento = COALESCE");
    expect(queries.some(q => q.sql.includes('DELETE FROM atendimentos'))).toBe(false);
  });

  it('bloqueia arquivamento quando o atendimento já tem procedimento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('count(*) as count from itens_atendimento where atendimento_id', { count: 1 });
    mockQueryResponse('count(*) as count from pagamentos where atendimento_id', { count: 0 });
    mockQueryResponse("and status in ('pendente', 'agendado')", { count: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(archiveAtendimento, '/api/atendimentos/3', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(409);
    expect(data.error).toContain('Use o fluxo normal de continuação/finalização');
  });

  it('bloqueia arquivamento quando já existe pagamento ativo', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('count(*) as count from itens_atendimento where atendimento_id', { count: 0 });
    mockQueryResponse('count(*) as count from pagamentos where atendimento_id', { count: 1 });
    mockQueryResponse("and status in ('pendente', 'agendado')", { count: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(archiveAtendimento, '/api/atendimentos/3', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(409);
  });

  it('bloqueia arquivamento quando há continuação ativa', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('count(*) as count from itens_atendimento where atendimento_id', { count: 0 });
    mockQueryResponse('count(*) as count from pagamentos where atendimento_id', { count: 0 });
    mockQueryResponse("and status in ('pendente', 'agendado')", { count: 1 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(archiveAtendimento, '/api/atendimentos/3', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(409);
  });

  it('rejeita quando o atendimento já está encerrado', async () => {
    mockQueryResponse('select * from atendimentos where id', { ...ATENDIMENTO_EM_EXECUCAO, status: 'encerrado' });

    const ctx = createRouteContext({ id: '4' });
    const { status, data } = await callRoute<{ error: string }>(archiveAtendimento, '/api/atendimentos/4', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Atendimento já está encerrado/arquivado');
  });
});
