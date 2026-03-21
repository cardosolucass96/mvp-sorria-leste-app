/**
 * Sprint 3 — Testes CRUD /api/clientes
 *
 * Cobre: GET (listar), GET (busca), POST (criar), GET [id], PUT [id], DELETE [id]
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
  CLIENTE_BASICO,
  CLIENTE_MINIMO,
  CLIENTE_COMPLETO,
  TODOS_CLIENTES,
} from '../../helpers/seed';

// Importar handlers
import { GET as listClientes, POST as createCliente } from '@/app/api/clientes/route';
import { GET as getCliente, PUT as updateCliente, DELETE as deleteCliente } from '@/app/api/clientes/[id]/route';

// ─── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// =============================================================================
// GET /api/clientes  (listar)
// =============================================================================

describe('GET /api/clientes', () => {
  it('retorna lista de clientes ordenados por nome', async () => {
    mockQueryResponse('select * from clientes order by nome', TODOS_CLIENTES);

    const { status, data } = await callRoute(listClientes, '/api/clientes');

    expect(status).toBe(200);
    expect(data).toEqual(TODOS_CLIENTES);
  });

  it('retorna lista vazia quando não há clientes', async () => {
    mockQueryResponse('select * from clientes order by nome', []);

    const { status, data } = await callRoute(listClientes, '/api/clientes');

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('busca por nome parcial', async () => {
    mockQueryResponse('where nome like', [CLIENTE_BASICO]);

    const { status, data } = await callRoute(listClientes, '/api/clientes', {
      searchParams: { busca: 'Lucas' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([CLIENTE_BASICO]);

    // Verifica se o parâmetro de busca foi usado na query
    const queries = getExecutedQueries();
    const searchQuery = queries.find(q => q.sql.includes('LIKE'));
    expect(searchQuery).toBeDefined();
    expect(searchQuery!.params).toContain('%Lucas%');
  });

  it('busca por CPF parcial', async () => {
    mockQueryResponse('where nome like', [CLIENTE_BASICO]);

    const { status, data } = await callRoute(listClientes, '/api/clientes', {
      searchParams: { busca: '529982' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([CLIENTE_BASICO]);
  });

  it('busca por telefone', async () => {
    mockQueryResponse('where nome like', [CLIENTE_BASICO]);

    const { status, data } = await callRoute(listClientes, '/api/clientes', {
      searchParams: { busca: '11999887766' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([CLIENTE_BASICO]);
  });

  it('busca por email', async () => {
    mockQueryResponse('where nome like', [CLIENTE_COMPLETO]);

    const { status, data } = await callRoute(listClientes, '/api/clientes', {
      searchParams: { busca: 'roberto@email' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([CLIENTE_COMPLETO]);
  });

  it('busca sem resultados retorna array vazio', async () => {
    mockQueryResponse('where nome like', []);

    const { status, data } = await callRoute(listClientes, '/api/clientes', {
      searchParams: { busca: 'ninguem_aqui' },
    });

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });
});

// =============================================================================
// POST /api/clientes  (criar)
// =============================================================================

describe('POST /api/clientes', () => {
  it('cria cliente com dados mínimos (nome + origem)', async () => {
    setLastInsertId(10);
    // Não encontra CPF duplicado → resultado vazio não precisa ser mockado se cpf não enviado
    mockQueryResponse('select * from clientes where id', [{
      id: 10,
      nome: 'Novo Cliente',
      cpf: null,
      telefone: null,
      email: null,
      data_nascimento: null,
      endereco: null,
      origem: 'fachada',
      observacoes: null,
      created_at: '2025-03-20 10:00:00',
    }]);

    const { status, data } = await callRoute<Record<string, unknown>>(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Novo Cliente', origem: 'fachada' },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(10);
    expect(data.nome).toBe('Novo Cliente');
    expect(data.origem).toBe('fachada');
  });

  it('cria cliente com todos os campos', async () => {
    setLastInsertId(11);
    // CPF check → vazio (não existe)
    mockQueryResponse('select id from clientes where cpf', []);
    // Retorno do INSERT
    mockQueryResponse('select * from clientes where id', [{
      id: 11,
      nome: 'Cliente Completo',
      cpf: '11144477735',
      telefone: '21988776655',
      email: 'completo@email.com',
      data_nascimento: '1985-12-25',
      endereco: 'Av Brasil, 456',
      origem: 'trafego_meta',
      observacoes: 'Obs teste',
      created_at: '2025-03-20 10:00:00',
    }]);

    const { status, data } = await callRoute<Record<string, unknown>>(createCliente, '/api/clientes', {
      method: 'POST',
      body: {
        nome: 'Cliente Completo',
        cpf: '11144477735',
        telefone: '21988776655',
        email: 'Completo@Email.COM',
        data_nascimento: '1985-12-25',
        endereco: 'Av Brasil, 456',
        origem: 'trafego_meta',
        observacoes: 'Obs teste',
      },
    });

    expect(status).toBe(201);
    expect(data.id).toBe(11);

    // Verifica que email foi lowercased no INSERT
    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO clientes'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery!.params).toContain('completo@email.com');
  });

  it('trimma espaços de nome, cpf, telefone, email, endereco, observacoes', async () => {
    setLastInsertId(12);
    mockQueryResponse('select id from clientes where cpf', []);
    mockQueryResponse('select * from clientes where id', [{
      id: 12,
      nome: 'Trimmed',
      cpf: '52998224725',
      telefone: '11999',
      email: 'trim@test.com',
      data_nascimento: null,
      endereco: 'Rua Trim',
      origem: 'organico',
      observacoes: 'obs',
      created_at: '2025-03-20 10:00:00',
    }]);

    await callRoute(createCliente, '/api/clientes', {
      method: 'POST',
      body: {
        nome: '  Trimmed  ',
        cpf: '  52998224725  ',
        telefone: '  11999  ',
        email: '  Trim@Test.COM  ',
        endereco: '  Rua Trim  ',
        origem: 'organico',
        observacoes: '  obs  ',
      },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO clientes'));
    expect(insertQuery).toBeDefined();
    const params = insertQuery!.params;
    expect(params[0]).toBe('Trimmed');       // nome
    expect(params[1]).toBe('52998224725');    // cpf
    expect(params[2]).toBe('11999');          // telefone
    expect(params[3]).toBe('trim@test.com'); // email lowercased + trimmed
    expect(params[5]).toBe('Rua Trim');      // endereco
    expect(params[7]).toBe('obs');           // observacoes
  });

  it('campos opcionais são null quando não enviados', async () => {
    setLastInsertId(13);
    mockQueryResponse('select * from clientes where id', [{
      id: 13, nome: 'Apenas Nome', cpf: null, telefone: null, email: null,
      data_nascimento: null, endereco: null, origem: 'indicacao', observacoes: null,
      created_at: '2025-03-20',
    }]);

    await callRoute(createCliente, '/api/clientes', {
      method: 'POST',
      body: { nome: 'Apenas Nome', origem: 'indicacao' },
    });

    const queries = getExecutedQueries();
    const insertQuery = queries.find(q => q.sql.includes('INSERT INTO clientes'));
    // cpf, telefone, email, data_nascimento, endereco, observacoes → null
    expect(insertQuery!.params[1]).toBeNull(); // cpf
    expect(insertQuery!.params[2]).toBeNull(); // telefone
    expect(insertQuery!.params[3]).toBeNull(); // email
    expect(insertQuery!.params[4]).toBeNull(); // data_nascimento
    expect(insertQuery!.params[5]).toBeNull(); // endereco
    expect(insertQuery!.params[7]).toBeNull(); // observacoes
  });
});

// =============================================================================
// GET /api/clientes/[id]  (buscar por ID)
// =============================================================================

describe('GET /api/clientes/[id]', () => {
  it('retorna cliente pelo ID', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute(getCliente, '/api/clientes/1', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual(CLIENTE_BASICO);
  });

  it('retorna 404 se cliente não existe', async () => {
    // mockQueryResponse não configurado → retorna [] → first() → null

    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(getCliente, '/api/clientes/999', {}, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });

  it('retorna cliente com campos opcionais nulos', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_MINIMO);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<Record<string, unknown>>(getCliente, '/api/clientes/2', {}, ctx);

    expect(status).toBe(200);
    expect(data.cpf).toBeNull();
    expect(data.telefone).toBeNull();
    expect(data.email).toBeNull();
  });
});

// =============================================================================
// PUT /api/clientes/[id]  (atualizar)
// =============================================================================

describe('PUT /api/clientes/[id]', () => {
  it('atualiza nome do cliente', async () => {
    // Existe
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);
    // Retorno atualizado (segunda chamada de SELECT por ID)
    // Nota: ambas as queries fazem match em "select * from clientes where id"
    // Precisamos mockar com o dado atualizado — o mock retorna sempre o mesmo

    const updatedCliente = { ...CLIENTE_BASICO, nome: 'Lucas Atualizado' };

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { nome: 'Lucas Atualizado' },
    }, ctx);

    expect(status).toBe(200);

    // Verifica que o UPDATE foi executado
    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE clientes'));
    expect(updateQuery).toBeDefined();
  });

  it('atualiza todos os campos permitidos', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);
    // CPF check
    mockQueryResponse('select id from clientes where cpf', []);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: {
        nome: 'Lucas Novo',
        cpf: '11144477735',
        telefone: '11888888888',
        email: 'novo@email.com',
        data_nascimento: '1991-01-01',
        endereco: 'Rua Nova, 999',
        origem: 'trafego_google',
        observacoes: 'Updated',
      },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE clientes'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery!.params).toContain('Lucas Novo');
    expect(updateQuery!.params).toContain('11144477735');
    expect(updateQuery!.params).toContain('novo@email.com');
  });

  it('retorna 404 se cliente não existe', async () => {
    // Não mocka resposta → queryOne retorna null

    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(updateCliente, '/api/clientes/999', {
      method: 'PUT',
      body: { nome: 'Qualquer' },
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });

  it('permite atualização parcial (apenas email)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    const { status } = await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { email: 'novo_email@teste.com' },
    }, ctx);

    expect(status).toBe(200);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE clientes'));
    expect(updateQuery).toBeDefined();
  });

  it('trim e lowercase no email durante update', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { email: '  UPPER@Email.COM  ' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE clientes'));
    expect(updateQuery!.params).toContain('upper@email.com');
  });

  it('mantém campo como COALESCE(null, valor_original) quando não enviado', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);

    const ctx = createRouteContext({ id: '1' });
    await callRoute(updateCliente, '/api/clientes/1', {
      method: 'PUT',
      body: { observacoes: 'nova obs' },
    }, ctx);

    const queries = getExecutedQueries();
    const updateQuery = queries.find(q => q.sql.includes('UPDATE clientes'));
    // nome não enviado → null → COALESCE(null, nome) mantém valor original
    expect(updateQuery!.params[0]).toBeNull(); // nome = COALESCE(null, nome)
  });
});

// =============================================================================
// DELETE /api/clientes/[id]
// =============================================================================

describe('DELETE /api/clientes/[id]', () => {
  it('exclui cliente sem atendimentos (hard delete)', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_MINIMO);
    mockQueryResponse('select count(*) as count from atendimentos', [{ count: 0 }]);

    const ctx = createRouteContext({ id: '2' });
    const { status, data } = await callRoute<{ message: string }>(deleteCliente, '/api/clientes/2', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(200);
    expect(data.message).toBe('Cliente excluído com sucesso');

    // Verifica que o DELETE real foi executado
    const queries = getExecutedQueries();
    const deleteQuery = queries.find(q => q.sql.includes('DELETE FROM clientes'));
    expect(deleteQuery).toBeDefined();
    expect(deleteQuery!.params).toContain('2');
  });

  it('retorna 404 se cliente não existe', async () => {
    const ctx = createRouteContext({ id: '999' });
    const { status, data } = await callRoute<{ error: string }>(deleteCliente, '/api/clientes/999', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });

  it('bloqueia exclusão se tem atendimentos vinculados', async () => {
    mockQueryResponse('select * from clientes where id', CLIENTE_BASICO);
    mockQueryResponse('select count(*) as count from atendimentos', [{ count: 3 }]);

    const ctx = createRouteContext({ id: '1' });
    const { status, data } = await callRoute<{ error: string }>(deleteCliente, '/api/clientes/1', {
      method: 'DELETE',
    }, ctx);

    expect(status).toBe(409);
    expect(data.error).toBe('Não é possível excluir cliente com atendimentos vinculados');

    // Verifica que o DELETE NÃO foi executado
    const queries = getExecutedQueries();
    const deleteQuery = queries.find(q => q.sql.includes('DELETE FROM clientes'));
    expect(deleteQuery).toBeUndefined();
  });
});
