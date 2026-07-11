import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
} from '../../helpers/db-mock';
import { ATENDIMENTO_AGUARDANDO_PGTO, PAGAMENTO_PIX } from '../../helpers/seed';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin Teste',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { POST as createPagamento } from '@/app/api/atendimentos/[id]/pagamentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/pagamentos — alocação explícita', () => {
  function mockFluxoPadrao() {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('status, procedimento_id, etapas_valores', {
      id: 101,
      valor: 500,
      valor_final: 500,
      valor_pago: 0,
      status: 'pendente',
      procedimento_id: 1,
      etapas_valores: null,
      criado_por_id: 3,
      adicionado_em_execucao: 0,
      comissao_venda: 10,
      comissao_acrescimo: 15,
    });
    mockQueryResponse('from itens_atendimento', [
      {
        id: 101,
        procedimento_id: 1,
        valor: 500,
        valor_final: 500,
        valor_pago: 0,
        etapas_valores: null,
        criado_por_id: 3,
        adicionado_em_execucao: 0,
        comissao_venda: 10,
        comissao_acrescimo: 15,
      },
    ]);
    mockQueryResponse('coalesce(sum(pa.valor_alocado), 0) as total', { total: 500 });
  }

  it('grava pagamento e alocação por item', async () => {
    setLastInsertId(10);
    mockFluxoPadrao();
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, id: 10 });

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 500,
        metodo: 'pix',
        alocacoes: [{ item_id: 101, valor: 500 }],
      },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const insertAlocacao = queries.find((query) => query.sql.includes('INSERT INTO pagamentos_alocacoes'));
    expect(insertAlocacao).toBeTruthy();
    expect(insertAlocacao?.sql).toContain('criado_por_id');
    expect(insertAlocacao?.sql).toContain('origem_comissao');
    expect(insertAlocacao?.sql).toContain('percentual_comissao');
  });

  it('rejeita quando não há alocações', async () => {
    mockQueryResponse('from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: { valor: 100, metodo: 'pix' },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('Informe ao menos uma alocação de pagamento');
  });

  it('rejeita quando o valor não bate com a soma das alocações', async () => {
    mockFluxoPadrao();

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 500,
        metodo: 'pix',
        alocacoes: [{ item_id: 101, valor: 300 }],
      },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('O valor do pagamento deve ser igual à soma das alocações');
  });
});
