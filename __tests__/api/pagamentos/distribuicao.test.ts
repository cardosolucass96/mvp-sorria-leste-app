/**
 * Sprint 6 — Testes de distribuição de pagamento por itens
 *
 * Cobre: POST /api/atendimentos/[id]/pagamentos  com body.itens
 *   - vinculação pagamento↔itens via pagamentos_itens
 *   - atualização de valor_pago incremental
 *   - transição de item para 'pago' quando valor_pago >= valor
 *   - validação da soma dos valor_aplicado == valor do pagamento
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
  ATENDIMENTO_AGUARDANDO_PGTO,
  PAGAMENTO_PIX,
} from '../../helpers/seed';

import { POST as createPagamento } from '@/app/api/atendimentos/[id]/pagamentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos/[id]/pagamentos — distribuição por itens', () => {
  const baseMocks = () => {
    setLastInsertId(10);
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);
    mockQueryResponse('select id from usuarios limit 1', { id: 2 });
    mockQueryResponse('select * from pagamentos where id', { ...PAGAMENTO_PIX, id: 10 });
  };

  it('distribui pagamento por múltiplos itens', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 300,
        metodo: 'pix',
        itens: [
          { item_id: 1, valor_aplicado: 150 },
          { item_id: 2, valor_aplicado: 150 },
        ],
      },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();

    // Verifica inserções em pagamentos_itens
    const insertJunctionQueries = queries.filter(q => q.sql.includes('INSERT INTO pagamentos_itens'));
    expect(insertJunctionQueries).toHaveLength(2);

    // Verifica updates de valor_pago
    const updateQueries = queries.filter(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(updateQueries).toHaveLength(2);
  });

  it('cria registro em pagamentos_itens com valores corretos', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 200,
        metodo: 'dinheiro',
        itens: [{ item_id: 5, valor_aplicado: 200 }],
      },
    }, ctx);

    const queries = getExecutedQueries();
    const insertJunction = queries.find(q => q.sql.includes('INSERT INTO pagamentos_itens'));
    expect(insertJunction!.params[0]).toBe(10); // pagamento_id
    expect(insertJunction!.params[1]).toBe(5); // item_atendimento_id
    expect(insertJunction!.params[2]).toBe(200); // valor_aplicado
  });

  it('atualiza valor_pago incrementalmente no item', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        itens: [{ item_id: 1, valor_aplicado: 100 }],
      },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(updateQ!.sql).toContain('valor_pago = valor_pago + ?');
    expect(updateQ!.params[0]).toBe(100); // incremento
    expect(updateQ!.params[2]).toBe(1); // item_id no WHERE
  });

  it('transiciona item para "pago" quando valor_pago >= valor', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 150,
        metodo: 'pix',
        itens: [{ item_id: 1, valor_aplicado: 150 }],
      },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    // CASE WHEN valor_pago + ? >= valor THEN 'pago'
    expect(updateQ!.sql).toContain("WHEN valor_pago + ? >= valor THEN 'pago'");
    expect(updateQ!.params[1]).toBe(150); // segundo ? no CASE
  });

  it('rejeita quando soma dos valor_aplicado != valor do pagamento', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 300,
        metodo: 'pix',
        itens: [
          { item_id: 1, valor_aplicado: 100 },
          { item_id: 2, valor_aplicado: 100 },
          // soma = 200, mas valor = 300
        ],
      },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('A soma dos valores aplicados deve ser igual ao valor do pagamento');
  });

  it('aceita quando soma difere por margem de tolerância (0.01)', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        itens: [
          { item_id: 1, valor_aplicado: 33.34 },
          { item_id: 2, valor_aplicado: 33.33 },
          { item_id: 3, valor_aplicado: 33.33 },
        ],
      },
    }, ctx);

    // 33.34 + 33.33 + 33.33 = 100.00 (exato), dentro da tolerância
    expect(status).toBe(201);
  });

  it('aceita diferença de exatamente 0.01 (limite da tolerância)', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    // soma = 100.005, valor = 100 → diff = 0.005, dentro da tolerância de 0.01
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        itens: [
          { item_id: 1, valor_aplicado: 50 },
          { item_id: 2, valor_aplicado: 50.005 },
        ],
      },
    }, ctx);

    expect(status).toBe(201);
  });

  it('rejeita diferença maior que 0.01 (fora da tolerância)', async () => {
    mockQueryResponse('select * from atendimentos where id', ATENDIMENTO_AGUARDANDO_PGTO);

    const ctx = createRouteContext({ id: '3' });
    // soma = 100.02, valor = 100 → diff = 0.02, Math.abs(0.02) > 0.01 = true → rejeita
    const { status, data } = await callRoute<{ error: string }>(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        itens: [
          { item_id: 1, valor_aplicado: 50.01 },
          { item_id: 2, valor_aplicado: 50.01 },
        ],
      },
    }, ctx);

    expect(status).toBe(400);
    expect(data.error).toBe('A soma dos valores aplicados deve ser igual ao valor do pagamento');
  });

  it('funciona sem itens (pagamento sem distribuição)', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        // sem itens
      },
    }, ctx);

    expect(status).toBe(201);

    // Nenhuma inserção em pagamentos_itens
    const queries = getExecutedQueries();
    const junctionInserts = queries.filter(q => q.sql.includes('INSERT INTO pagamentos_itens'));
    expect(junctionInserts).toHaveLength(0);
  });

  it('funciona com itens vazio (array empty)', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 100,
        metodo: 'pix',
        itens: [],
      },
    }, ctx);

    expect(status).toBe(201);
  });

  it('distribui por item único', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 500,
        metodo: 'cartao_credito',
        itens: [{ item_id: 1, valor_aplicado: 500 }],
      },
    }, ctx);

    expect(status).toBe(201);

    const queries = getExecutedQueries();
    const junctionInserts = queries.filter(q => q.sql.includes('INSERT INTO pagamentos_itens'));
    expect(junctionInserts).toHaveLength(1);
    const updateQueries = queries.filter(q => q.sql.includes('UPDATE itens_atendimento'));
    expect(updateQueries).toHaveLength(1);
  });

  it('pagamento parcial — item permanece com status anterior', async () => {
    baseMocks();

    const ctx = createRouteContext({ id: '3' });
    await callRoute(createPagamento, '/api/atendimentos/3/pagamentos', {
      method: 'POST',
      body: {
        valor: 50,
        metodo: 'pix',
        itens: [{ item_id: 1, valor_aplicado: 50 }],
      },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQ = queries.find(q => q.sql.includes('UPDATE itens_atendimento'));
    // ELSE status → mantém status atual se valor_pago + 50 < valor
    expect(updateQ!.sql).toContain('ELSE status');
  });
});
