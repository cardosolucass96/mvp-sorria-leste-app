/**
 * Sprint 5 — Testes do fluxo ortô (atendimentos com tipo_orto=true)
 *
 * Cobre: POST /api/atendimentos com tipo_orto
 *   - cria com status aguardando_pagamento
 *   - cria item automaticamente
 *   - aplicações de valor padrão / custom
 *   - validações de executor/procedimento/cliente
 */

import { callRoute } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
} from '../../helpers/db-mock';
import {
  CLIENTE_JOAO,
  USUARIO_EXECUTOR,
  USUARIO_AVALIADOR,
  PROC_LIMPEZA,
  PROC_RESTAURACAO,
  PROC_INATIVO,
  ATENDIMENTO_TRIAGEM,
} from '../../helpers/seed';

import { POST as createAtendimento } from '@/app/api/atendimentos/route';

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('POST /api/atendimentos — fluxo orto', () => {
  const baseBody = {
    cliente_id: 1,
    tipo_orto: true,
    executor_id: 4,
    procedimento_id: 1,
  };

  it('cria atendimento com status aguardando_pagamento', async () => {
    setLastInsertId(10);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza Dental' });
    mockQueryResponse('WHERE a.id = ?', {
      id: 10, cliente_id: 1, status: 'aguardando_pagamento',
      cliente_nome: 'João Silva', avaliador_nome: null,
    });

    const { status, data } = await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: baseBody,
    });

    expect(status).toBe(201);
    expect(data.status).toBe('aguardando_pagamento');
    expect(data.avaliador_nome).toBeNull();
  });

  it('insere no banco com avaliador_id NULL e observação "Atendimento Orto"', async () => {
    setLastInsertId(11);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza' });
    mockQueryResponse('WHERE a.id = ?', { id: 11, status: 'aguardando_pagamento' });

    await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: baseBody,
    });

    const queries = getExecutedQueries();
    const insertAt = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertAt!.sql).toContain("'aguardando_pagamento'");
    // NULL é inline no SQL, então params = [cliente_id, 'Atendimento Orto']
    expect(insertAt!.sql).toContain('NULL');
    expect(insertAt!.params[1]).toBe('Atendimento Orto');
  });

  it('cria item automaticamente com o procedimento e executor selecionados', async () => {
    setLastInsertId(12);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 2, valor: 300, nome: 'Restauração' });
    mockQueryResponse('WHERE a.id = ?', { id: 12, status: 'aguardando_pagamento' });

    await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { ...baseBody, procedimento_id: 2 },
    });

    const queries = getExecutedQueries();
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem).toBeDefined();
    expect(insertItem!.params[1]).toBe(2); // procedimento_id
    expect(insertItem!.params[2]).toBe(4); // executor_id
    expect(insertItem!.params[3]).toBe(4); // criado_por_id = executor_id
    expect(insertItem!.params[4]).toBe(300); // valor = procedimento.valor
  });

  it('usa valor_custom quando fornecido', async () => {
    setLastInsertId(13);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza' });
    mockQueryResponse('WHERE a.id = ?', { id: 13, status: 'aguardando_pagamento' });

    await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { ...baseBody, valor: 500 },
    });

    const queries = getExecutedQueries();
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem!.params[4]).toBe(500); // valor custom
  });

  it('usa valor do procedimento quando valor não especificado', async () => {
    setLastInsertId(14);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza' });
    mockQueryResponse('WHERE a.id = ?', { id: 14, status: 'aguardando_pagamento' });

    await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: baseBody, // sem valor
    });

    const queries = getExecutedQueries();
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem!.params[4]).toBe(150);
  });

  it('rejeita se executor_id não enviado', async () => {
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, tipo_orto: true, procedimento_id: 1 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Executor e procedimento são obrigatórios para atendimento orto');
  });

  it('rejeita se procedimento_id não enviado', async () => {
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, tipo_orto: true, executor_id: 4 },
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Executor e procedimento são obrigatórios para atendimento orto');
  });

  it('rejeita se executor não encontrado', async () => {
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    // executor não mockado → queryOne retorna null

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, tipo_orto: true, executor_id: 999, procedimento_id: 1 },
    });

    expect(status).toBe(404);
    expect(data.error).toBe('Executor não encontrado');
  });

  it('rejeita se procedimento não encontrado', async () => {
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    // procedimento não mockado → queryOne retorna null

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { cliente_id: 1, tipo_orto: true, executor_id: 4, procedimento_id: 999 },
    });

    expect(status).toBe(404);
    expect(data.error).toBe('Procedimento não encontrado');
  });

  it('rejeita se cliente não existe', async () => {
    // cliente não mockado → queryOne retorna null

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { ...baseBody, cliente_id: 999 },
    });

    expect(status).toBe(404);
    expect(data.error).toBe('Cliente não encontrado');
  });

  it('rejeita se cliente já tem atendimento aberto', async () => {
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 1 });

    const { status, data } = await callRoute<{ error: string }>(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: baseBody,
    });

    expect(status).toBe(400);
    expect(data.error).toBe('Cliente já possui atendimento em aberto');
  });

  it('item criado tem status "pendente" e quantidade 1', async () => {
    setLastInsertId(15);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza' });
    mockQueryResponse('WHERE a.id = ?', { id: 15, status: 'aguardando_pagamento' });

    await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: baseBody,
    });

    const queries = getExecutedQueries();
    const insertItem = queries.find(q => q.sql.includes('INSERT INTO itens_atendimento'));
    expect(insertItem!.sql).toContain("'pendente'"); // status inline no SQL
    expect(insertItem!.sql).toContain(', 1,'); // quantidade inline no SQL
  });

  it('não verifica avaliador no fluxo orto mesmo se avaliador_id enviado', async () => {
    setLastInsertId(16);
    mockQueryResponse('SELECT id FROM clientes WHERE id', { id: 1 });
    mockQueryResponse("status != 'finalizado'", { count: 0 });
    mockQueryResponse('SELECT id, role FROM usuarios WHERE id', { id: 4, role: 'executor' });
    mockQueryResponse('SELECT id, valor, nome FROM procedimentos', { id: 1, valor: 150, nome: 'Limpeza' });
    mockQueryResponse('WHERE a.id = ?', { id: 16, status: 'aguardando_pagamento' });

    // Envia avaliador_id mas é tipo_orto (deve ignorar validação de avaliador)
    const { status } = await callRoute(createAtendimento, '/api/atendimentos', {
      method: 'POST',
      body: { ...baseBody, avaliador_id: 3 },
    });

    expect(status).toBe(201);

    // Não deve ter query de validação do avaliador (o if verifica !tipo_orto)
    const queries = getExecutedQueries();
    // O atendimento deve ser criado com avaliador_id NULL (inline no SQL)
    const insertAt = queries.find(q => q.sql.includes('INSERT INTO atendimentos'));
    expect(insertAt!.sql).toContain('NULL');
  });
});
