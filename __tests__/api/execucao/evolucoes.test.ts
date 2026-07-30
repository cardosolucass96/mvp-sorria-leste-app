import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
  mockDb,
} from '../../helpers/db-mock';
import { POST as criarEvolucao } from '@/app/api/execucao/evolucoes/route';
import { generateToken } from '@/lib/auth/jwt';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  jest.clearAllMocks();
});

afterEach(() => {
  teardownCloudflareContextMock();
  jest.restoreAllMocks();
});

function mockItensElegiveis(overrides: Partial<{
  atendimento_id: number;
  atendimento_status: string;
  unidade_id: number;
  executor_id: number | null;
  status: string;
  tem_etapas: number;
  evolucao_id: number | null;
  possui_agendamento_ativo: number;
}> = {}) {
  const executorId = Object.prototype.hasOwnProperty.call(overrides, 'executor_id')
    ? overrides.executor_id
    : 1;
  mockQueryResponse('from itens_atendimento i', [
    {
      id: 10,
      atendimento_id: overrides.atendimento_id ?? 50,
      atendimento_status: overrides.atendimento_status ?? 'em_execucao',
      unidade_id: overrides.unidade_id ?? 1,
      executor_id: executorId,
      status: overrides.status ?? 'executando',
      tem_etapas: overrides.tem_etapas ?? 0,
      evolucao_id: overrides.evolucao_id ?? null,
      possui_agendamento_ativo: overrides.possui_agendamento_ativo ?? 0,
    },
    {
      id: 11,
      atendimento_id: overrides.atendimento_id ?? 50,
      atendimento_status: overrides.atendimento_status ?? 'em_execucao',
      unidade_id: overrides.unidade_id ?? 1,
      executor_id: executorId,
      status: overrides.status ?? 'pago',
      tem_etapas: overrides.tem_etapas ?? 0,
      evolucao_id: overrides.evolucao_id ?? null,
      possui_agendamento_ativo: overrides.possui_agendamento_ativo ?? 0,
    },
  ]);
}

