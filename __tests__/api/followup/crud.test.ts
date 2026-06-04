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

import { GET as listFollowups, POST as createFollowup } from '@/app/api/followup/route';
import { PUT as updateFollowup, DELETE as deleteFollowup } from '@/app/api/followup/[id]/route';
import { POST as concludeFollowup } from '@/app/api/followup/[id]/concluir/route';

const { verifyToken } = jest.requireMock('@/lib/auth/jwt') as {
  verifyToken: jest.Mock;
};

function makePayload(role: string, overrides: Record<string, unknown> = {}) {
  return {
    sub: 2,
    email: `${role}@test.com`,
    role,
    roles: [role],
    nome: `${role} Teste`,
    unidade_ids: [1, 2],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
    ...overrides,
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatSqliteDate(date: Date): string {
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ');
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 10,
    cliente_id: 1,
    unidade_id: 1,
    responsavel_usuario_id: 2,
    criado_por_id: 2,
    concluida_por_id: null,
    excluida_por_id: null,
    tipo: 'retorno',
    titulo: 'Ligar para cliente',
    descricao: 'Cliente pediu retorno à tarde',
    status: 'aberta',
    vencimento_em: formatSqliteDate(addMinutes(now, 90)),
    nota_conclusao: null,
    concluida_em: null,
    excluida_em: null,
    created_at: formatSqliteDate(addDays(now, -1)),
    updated_at: formatSqliteDate(addDays(now, -1)),
    cliente_nome: 'Maria Silva',
    cliente_telefone: '85999990000',
    responsavel_usuario_nome: 'Recepção 1',
    criado_por_nome: 'Recepção 1',
    concluida_por_nome: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  verifyToken.mockResolvedValue(makePayload('atendente'));
});

afterEach(() => {
  teardownCloudflareContextMock();
  jest.clearAllMocks();
});

describe('GET /api/followup', () => {
  it('retorna lista com summary e aplica filtros principais', async () => {
    const now = new Date();
    const overdueTask = makeTask({
      id: 1,
      tipo: 'orcamento',
      titulo: 'Cobrar resposta do orçamento',
      vencimento_em: formatSqliteDate(addMinutes(now, -120)),
    });
    const todayTask = makeTask({
      id: 2,
      tipo: 'retorno',
      titulo: 'Confirmar retorno do paciente',
      vencimento_em: formatSqliteDate(addMinutes(now, 90)),
    });
    const doneToday = makeTask({
      id: 3,
      status: 'concluida',
      titulo: 'Retorno já realizado',
      nota_conclusao: 'Contato feito com sucesso',
      concluida_em: formatSqliteDate(addMinutes(now, -15)),
      concluida_por_id: 2,
      concluida_por_nome: 'Recepção 1',
      vencimento_em: formatSqliteDate(addDays(now, -1)),
    });

    mockQueryResponse('from followup_tarefas f', [overdueTask, todayTask, doneToday]);

    const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const { status, data } = await callRoute<{ items: typeof overdueTask[]; summary: Record<string, number> }>(
      listFollowups,
      '/api/followup',
      {
        searchParams: {
          status: 'aberta,concluida',
          tipo: 'retorno',
          busca: 'cliente',
          mes: month,
          dia: day,
        },
        headers: { 'X-Unidade-Id': '2' },
      }
    );

    expect(status).toBe(200);
    expect(data.items).toHaveLength(3);
    expect(data.summary).toEqual({
      abertas: 2,
      atrasadas: 1,
      vencem_hoje: 1,
      concluidas_hoje: 1,
    });

    const selectQuery = getExecutedQueries().find((entry) => entry.sql.includes('FROM followup_tarefas f'));
    expect(selectQuery?.sql).toContain('f.unidade_id = ?');
    expect(selectQuery?.sql).toContain('f.excluida_em IS NULL');
    expect(selectQuery?.sql).toContain('f.status IN');
    expect(selectQuery?.sql).toContain('f.tipo = ?');
    expect(selectQuery?.sql).toContain('c.nome LIKE ?');
    expect(selectQuery?.sql).toContain('substr(f.vencimento_em, 1, 7) = ?');
    expect(selectQuery?.sql).toContain('substr(f.vencimento_em, 1, 10) = ?');
    expect(selectQuery?.params[0]).toBe(2);
  });

  it('permite leitura para admin', async () => {
    verifyToken.mockResolvedValueOnce(makePayload('admin'));
    mockQueryResponse('from followup_tarefas f', []);

    const { status } = await callRoute(listFollowups, '/api/followup');

    expect(status).toBe(200);
  });

  it('bloqueia perfis fora de admin e atendente', async () => {
    verifyToken.mockResolvedValueOnce(makePayload('executor'));

    const { status, data } = await callRoute<{ error: string }>(listFollowups, '/api/followup');

    expect(status).toBe(403);
    expect(data.error).toBe('Acesso não autorizado para este perfil');
  });
});

describe('POST /api/followup', () => {
  it('cria tarefa válida para atendente', async () => {
    const createdTask = makeTask({
      id: 21,
      tipo: 'cobranca',
      titulo: 'Cobrar retorno',
      vencimento_em: '2026-05-30 14:30:00',
    });

    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as n', { n: 1 });
    setLastInsertId(21);
    mockQueryResponse('from followup_tarefas f', createdTask);

    const { status, data } = await callRoute<typeof createdTask>(createFollowup, '/api/followup', {
      method: 'POST',
      headers: { 'X-Unidade-Id': '1' },
      body: {
        cliente_id: 1,
        responsavel_usuario_id: 2,
        tipo: 'cobranca',
        titulo: 'Cobrar retorno',
        descricao: 'Paciente sem resposta no WhatsApp',
        vencimento_em: '2026-05-30T14:30',
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(21);

    const insertQuery = getExecutedQueries().find((entry) => entry.sql.includes('INSERT INTO followup_tarefas'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.params).toEqual([
      1,
      1,
      2,
      2,
      'cobranca',
      'Cobrar retorno',
      'Paciente sem resposta no WhatsApp',
      '2026-05-30 14:30:00',
    ]);
  });

  it('rejeita responsável que não seja atendente ativo da unidade', async () => {
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as n', { n: 0 });

    const { status, data } = await callRoute<{ error: string }>(createFollowup, '/api/followup', {
      method: 'POST',
      body: {
        cliente_id: 1,
        responsavel_usuario_id: 7,
        tipo: 'retorno',
        titulo: 'Retornar ligação',
        vencimento_em: '2026-05-30T10:00',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Responsável deve ser um atendente ativo da unidade atual');
  });

  it('permite admin criar tarefa para um atendente da unidade', async () => {
    verifyToken.mockResolvedValueOnce(makePayload('admin', { sub: 9 }));
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as n', { n: 1 });
    setLastInsertId(22);
    mockQueryResponse('from followup_tarefas f', makeTask({
      id: 22,
      criado_por_id: 9,
      criado_por_nome: 'admin Teste',
    }));

    const { status, data } = await callRoute<ReturnType<typeof makeTask>>(createFollowup, '/api/followup', {
      method: 'POST',
      body: {
        cliente_id: 1,
        responsavel_usuario_id: 2,
        tipo: 'retorno',
        titulo: 'Teste',
        vencimento_em: '2026-05-30T10:00',
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(22);

    const insertQuery = getExecutedQueries().find((entry) => entry.sql.includes('INSERT INTO followup_tarefas'));
    expect(insertQuery?.params?.[3]).toBe(9);
  });
});

describe('PUT /api/followup/[id]', () => {
  it('edita tarefa aberta e normaliza vencimento', async () => {
    mockQueryResponse('select * from followup_tarefas where id', makeTask({ id: 31 }));
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse('select count(*) as n', { n: 1 });
    mockQueryResponse('from followup_tarefas f', makeTask({
      id: 31,
      titulo: 'Título atualizado',
      tipo: 'orcamento',
      vencimento_em: '2026-06-01 16:45:00',
    }));

    const ctx = createRouteContext({ id: '31' });
    const { status, data } = await callRoute<Record<string, unknown>>(
      updateFollowup,
      '/api/followup/31',
      {
        method: 'PUT',
        body: {
          cliente_id: 1,
          responsavel_usuario_id: 2,
          tipo: 'orcamento',
          titulo: 'Título atualizado',
          descricao: 'Descrição revisada',
          vencimento_em: '2026-06-01T16:45',
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data.titulo).toBe('Título atualizado');

    const updateQuery = getExecutedQueries().find((entry) => entry.sql.includes('UPDATE followup_tarefas'));
    expect(updateQuery?.params).toEqual([
      1,
      2,
      'orcamento',
      'Título atualizado',
      'Descrição revisada',
      '2026-06-01 16:45:00',
      31,
    ]);
  });

  it('impede editar tarefa concluída', async () => {
    mockQueryResponse('select * from followup_tarefas where id', makeTask({
      id: 32,
      status: 'concluida',
      concluiu_em: formatSqliteDate(new Date()),
    }));

    const ctx = createRouteContext({ id: '32' });
    const { status, data } = await callRoute<{ error: string }>(
      updateFollowup,
      '/api/followup/32',
      {
        method: 'PUT',
        body: { titulo: 'Não deveria editar' },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Apenas tarefas abertas e não excluídas podem ser editadas');
  });
});

describe('POST /api/followup/[id]/concluir', () => {
  it('exige nota de conclusão', async () => {
    const ctx = createRouteContext({ id: '40' });
    const { status, data } = await callRoute<{ error: string }>(
      concludeFollowup,
      '/api/followup/40/concluir',
      {
        method: 'POST',
        body: { nota_conclusao: '   ' },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('nota_conclusao é obrigatória');
  });

  it('conclui tarefa aberta com nota obrigatória', async () => {
    mockQueryResponse('select * from followup_tarefas where id', makeTask({ id: 41 }));
    mockQueryResponse('from followup_tarefas f', makeTask({
      id: 41,
      status: 'concluida',
      nota_conclusao: 'Contato concluído',
      concluida_por_id: 2,
      concluida_por_nome: 'Recepção 1',
      concluida_em: '2026-05-25 11:00:00',
    }));

    const ctx = createRouteContext({ id: '41' });
    const { status, data } = await callRoute<Record<string, unknown>>(
      concludeFollowup,
      '/api/followup/41/concluir',
      {
        method: 'POST',
        body: { nota_conclusao: 'Contato concluído' },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data.status).toBe('concluida');
    expect(data.nota_conclusao).toBe('Contato concluído');

    const updateQuery = getExecutedQueries().find((entry) => entry.sql.includes("SET status = 'concluida'"));
    expect(updateQuery?.params).toEqual(['Contato concluído', 2, 41]);
  });
});

describe('DELETE /api/followup/[id]', () => {
  it('faz exclusão lógica de tarefa aberta', async () => {
    mockQueryResponse('select * from followup_tarefas where id', makeTask({ id: 51 }));

    const ctx = createRouteContext({ id: '51' });
    const { status, data } = await callRoute<{ success: boolean }>(
      deleteFollowup,
      '/api/followup/51',
      { method: 'DELETE' },
      ctx
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    const updateQuery = getExecutedQueries().find((entry) => entry.sql.includes('SET excluida_em ='));
    expect(updateQuery?.params).toEqual([2, 51]);
  });

  it('impede excluir tarefa já concluída', async () => {
    mockQueryResponse('select * from followup_tarefas where id', makeTask({
      id: 52,
      status: 'concluida',
      concluida_em: '2026-05-25 10:00:00',
    }));

    const ctx = createRouteContext({ id: '52' });
    const { status, data } = await callRoute<{ error: string }>(
      deleteFollowup,
      '/api/followup/52',
      { method: 'DELETE' },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Apenas tarefas abertas e não excluídas podem ser excluídas');
  });
});
