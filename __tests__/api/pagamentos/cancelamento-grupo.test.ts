import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
import { ATENDIMENTO_AGUARDANDO_PGTO } from '../../helpers/seed';

jest.mock('@/lib/auth/jwt', () => ({
  extractToken: jest.fn().mockReturnValue('mock-token'),
  verifyToken: jest.fn().mockResolvedValue({
    sub: 1, email: 'admin@test.com', role: 'admin', nome: 'Admin Teste',
    unidade_ids: [1, 2], unidade_atual: 1,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400,
  }),
  generateToken: jest.fn().mockResolvedValue('mock-token'),
}));

import { PUT as cancelarPagamento } from '@/app/api/atendimentos/[id]/pagamentos/[pagamentoId]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('PUT /api/atendimentos/[id]/pagamentos/[pagamentoId]', () => {
  it('cancela o grupo inteiro quando o pagamento pertence a um grupo', async () => {
    mockQueryResponse('select id, unidade_id from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('from pagamentos\n       where id', {
      id: 31,
      atendimento_id: 3,
      pagamento_grupo_id: 90,
      valor: 100,
      cancelado: 0,
    });
    mockQueryResponse('select id, cancelado from pagamentos where pagamento_grupo_id', [
      { id: 31, cancelado: 0 },
      { id: 32, cancelado: 0 },
    ]);
    mockQueryResponse('from pagamentos_alocacoes', [
      { id: 501, item_atendimento_id: 101, agendamento_id: null },
      { id: 502, item_atendimento_id: 102, agendamento_id: null },
    ]);
    mockQueryResponse('where id = ?', { id: 101, valor: 100, valor_final: 100, valor_pago: 0, status: 'pendente', procedimento_id: 1, etapas_valores: null });
    mockQueryResponse('coalesce(sum(pa.valor_alocado), 0) as total', { total: 0 });

    const ctx = createRouteContext({ id: '3', pagamentoId: '31' });
    const { status } = await callRoute(cancelarPagamento, '/api/atendimentos/3/pagamentos/31', {
      method: 'PUT',
      body: { motivo: 'Cobrança lançada errada' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    expect(queries.some((query) => query.sql.includes('UPDATE pagamentos_grupos SET cancelado = 1'))).toBe(true);
    expect(queries.some((query) => query.sql.includes('UPDATE pagamentos SET cancelado = 1') && query.sql.includes('pagamento_grupo_id'))).toBe(true);
    expect(queries.some((query) => query.sql.includes('DELETE FROM comissoes') && query.sql.includes('pagamento_alocacao_id IN'))).toBe(true);
  });
});
