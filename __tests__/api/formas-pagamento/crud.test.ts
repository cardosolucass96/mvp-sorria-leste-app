import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setLastInsertId,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

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

import { GET as listFormas, POST as createForma } from '@/app/api/formas-pagamento/route';
import { GET as getForma, PUT as updateForma } from '@/app/api/formas-pagamento/[id]/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('GET /api/formas-pagamento', () => {
  it('lista formas da unidade atual', async () => {
    mockQueryResponse('from formas_pagamento fp', [
      {
        id: 10,
        unidade_id: 1,
        grupo: 'Cartão Crédito',
        subgrupo: 'Rede Visa 3x',
        metodo_base: 'cartao_credito',
        ativo: 1,
        created_at: '2025-01-01 00:00:00',
        updated_at: '2025-01-02 00:00:00',
        taxa_percentual: 5.5,
        taxa_fixa: 0,
        vigente_de: '2025-01-01 00:00:00',
        vigente_ate: null,
      },
    ]);

    const { status, data } = await callRoute<Array<{ grupo: string }>>(listFormas, '/api/formas-pagamento');

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].grupo).toBe('Cartão Crédito');
  });
});

describe('POST /api/formas-pagamento', () => {
  it('cria forma e histórico inicial', async () => {
    setLastInsertId(15);
    mockQueryResponse('and lower(grupo) = lower(?)', []);
    mockQueryResponse('from formas_pagamento fp', [
      {
        id: 15,
        unidade_id: 1,
        grupo: 'PIX',
        subgrupo: '',
        metodo_base: 'pix',
        ativo: 1,
        created_at: '2025-01-01 00:00:00',
        updated_at: '2025-01-01 00:00:00',
        taxa_percentual: 0.5,
        taxa_fixa: 0,
        vigente_de: '2025-01-01 00:00:00',
        vigente_ate: null,
      },
    ]);

    const { status, data } = await callRoute<{ id: number }>(createForma, '/api/formas-pagamento', {
      method: 'POST',
      body: {
        grupo: 'PIX',
        subgrupo: '',
        metodo_base: 'pix',
        taxa_percentual: 0.5,
        taxa_fixa: 0,
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(15);

    const queries = getExecutedQueries();
    expect(queries.some((query) => query.sql.includes('INSERT INTO formas_pagamento ('))).toBe(true);
    expect(queries.some((query) => query.sql.includes('INSERT INTO formas_pagamento_historico'))).toBe(true);
  });

  it('bloqueia duplicidade de grupo e subgrupo na unidade', async () => {
    mockQueryResponse('and lower(grupo) = lower(?)', { id: 4 });

    const { status, data } = await callRoute<{ error: string }>(createForma, '/api/formas-pagamento', {
      method: 'POST',
      body: {
        grupo: 'Cartão Crédito',
        subgrupo: 'Rede Visa 3x',
        metodo_base: 'cartao_credito',
        taxa_percentual: 4,
        taxa_fixa: 0,
      },
    });

    expect(status).toBe(409);
    expect(data.error).toContain('Já existe');
  });
});

describe('GET /api/formas-pagamento/[id]', () => {
  it('retorna detalhe com histórico', async () => {
    mockQueryResponse('from formas_pagamento fp', {
      id: 10,
      unidade_id: 1,
      grupo: 'Cartão Débito',
      subgrupo: 'Stone',
      metodo_base: 'cartao_debito',
      ativo: 1,
      created_at: '2025-01-01 00:00:00',
      updated_at: '2025-01-02 00:00:00',
      taxa_percentual: 1.2,
      taxa_fixa: 0,
      vigente_de: '2025-01-02 00:00:00',
      vigente_ate: null,
    });
    mockQueryResponse('from formas_pagamento_historico', [
      {
        id: 1,
        forma_pagamento_id: 10,
        taxa_percentual: 1.2,
        taxa_fixa: 0,
        vigente_de: '2025-01-02 00:00:00',
        vigente_ate: null,
        alterado_por_id: 1,
        created_at: '2025-01-02 00:00:00',
      },
    ]);

    const ctx = createRouteContext({ id: '10' });
    const { status, data } = await callRoute<{ historico: Array<{ id: number }> }>(getForma, '/api/formas-pagamento/10', {}, ctx);

    expect(status).toBe(200);
    expect(data.historico).toHaveLength(1);
  });
});

describe('PUT /api/formas-pagamento/[id]', () => {
  it('versiona histórico quando a taxa muda', async () => {
    mockQueryResponse('from formas_pagamento fp', {
      id: 10,
      unidade_id: 1,
      grupo: 'Cartão Crédito',
      subgrupo: 'Rede Visa 3x',
      metodo_base: 'cartao_credito',
      ativo: 1,
      created_at: '2025-01-01 00:00:00',
      updated_at: '2025-01-02 00:00:00',
      taxa_percentual: 5,
      taxa_fixa: 0,
      vigente_de: '2025-01-02 00:00:00',
      vigente_ate: null,
    });
    mockQueryResponse('and id <> ?', []);
    mockQueryResponse('from formas_pagamento_historico', []);

    const ctx = createRouteContext({ id: '10' });
    const { status } = await callRoute(updateForma, '/api/formas-pagamento/10', {
      method: 'PUT',
      body: {
        grupo: 'Cartão Crédito',
        subgrupo: 'Rede Visa 3x',
        metodo_base: 'cartao_credito',
        taxa_percentual: 6.5,
        taxa_fixa: 0.25,
        ativo: true,
      },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    expect(queries.some((query) => query.sql.includes('UPDATE formas_pagamento_historico'))).toBe(true);
    expect(queries.filter((query) => query.sql.includes('INSERT INTO formas_pagamento_historico')).length).toBe(1);
  });
});
