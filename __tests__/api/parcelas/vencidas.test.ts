/**
 * Sprint 6 — Testes de parcelas vencidas
 *
 * Cobre: GET /api/parcelas/vencidas
 *   - Retorna parcelas com data_vencimento < hoje E pago = 0
 *   - JOIN com atendimentos + clientes para nome do cliente
 *   - Ordenação por data_vencimento ASC
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  getExecutedQueries,
} from '../../helpers/db-mock';
import { PARCELA_VENCIDA } from '../../helpers/seed';

import { GET as getVencidas } from '@/app/api/parcelas/vencidas/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/parcelas/vencidas', () => {
  it('retorna parcelas vencidas com nome do cliente', async () => {
    const vencidas = [
      { ...PARCELA_VENCIDA, cliente_nome: 'João Silva' },
    ];
    mockQueryResponse('from parcelas p', vencidas);

    const { status, data } = await callRoute(getVencidas, '/api/parcelas/vencidas');

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].cliente_nome).toBe('João Silva');
    expect(data[0].pago).toBe(0);
  });

  it('retorna lista vazia quando não há vencidas', async () => {
    mockQueryResponse('from parcelas p', []);

    const { status, data } = await callRoute(getVencidas, '/api/parcelas/vencidas');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('filtra por pago = 0', async () => {
    mockQueryResponse('from parcelas p', []);

    await callRoute(getVencidas, '/api/parcelas/vencidas');

    const queries = getExecutedQueries();
    const selectQ = queries[0];
    expect(selectQ.sql).toContain('p.pago = 0');
  });

  it('filtra por data_vencimento < hoje', async () => {
    mockQueryResponse('from parcelas p', []);

    await callRoute(getVencidas, '/api/parcelas/vencidas');

    const queries = getExecutedQueries();
    const selectQ = queries[0];
    expect(selectQ.sql).toContain('p.data_vencimento < ?');
    // param deve ser data no formato YYYY-MM-DD
    expect(selectQ.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ordena por data_vencimento ASC (mais antiga primeiro)', async () => {
    mockQueryResponse('from parcelas p', []);

    await callRoute(getVencidas, '/api/parcelas/vencidas');

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY p.data_vencimento ASC');
  });

  it('faz JOIN com atendimentos e clientes', async () => {
    mockQueryResponse('from parcelas p', []);

    await callRoute(getVencidas, '/api/parcelas/vencidas');

    const queries = getExecutedQueries();
    const sql = queries[0].sql;
    expect(sql).toContain('INNER JOIN atendimentos a ON p.atendimento_id = a.id');
    expect(sql).toContain('INNER JOIN clientes c ON a.cliente_id = c.id');
  });

  it('retorna múltiplas parcelas vencidas', async () => {
    const vencidas = [
      { ...PARCELA_VENCIDA, id: 3, data_vencimento: '2025-01-15', cliente_nome: 'João Silva' },
      { ...PARCELA_VENCIDA, id: 5, data_vencimento: '2025-02-01', cliente_nome: 'Maria Souza' },
    ];
    mockQueryResponse('from parcelas p', vencidas);

    const { status, data } = await callRoute(getVencidas, '/api/parcelas/vencidas');

    expect(status).toBe(200);
    expect(data).toHaveLength(2);
  });
});
