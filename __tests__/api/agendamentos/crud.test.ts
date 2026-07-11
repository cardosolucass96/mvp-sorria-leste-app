/**
 * Testes E2E — /api/agendamentos
 *
 * Cobre: GET (listar, filtros, paginação), POST (criar procedimento e avaliação),
 *        GET [id], PUT [id] (reagendar, faltou, cancelar, trocar executor),
 *        POST [id]/chegou (avaliação e procedimento)
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
  CLIENTE_BASICO,
  CLIENTE_COMPLETO,
  PROC_LIMPEZA,
  USUARIO_EXECUTOR,
  USUARIO_ADMIN,
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

// Importa os handlers das rotas
import { GET as listAgendamentos, POST as createAgendamento } from '@/app/api/agendamentos/route';
import { GET as getAgendamento, PUT as updateAgendamento } from '@/app/api/agendamentos/[id]/route';
import { POST as chegouAgendamento } from '@/app/api/agendamentos/[id]/chegou/route';

// ─── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// ─── Dados auxiliares ──────────────────────────────────────────────

const AGENDAMENTO_PROCEDIMENTO = {
  id: 1,
  cliente_id: 1,
  atendimento_origem_id: 10,
  item_atendimento_origem_id: null,
  atendimento_sessao_id: null,
  procedimento_id: 1,
  executor_id: 4,
  tipo: 'procedimento',
  status: 'agendado',
  data_agendada: '2026-04-10T14:00',
  observacoes: null,
  motivo_cancelamento: null,
  reagendado_de_id: null,
  etapa_modelo_id: null,
  pago: 0,
  created_at: '2026-04-01 10:00:00',
  updated_at: '2026-04-01 10:00:00',
  cliente_nome: CLIENTE_BASICO.nome,
  cliente_telefone: CLIENTE_BASICO.telefone,
  procedimento_nome: PROC_LIMPEZA.nome,
  etapa_modelo_nome: null,
  executor_nome: USUARIO_EXECUTOR.nome,
  dias_desde_criacao: 3,
};

const AGENDAMENTO_AVALIACAO = {
  id: 2,
  cliente_id: 3,
  atendimento_origem_id: null,
  item_atendimento_origem_id: null,
  atendimento_sessao_id: null,
  procedimento_id: null,
  executor_id: null,
  tipo: 'avaliacao',
  status: 'agendado',
  data_agendada: '2026-04-12T09:00',
  observacoes: 'Primeira avaliação',
  motivo_cancelamento: null,
  reagendado_de_id: null,
  etapa_modelo_id: null,
  pago: 0,
  created_at: '2026-04-02 08:00:00',
  updated_at: '2026-04-02 08:00:00',
  cliente_nome: CLIENTE_COMPLETO.nome,
  cliente_telefone: CLIENTE_COMPLETO.telefone,
  procedimento_nome: 'Avaliação',
  etapa_modelo_nome: null,
  executor_nome: null,
  dias_desde_criacao: 1,
};

const AGENDAMENTO_PENDENTE = {
  ...AGENDAMENTO_PROCEDIMENTO,
  id: 3,
  status: 'pendente',
  data_agendada: null,
};

// =============================================================================
// GET /api/agendamentos  (listar)
// =============================================================================

describe('GET /api/agendamentos', () => {
  it('retorna lista paginada de agendamentos', async () => {
    // count must be registered BEFORE the select so it matches first
    mockQueryResponse('count(*) as total', [{ total: 2 }]);
    mockQueryResponse('limit ?', [AGENDAMENTO_PROCEDIMENTO, AGENDAMENTO_AVALIACAO]);

    const { status, data } = await callRoute<{ items: unknown[]; total: number; page: number; pages: number }>(
      listAgendamentos, '/api/agendamentos',
      { searchParams: { page: '1', limit: '50' } }
    );

    expect(status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
  });

  it('filtra por status', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_PROCEDIMENTO]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    await callRoute(listAgendamentos, '/api/agendamentos', {
      searchParams: { page: '1', status: 'agendado' },
    });

    const queries = getExecutedQueries();
    const selectQuery = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQuery?.sql).toContain('a.status IN');
  });

  it('filtra por busca de cliente', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_PROCEDIMENTO]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    await callRoute(listAgendamentos, '/api/agendamentos', {
      searchParams: { page: '1', busca: 'Lucas' },
    });

    const queries = getExecutedQueries();
    const selectQuery = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQuery?.sql).toContain('c.nome LIKE');
  });

  it('filtra por dentista responsável', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_PROCEDIMENTO]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    await callRoute(listAgendamentos, '/api/agendamentos', {
      searchParams: { page: '1', executor_id: '4' },
    });

    const queries = getExecutedQueries();
    const selectQuery = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQuery?.sql).toContain('a.executor_id = ?');
    expect(selectQuery?.params).toContain(4);
  });

  it('filtra por data_inicio e data_fim', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_PROCEDIMENTO]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    await callRoute(listAgendamentos, '/api/agendamentos', {
      searchParams: { page: '1', data_inicio: '2026-04-10', data_fim: '2026-04-10' },
    });

    const queries = getExecutedQueries();
    const selectQuery = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQuery?.sql).toContain('a.data_agendada >=');
    expect(selectQuery?.sql).toContain('a.data_agendada <=');
  });

  it('filtra agendamentos sem data', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_PENDENTE]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    await callRoute(listAgendamentos, '/api/agendamentos', {
      searchParams: { page: '1', sem_data: 'true' },
    });

    const queries = getExecutedQueries();
    const selectQuery = queries.find(q => q.sql.includes('FROM agendamentos'));
    expect(selectQuery?.sql).toContain('a.data_agendada IS NULL');
  });

  it('retorna agendamentos com procedimento_nome "Avaliação" para tipo avaliacao', async () => {
    mockQueryResponse('from agendamentos', [AGENDAMENTO_AVALIACAO]);
    mockQueryResponse('count(*) as total', [{ total: 1 }]);

    const { status, data } = await callRoute<{ items: typeof AGENDAMENTO_AVALIACAO[] }>(
      listAgendamentos, '/api/agendamentos',
      { searchParams: { page: '1' } }
    );

    expect(status).toBe(200);
    expect(data.items[0].procedimento_nome).toBe('Avaliação');
  });
});

// =============================================================================
// POST /api/agendamentos  (criar)
// =============================================================================

describe('POST /api/agendamentos', () => {
  it('cria agendamento de procedimento com data e hora', async () => {
    mockQueryResponse('select id from clientes', { id: 1 });
    mockQueryResponse('select id from procedimentos', { id: 1 });
    mockQueryResponse('select id from usuarios', { id: 4 });
    setLastInsertId(10);
    mockQueryResponse('where a.id = ?', {
      ...AGENDAMENTO_PROCEDIMENTO,
      id: 10,
    });

    const { status, data } = await callRoute<typeof AGENDAMENTO_PROCEDIMENTO>(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: {
          cliente_id: 1,
          procedimento_id: 1,
          executor_id: 4,
          data_agendada: '2026-04-10T14:00',
        },
      }
    );

    expect(status).toBe(201);
    expect(data.id).toBe(10);
    const queries = getExecutedQueries();
    const insert = queries.find(q => q.sql.includes('INSERT INTO agendamentos'));
    expect(insert).toBeDefined();
    expect(insert!.params).toContain('agendado'); // status quando tem data
  });

  it('cria agendamento de avaliação sem procedimento_id', async () => {
    mockQueryResponse('select id from clientes', { id: 3 });
    setLastInsertId(20);
    mockQueryResponse('where a.id = ?', {
      ...AGENDAMENTO_AVALIACAO,
      id: 20,
    });

    const { status, data } = await callRoute<typeof AGENDAMENTO_AVALIACAO>(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: {
          cliente_id: 3,
          tipo: 'avaliacao',
          data_agendada: '2026-04-12T09:00',
          observacoes: 'Primeira avaliação',
        },
      }
    );

    expect(status).toBe(201);
    expect(data.procedimento_nome).toBe('Avaliação');
    const queries = getExecutedQueries();
    const insert = queries.find(q => q.sql.includes('INSERT INTO agendamentos'));
    expect(insert).toBeDefined();
    expect(insert!.params).toContain('avaliacao'); // tipo
  });

  it('cria agendamento pendente quando sem data', async () => {
    mockQueryResponse('select id from clientes', { id: 1 });
    mockQueryResponse('select id from procedimentos', { id: 1 });
    setLastInsertId(30);
    mockQueryResponse('where a.id = ?', {
      ...AGENDAMENTO_PENDENTE,
      id: 30,
      status: 'pendente',
    });

    const { status } = await callRoute(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: {
          cliente_id: 1,
          procedimento_id: 1,
        },
      }
    );

    expect(status).toBe(201);
    const queries = getExecutedQueries();
    const insert = queries.find(q => q.sql.includes('INSERT INTO agendamentos'));
    expect(insert!.params).toContain('pendente'); // sem data = pendente
  });

  it('rejeita agendamento com data no passado', async () => {
    const { status, data } = await callRoute<{ error: string }>(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: {
          cliente_id: 1,
          tipo: 'avaliacao',
          data_agendada: '2020-01-01T10:00',
        },
      }
    );

    expect(status).toBe(400);
    expect(data.error).toContain('passado');
  });

  it('rejeita procedimento sem cliente_id', async () => {
    const { status } = await callRoute(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { procedimento_id: 1 },
      }
    );

    expect(status).toBe(400);
  });

  it('rejeita procedimento com tipo diferente de avaliacao sem procedimento_id', async () => {
    mockQueryResponse('select id from clientes', { id: 1 });

    const { status } = await callRoute(
      createAgendamento, '/api/agendamentos', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { cliente_id: 1 },
      }
    );

    expect(status).toBe(400);
  });
});

// =============================================================================
// GET /api/agendamentos/[id]  (detalhe)
// =============================================================================

describe('GET /api/agendamentos/[id]', () => {
  it('retorna agendamento por ID', async () => {
    mockQueryResponse('where a.id = ?', AGENDAMENTO_PROCEDIMENTO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<typeof AGENDAMENTO_PROCEDIMENTO>(
      getAgendamento, '/api/agendamentos/1', {
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(200);
    expect(data.id).toBe(1);
    expect(data.cliente_nome).toBe(CLIENTE_BASICO.nome);
    expect(data.procedimento_nome).toBe(PROC_LIMPEZA.nome);
  });

  it('retorna 404 para agendamento inexistente', async () => {
    // Sem mock = null
    const ctx = createRouteContext({ id: '999' });
    const { status } = await callRoute(
      getAgendamento, '/api/agendamentos/999', {
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(404);
  });
});

// =============================================================================
// PUT /api/agendamentos/[id]  (atualizar)
// =============================================================================

describe('PUT /api/agendamentos/[id]', () => {
  it('reagenda direto com nova data (sem marcar faltou)', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { data_agendada: '2026-04-15T10:00' },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update).toBeDefined();
    expect(update!.sql).toContain('data_agendada');
    expect(update!.sql).toContain("status = 'agendado'");
  });

  it('reagenda agendamento pendente adicionando data', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PENDENTE,
      status: 'pendente',
    });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/3', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { data_agendada: '2026-04-20T11:00' },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update!.params).toContain('2026-04-20T11:00');
  });

  it('marca como faltou', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { status: 'faltou' },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update!.sql).toContain("status = 'faltou'");
  });

  it('não permite faltou de agendamento já realizado', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'realizado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { status: 'faltou' },
      }, ctx
    );

    expect(status).toBe(400);
  });

  it('cancela com motivo', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { status: 'cancelado', motivo_cancelamento: 'Paciente desistiu' },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update!.sql).toContain("status = 'cancelado'");
    expect(update!.sql).toContain('motivo_cancelamento');
    expect(update!.params).toContain('Paciente desistiu');
  });

  it('rejeita cancelamento sem motivo', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { status: 'cancelado' },
      }, ctx
    );

    expect(status).toBe(400);
  });

  it('troca executor', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { executor_id: USUARIO_ADMIN.id },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update!.sql).toContain('executor_id');
    expect(update!.params).toContain(USUARIO_ADMIN.id);
  });

  it('remove executor (null)', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      updateAgendamento, '/api/agendamentos/1', {
        method: 'PUT',
        headers: { Authorization: 'Bearer test.jwt.token' },
        body: { executor_id: null },
      }, ctx
    );

    expect(status).toBe(200);
    const queries = getExecutedQueries();
    const update = queries.find(q => q.sql.includes('UPDATE agendamentos'));
    expect(update!.sql).toContain('executor_id');
    expect(update!.params).toContain(null);
  });
});

// =============================================================================
// POST /api/agendamentos/[id]/chegou
// =============================================================================

describe('POST /api/agendamentos/[id]/chegou', () => {
  it('cria atendimento tipo sessao para agendamento de procedimento', async () => {
    // Mock: buscar agendamento (queryOne 'SELECT * FROM agendamentos WHERE id = ?')
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });
    // Mock: sem atendimento aberto hoje (queryOne 'SELECT id FROM atendimentos WHERE ...')
    mockQueryResponse("status not in ('finalizado'", []);
    // Mock: agendamentos do cliente hoje (query 'SELECT * FROM agendamentos WHERE cliente_id = ? AND status IN ...')
    mockQueryResponse("status in ('pendente', 'agendado')", [
      { ...AGENDAMENTO_PROCEDIMENTO, status: 'agendado' },
    ]);
    // Mock: procedimento
    mockQueryResponse('select id, valor from procedimentos', { id: 1, valor: 150 });
    // Mock: insert atendimento
    setLastInsertId(100);
    // Mock: retorno do novo atendimento
    mockQueryResponse('inner join clientes c', {
      id: 100,
      cliente_id: 1,
      status: 'aguardando_pagamento',
      tipo: 'sessao',
      cliente_nome: CLIENTE_BASICO.nome,
      cliente_cpf: CLIENTE_BASICO.cpf,
      cliente_telefone: CLIENTE_BASICO.telefone,
    });

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ id: number; status: string; tipo: string; agendamentos_agrupados: number }>(
      chegouAgendamento, '/api/agendamentos/1/chegou', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(201);
    expect(data.id).toBe(100);
    expect(data.agendamentos_agrupados).toBeGreaterThanOrEqual(1);

    const queries = getExecutedQueries();
    const insertAtendimento = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertAtendimento).toBeDefined();

    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem).toBeDefined();

    const updateAg = queries.find(q => q.sql.includes("UPDATE agendamentos SET status = 'realizado'"));
    expect(updateAg).toBeDefined();
  });

  it('cria atendimento normal em triagem para avaliação', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_AVALIACAO,
      status: 'agendado',
    });
    // Mock: sem atendimento aberto hoje
    mockQueryResponse("status not in ('finalizado'", []);
    // Mock: agendamentos do cliente hoje
    mockQueryResponse("status in ('pendente', 'agendado')", [
      { ...AGENDAMENTO_AVALIACAO, status: 'agendado', tipo: 'avaliacao', procedimento_id: null },
    ]);
    setLastInsertId(200);
    mockQueryResponse('inner join clientes c', {
      id: 200,
      cliente_id: 3,
      status: 'triagem',
      tipo: 'normal',
      cliente_nome: CLIENTE_COMPLETO.nome,
      cliente_cpf: CLIENTE_COMPLETO.cpf,
      cliente_telefone: CLIENTE_COMPLETO.telefone,
    });

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ id: number; status: string; tipo: string }>(
      chegouAgendamento, '/api/agendamentos/2/chegou', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(201);
    expect(data.id).toBe(200);

    const queries = getExecutedQueries();
    const insertAtendimento = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertAtendimento).toBeDefined();
    expect(insertAtendimento!.params).toContain('triagem'); // sem avaliador = triagem
    expect(insertAtendimento!.params).toContain(null); // avaliador_id = null

    // Não deve criar itens_atendimento para avaliação
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem).toBeUndefined();
  });

  it('bloqueia quando já tem atendimento aberto hoje', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'agendado',
    });
    // Mock: atendimento aberto existe
    mockQueryResponse('select id from atendimentos', { id: 50 });

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string; atendimento_existente_id: number }>(
      chegouAgendamento, '/api/agendamentos/1/chegou', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    if (status === 409) {
      expect(data.atendimento_existente_id).toBe(50);
    } else {
      expect(status).toBe(409);
    }
  });

  it('bloqueia agendamento já realizado', async () => {
    mockQueryResponse('select * from agendamentos where id', {
      ...AGENDAMENTO_PROCEDIMENTO,
      status: 'realizado',
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      chegouAgendamento, '/api/agendamentos/1/chegou', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(400);
  });

  it('marca agendamento pago como item pago no atendimento', async () => {
    const agPago = { ...AGENDAMENTO_PROCEDIMENTO, status: 'agendado', pago: 1 };
    mockQueryResponse('select * from agendamentos where id', agPago);
    mockQueryResponse("status not in ('finalizado'", []);
    mockQueryResponse("status in ('pendente', 'agendado')", [agPago]);
    mockQueryResponse('select id, valor from procedimentos', { id: 1, valor: 150 });
    setLastInsertId(300);
    mockQueryResponse('inner join clientes c', {
      id: 300,
      cliente_id: 1,
      status: 'aguardando_pagamento',
      tipo: 'sessao',
      cliente_nome: CLIENTE_BASICO.nome,
      cliente_cpf: CLIENTE_BASICO.cpf,
      cliente_telefone: CLIENTE_BASICO.telefone,
    });

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(
      chegouAgendamento, '/api/agendamentos/1/chegou', {
        method: 'POST',
        headers: { Authorization: 'Bearer test.jwt.token' },
      }, ctx
    );

    expect(status).toBe(201);
    const queries = getExecutedQueries();
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem).toBeDefined();
    // valor_pago deve ser = valor (150) e status = 'pago'
    expect(insertItem!.params).toContain(150); // valor_pago
    expect(insertItem!.params).toContain('pago'); // status
  });
});