async function authorizationFor(
  id: number,
  role: 'admin' | 'atendente' | 'avaliador' | 'executor' | 'ortodontista'
) {
  const token = await generateToken({
    id,
    email: `${role}@test.com`,
    role,
    roles: [role],
    nome: `${role} Teste`,
    unidade_ids: [1],
    unidade_atual: 1,
  });
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/execucao/evolucoes', () => {
  it('cria evolução em lote, vincula itens, conclui e gera comissões por item', async () => {
    const batchSpy = jest.spyOn(mockDb, 'batch');
    mockItensElegiveis();
    mockQueryResponse('select id, status from atendimentos where id', { id: 50, status: 'finalizado' });

    const { status, data } = await callRoute<{
      success: boolean;
      item_ids: number[];
      atendimento_finalizado: boolean;
    }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
        observacoes: 'Sem intercorrências',
      },
    });

    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.item_ids).toEqual([10, 11]);
    expect(data.atendimento_finalizado).toBe(true);

    const queries = getExecutedQueries();
    expect(queries.some((q) => q.sql.includes('INSERT INTO prontuario_evolucoes'))).toBe(true);
    expect(queries.filter((q) => q.sql.includes('INSERT INTO prontuario_evolucao_itens'))).toHaveLength(2);
    expect(queries.some((q) => q.sql.includes("SET status = 'concluido'"))).toBe(true);
    expect(queries.filter((q) => q.sql.includes('INSERT INTO comissoes'))).toHaveLength(2);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  });

  it('retorna atendimento para pagamento quando há procedimento adicionado em execução não quitado', async () => {
    mockItensElegiveis();
    mockQueryResponse('select id, status from atendimentos where id', { id: 50, status: 'aguardando_pagamento' });

    const { status, data } = await callRoute<{
      atendimento_finalizado: boolean;
      atendimento_voltou_para_pagamento: boolean;
    }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(201);
    expect(data.atendimento_finalizado).toBe(false);
    expect(data.atendimento_voltou_para_pagamento).toBe(true);
    expect(getExecutedQueries().some((q) => q.sql.includes("status = 'aguardando_pagamento'"))).toBe(true);
  });

  it('exige autenticação', async () => {
    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      headers: { Authorization: '' },
      body: {
        item_ids: [10],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(401);
    expect(data.error).toContain('Token de autenticação');
  });

  it('bloqueia conclusão de item de outro executor', async () => {
    mockItensElegiveis({ executor_id: 99 });
    const headers = await authorizationFor(4, 'executor');

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      headers,
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(403);
    expect(data.error).toContain('executor responsável');
  });

  it.each(['admin', 'atendente'] as const)('%s conclui em nome de outro executor sem reassinar o item', async (role) => {
    mockItensElegiveis({ executor_id: 44 });
    mockQueryResponse('select id, status from atendimentos where id', { id: 50, status: 'finalizado' });
    const registradorId = role === 'admin' ? 8 : 9;
    const headers = await authorizationFor(registradorId, role);

    const { status, data } = await callRoute<{
      executor_id: number;
      registrado_por_id: number;
    }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      headers,
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica registrada pela recepção',
        executor_id: 999,
        usuario_id: 999,
      },
    });

    expect(status).toBe(201);
    expect(data.executor_id).toBe(44);
    expect(data.registrado_por_id).toBe(registradorId);

    const insertEvolucao = getExecutedQueries().find((q) => q.sql.includes('INSERT INTO prontuario_evolucoes'));
    expect(insertEvolucao?.params[2]).toBe(registradorId);
    const comissao = getExecutedQueries().find((q) => q.sql.includes('INSERT INTO comissoes'));
    expect(comissao?.sql).toContain('ia.executor_id');
    expect(getExecutedQueries().some((q) => q.sql.includes('executor_id = ?'))).toBe(false);
  });

  it('mantém o fluxo do executor responsável', async () => {
    mockItensElegiveis({ executor_id: 4 });
    mockQueryResponse('select id, status from atendimentos where id', { id: 50, status: 'finalizado' });
    const headers = await authorizationFor(4, 'executor');

    const { status, data } = await callRoute<{ executor_id: number; registrado_por_id: number }>(
      criarEvolucao,
      '/api/execucao/evolucoes',
      {
        method: 'POST',
        headers,
        body: {
          item_ids: [10, 11],
          descricao: 'Evolução clínica registrada pelo executor',
        },
      }
    );

    expect(status).toBe(201);
    expect(data).toMatchObject({ executor_id: 4, registrado_por_id: 4 });
  });

  it('bloqueia avaliador mesmo quando o item está atribuído a ele', async () => {
    mockItensElegiveis({ executor_id: 3 });
    const headers = await authorizationFor(3, 'avaliador');

    const { status } = await callRoute(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      headers,
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(403);
  });

  it('bloqueia item de outra unidade', async () => {
    mockItensElegiveis({ unidade_id: 2 });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(403);
    expect(data.error).toContain('unidade');
  });

  it('rejeita procedimentos de atendimentos diferentes', async () => {
    mockQueryResponse('from itens_atendimento i', [
      {
        id: 10,
        atendimento_id: 50,
        atendimento_status: 'em_execucao',
        unidade_id: 1,
        executor_id: 1,
        status: 'executando',
        tem_etapas: 0,
        evolucao_id: null,
      },
      {
        id: 11,
        atendimento_id: 51,
        atendimento_status: 'em_execucao',
        unidade_id: 1,
        executor_id: 1,
        status: 'pago',
        tem_etapas: 0,
        evolucao_id: null,
      },
    ]);

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('mesmo atendimento');
  });

  it('rejeita atendimento que não está em execução', async () => {
    mockItensElegiveis({ atendimento_status: 'aguardando_pagamento' });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('em execução');
  });

  it('rejeita item já vinculado a evolução', async () => {
    mockItensElegiveis({ evolucao_id: 7 });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(409);
    expect(data.error).toContain('já foram concluídos ou vinculados');
  });

  it('rejeita item já concluído como conflito', async () => {
    mockItensElegiveis({ status: 'concluido' });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(409);
    expect(data.error).toContain('já foram concluídos ou vinculados');
  });

  it('aceita procedimentos por etapas ou sessões', async () => {
    mockItensElegiveis({ tem_etapas: 1 });
    mockQueryResponse('select id, status from atendimentos where id', { id: 50, status: 'finalizado' });

    const { status } = await callRoute(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(201);
  });

  it('rejeita procedimentos sem executor', async () => {
    mockItensElegiveis({ executor_id: null });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('executor definido');
  });

  it('rejeita procedimento com status não elegível', async () => {
    mockItensElegiveis({ status: 'pendente' });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('pagos ou em execução');
  });

  it('rejeita agrupamento com executores diferentes', async () => {
    mockQueryResponse('from itens_atendimento i', [
      { id: 10, atendimento_id: 50, atendimento_status: 'em_execucao', unidade_id: 1, executor_id: 4, status: 'executando', tem_etapas: 0, evolucao_id: null, possui_agendamento_ativo: 0 },
      { id: 11, atendimento_id: 50, atendimento_status: 'em_execucao', unidade_id: 1, executor_id: 5, status: 'pago', tem_etapas: 0, evolucao_id: null, possui_agendamento_ativo: 0 },
    ]);

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('mesmo executor');
  });

  it('rejeita procedimento com agendamento futuro ativo', async () => {
    mockItensElegiveis({ possui_agendamento_ativo: 1 });

    const { status, data } = await callRoute<{ error: string }>(criarEvolucao, '/api/execucao/evolucoes', {
      method: 'POST',
      body: {
        item_ids: [10, 11],
        descricao: 'Evolução clínica com descrição suficiente',
      },
    });

    expect(status).toBe(400);
    expect(data.error).toContain('agendamento futuro');
  });
});
