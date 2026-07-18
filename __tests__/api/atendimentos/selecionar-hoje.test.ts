import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
  setLastInsertId,
} from '../../helpers/db-mock';
import {
  ATENDIMENTO_AGUARDANDO_PGTO,
  ITEM_LIMPEZA_PENDENTE,
} from '../../helpers/seed';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 2,
    email: 'atendente@test.com',
    role: 'atendente',
    nome: 'Atendente Teste',
    unidade_ids: [1],
    unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as selecionarHoje } from '@/app/api/atendimentos/[id]/selecionar-hoje/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/selecionar-hoje', () => {
  it('atualiza o executor do item quando o procedimento segue para fazer_hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id, role from usuarios where id', { id: 7, role: 'executor' });
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number; status_final: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: 7,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 0, itens_hoje: 1, status_final: 'aguardando_pagamento' });

    const queries = getExecutedQueries();
    const updateExecutorQuery = queries.find((query) => query.sql.includes('UPDATE itens_atendimento SET executor_id = ? WHERE id = ?'));

    expect(updateExecutorQuery).toBeDefined();
    expect(updateExecutorQuery?.params).toEqual([7, 1]);
  });

  it('permite definir admin como executor para o item que segue para hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id, role from usuarios where id', { id: 1, role: 'admin' });
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: 1,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateExecutorQuery = queries.find((query) => query.sql.includes('UPDATE itens_atendimento SET executor_id = ? WHERE id = ?'));

    expect(updateExecutorQuery).toBeDefined();
    expect(updateExecutorQuery?.params).toEqual([1, 1]);
  });

  it('mantem executor nulo ao gerar agendamento futuro sem executor', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);
    setLastInsertId(55);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'agendar',
              data_agendada: '2026-07-10',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[4]).toBeNull();
  });

  it('preserva item com comissao ao mandar procedimento pago para sem data em fluxo misto', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, id: 1, procedimento_id: 34, valor: 500, valor_final: 500, valor_pago: 500, status: 'pago', executor_id: null },
      { ...ITEM_LIMPEZA_PENDENTE, id: 2, procedimento_id: 1, valor: 0, valor_final: 0, valor_pago: 0, status: 'pago', executor_id: null },
    ]);
    mockQueryResponse('select (\n       (select count(*) from comissoes where item_atendimento_id = ?)', { count: 1 });
    setLastInsertId(91);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number; status_final: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          acao_final: 'liberar_execucao',
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'pago_sem_data',
              executor_id: null,
            },
            {
              item_id: 2,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 1, itens_hoje: 1, status_final: 'aguardando_pagamento' });

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));
    const deleteItemQueries = queries.filter((query) => query.sql.includes('DELETE FROM itens_atendimento WHERE id = ?'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[3]).toBe(1);
    expect(deleteItemQueries).toHaveLength(0);
  });

  it('mantem executor nulo ao quebrar procedimento em etapas para fazer_hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, procedimento_id: 9, executor_id: 4, etapas_valores: null },
    ]);
    mockQueryResponse('select count(*) as count from procedimento_etapas_modelo where procedimento_id', { count: 1 });
    mockQueryResponse('select id, nome, valor from procedimento_etapas_modelo where procedimento_id', [
      { id: 101, nome: 'Sessão 1', valor: 150 },
    ]);
    mockQueryResponse('select coalesce(sum(pa.valor_alocado), 0) as total', { total: 0 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: 101,
              destino_status: 'fazer_hoje',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const insertItemQuery = queries.find((query) => query.sql.includes('INSERT INTO itens_atendimento\n              (atendimento_id'));

    expect(insertItemQuery).toBeDefined();
    expect(insertItemQuery?.params[2]).toBeNull();
  });

  it('finaliza como continuacao quando tudo segue para agendamento com data', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);
    setLastInsertId(88);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number; status_final: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          acao_final: 'finalizar_continuacao',
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'agendar',
              data_agendada: '2026-07-20',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 1, itens_hoje: 0, status_final: 'finalizado' });

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));
    const finalizarQuery = queries.find((query) =>
      query.sql.includes("SET status = 'finalizado'") && query.sql.includes("motivo_saida = 'continuacao'")
    );
    const deleteItemQuery = queries.find((query) => query.sql.includes('DELETE FROM itens_atendimento WHERE id = ?'));
    const realocacaoQuery = queries.find((query) => query.sql.includes('SET agendamento_id = ?, item_atendimento_id = NULL'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[3]).toBe(1);
    expect(finalizarQuery).toBeDefined();
    expect(deleteItemQuery).toBeUndefined();
    expect(realocacaoQuery).toBeUndefined();
  });

  it('finaliza como continuacao e gera agendamento pendente quando ficar sem data', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);
    setLastInsertId(89);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number; status_final: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          acao_final: 'finalizar_continuacao',
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'nao_pago_sem_data',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 1, itens_hoje: 0, status_final: 'finalizado' });

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));
    const deleteItemQuery = queries.find((query) => query.sql.includes('DELETE FROM itens_atendimento WHERE id = ?'));
    const realocacaoQuery = queries.find((query) => query.sql.includes('SET agendamento_id = ?, item_atendimento_id = NULL'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[3]).toBe(1);
    expect(insertAgendamentoQuery?.params[5]).toBeNull();
    expect(insertAgendamentoQuery?.params[6]).toBe('pendente');
    expect(deleteItemQuery).toBeUndefined();
    expect(realocacaoQuery).toBeUndefined();
  });

  it('preserva o item original mesmo quando o procedimento ja esta 100% pago', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, valor: 150, valor_pago: 150, status: 'pago', executor_id: 4 },
    ]);
    setLastInsertId(90);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ agendamentos_criados: number; itens_hoje: number; status_final: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          acao_final: 'finalizar_continuacao',
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'pago_sem_data',
              executor_id: null,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual({ agendamentos_criados: 1, itens_hoje: 0, status_final: 'finalizado' });

    const queries = getExecutedQueries();
    const insertAgendamentoQuery = queries.find((query) => query.sql.includes('INSERT INTO agendamentos'));
    const deleteItemQuery = queries.find((query) => query.sql.includes('DELETE FROM itens_atendimento WHERE id = ?'));
    const realocacaoQuery = queries.find((query) => query.sql.includes('SET agendamento_id = ?, item_atendimento_id = NULL'));

    expect(insertAgendamentoQuery).toBeDefined();
    expect(insertAgendamentoQuery?.params[3]).toBe(1);
    expect(insertAgendamentoQuery?.params[6]).toBe('pendente');
    expect(deleteItemQuery).toBeUndefined();
    expect(realocacaoQuery).toBeUndefined();
  });

  it('rejeita finalizar como continuacao quando houver procedimento para hoje', async () => {
    mockQueryResponse('select id, cliente_id, unidade_id, categoria_id, status from atendimentos', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id, role from usuarios where id', { id: 4, role: 'executor' });
    mockQueryResponse('select * from itens_atendimento where atendimento_id', [
      { ...ITEM_LIMPEZA_PENDENTE, executor_id: 4 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      selecionarHoje,
      '/api/atendimentos/3/selecionar-hoje',
      {
        method: 'POST',
        body: {
          acao_final: 'finalizar_continuacao',
          destinos: [
            {
              item_id: 1,
              etapa_modelo_id: null,
              destino_status: 'fazer_hoje',
              executor_id: 4,
            },
          ],
        },
      },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Não é possível finalizar como continuação');

    const queries = getExecutedQueries();
    const finalizarQuery = queries.find((query) => query.sql.includes("SET status = 'finalizado'"));
    expect(finalizarQuery).toBeUndefined();
  });
});
