import { POST as debitarSaldo } from '@/app/api/clientes/[id]/saldo/debitar/route';
import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/clientes/[id]/saldo/debitar', () => {
  it('usa valor_final ao quitar item legado e sincroniza valor_pago', async () => {
    mockQueryResponse('select id from clientes where id', { id: 5 });
    mockQueryResponse('where id = ? and atendimento_id = ?', {
      id: 101,
      atendimento_id: 20,
      valor: 1500,
      valor_final: 2000,
      valor_pago: 500,
      status: 'pendente',
    });
    mockQueryResponse('select saldo from saldo_clientes', { saldo: 1800 });

    const { status, data } = await callRoute<{ saldo: number }>(
      debitarSaldo,
      '/api/clientes/5/saldo/debitar',
      {
        method: 'POST',
        body: { item_atendimento_id: 101, atendimento_id: 20 },
      },
      createRouteContext({ id: '5' })
    );

    expect(status).toBe(200);
    expect(data.saldo).toBe(300);

    const queries = getExecutedQueries();
    const movimentacao = queries.find((query) => query.sql.includes('INSERT INTO movimentacoes_saldo'));
    const quitacao = queries.find((query) => query.sql.includes('UPDATE itens_atendimento SET valor_pago'));
    expect(movimentacao?.params[1]).toBe(1500);
    expect(quitacao?.params).toEqual([2000, 101]);
  });
});
