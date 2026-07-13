import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';

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

import { GET as listProcedimentosPendentes } from '@/app/api/clientes/[id]/procedimentos-pendentes/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/clientes/[id]/procedimentos-pendentes', () => {
  it('retorna procedimentos pendentes agendáveis do cliente', async () => {
    mockQueryResponse('select id from clientes where id = ?', { id: 1 });
    mockQueryResponse('from itens_atendimento i', [
      {
        item_id: 77,
        atendimento_id: 10,
        procedimento_id: 1,
        procedimento_nome: 'Limpeza Dental',
        status: 'pendente',
        valor: 150,
        valor_final: 150,
        valor_pago: 0,
        valor_pendente: 150,
        etapa_label: null,
        atendimento_status: 'finalizado',
        motivo_saida: 'continuacao',
        atendimento_created_at: '2026-07-10 09:00:00',
        item_created_at: '2026-07-10 09:30:00',
      },
    ]);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<typeof listResponse>(
      listProcedimentosPendentes,
      '/api/clientes/1/procedimentos-pendentes',
      {},
      ctx
    );

    expect(status).toBe(200);
    expect(data).toEqual(listResponse);

    const queries = getExecutedQueries();
    const selectQuery = queries.find((query) => query.sql.includes('FROM itens_atendimento i'));
    expect(selectQuery?.sql).toContain("i.status IN ('pendente', 'pago')");
    expect(selectQuery?.sql).toContain("ag.status IN ('pendente', 'agendado')");
  });

  it('retorna 404 quando o cliente não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(
      listProcedimentosPendentes,
      '/api/clientes/999/procedimentos-pendentes',
      {},
      ctx
    );

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });
});

const listResponse = [
  {
    item_id: 77,
    atendimento_id: 10,
    procedimento_id: 1,
    procedimento_nome: 'Limpeza Dental',
    status: 'pendente',
    valor: 150,
    valor_final: 150,
    valor_pago: 0,
    valor_pendente: 150,
    etapa_label: null,
    atendimento_status: 'finalizado',
    motivo_saida: 'continuacao',
    atendimento_created_at: '2026-07-10 09:00:00',
    item_created_at: '2026-07-10 09:30:00',
  },
] as const;
