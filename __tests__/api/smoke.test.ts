/**
 * Smoke test: verifica que a infraestrutura de testes de API funciona.
 * 
 * - Mock configurável de D1 + R2
 * - Helper callRoute() chama route handlers diretamente
 * - Respostas mockadas são retornadas corretamente
 */

import { callRoute, createRouteContext } from '../helpers/api-test-helper';
import {
  mockDb,
  mockR2Bucket,
  mockQueryResponse,
  resetMockDb,
  resetR2Store,
  setLastInsertId,
  getExecutedQueries,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../helpers/db-mock';
import { CLIENTE_BASICO, TODOS_CLIENTES } from '../helpers/seed';

// Importar route handlers reais
import { GET, POST } from '@/app/api/clientes/route';

describe('Smoke Test — Infraestrutura de Testes de API', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
    resetR2Store();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  test('callRoute GET retorna JSON mockado', async () => {
    // Configurar mock: quando a query contiver "select * from clientes", retornar dados de seed
    mockQueryResponse('select * from clientes', TODOS_CLIENTES);

    const { status, data } = await callRoute<typeof TODOS_CLIENTES>(
      GET,
      '/api/clientes',
      { method: 'GET' }
    );

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
    expect(data[0].nome).toBe('Lucas Cardoso');
  });

  test('callRoute GET com searchParams funciona', async () => {
    mockQueryResponse('select * from clientes', [CLIENTE_BASICO]);

    const { status, data } = await callRoute<typeof TODOS_CLIENTES>(
      GET,
      '/api/clientes',
      { method: 'GET', searchParams: { busca: 'Lucas' } }
    );

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].nome).toBe('Lucas Cardoso');
  });

  test('callRoute POST envia body JSON corretamente', async () => {
    setLastInsertId(10);

    // Mock: verificar cpf único (query() usa .all() → não encontra duplicata)
    mockQueryResponse('select id from clientes where cpf', []);
    // Mock: retornar o cliente criado após insert
    mockQueryResponse('select * from clientes where id', [{
      id: 10,
      nome: 'Novo Cliente',
      cpf: '52998224725',
      origem: 'fachada',
    }]);

    const { status, data } = await callRoute<{ id: number }>(
      POST,
      '/api/clientes',
      {
        method: 'POST',
        body: {
          nome: 'Novo Cliente',
          origem: 'fachada',
          cpf: '52998224725',
        },
      }
    );

    expect(status).toBe(201);
    expect(data).toHaveProperty('id', 10);

    // Verificar que queries foram executadas
    const queries = getExecutedQueries();
    expect(queries.length).toBeGreaterThanOrEqual(2);
  });

  test('createRouteContext monta params corretamente', () => {
    const ctx = createRouteContext({ id: '42' });
    expect(ctx).toHaveProperty('params');
    // params é uma Promise
    expect(ctx.params).toBeInstanceOf(Promise);
  });

  test('mock DB registra queries executadas', async () => {
    mockQueryResponse('select * from clientes', []);

    await callRoute(GET, '/api/clientes');

    const queries = getExecutedQueries();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0].sql.toLowerCase()).toContain('select');
    expect(queries[0].sql.toLowerCase()).toContain('clientes');
  });

  test('mock R2 put e get funcionam', async () => {
    await mockR2Bucket.put('test/file.txt', Buffer.from('hello'), {
      httpMetadata: { contentType: 'text/plain' },
    });

    const obj = await mockR2Bucket.get('test/file.txt');
    expect(obj).not.toBeNull();
    expect(obj!.key).toBe('test/file.txt');

    const text = await obj!.text();
    expect(text).toBe('hello');
  });

  test('mock R2 delete funciona', async () => {
    await mockR2Bucket.put('test/del.txt', Buffer.from('bye'));
    await mockR2Bucket.delete('test/del.txt');

    const obj = await mockR2Bucket.get('test/del.txt');
    expect(obj).toBeNull();
  });

  test('resetMockDb limpa estado entre testes', () => {
    mockQueryResponse('anything', [{ id: 1 }]);
    resetMockDb();
    const queries = getExecutedQueries();
    expect(queries).toHaveLength(0);
  });
});
