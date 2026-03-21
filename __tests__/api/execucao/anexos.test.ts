/**
 * Sprint 7 — Testes de anexos de execução (upload R2)
 *
 * Cobre: GET    /api/execucao/item/[id]/anexos
 *        POST   /api/execucao/item/[id]/anexos  (upload → R2 + banco)
 *        DELETE  /api/execucao/item/[id]/anexos?anexo_id=X  (remove R2 + banco)
 */

import { callRoute, createRouteContext, createMockFormData } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockQueryResponse,
  setLastInsertId,
  getExecutedQueries,
  resetR2Store,
  getR2Store,
  mockR2Bucket,
} from '../../helpers/db-mock';

import {
  GET as listAnexos,
  POST as uploadAnexo,
  DELETE as deleteAnexo,
} from '@/app/api/execucao/item/[id]/anexos/route';

beforeEach(() => {
  resetMockDb();
  resetR2Store();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

const ANEXO_EXEMPLO = {
  id: 1,
  item_atendimento_id: 3,
  usuario_id: 4,
  nome_arquivo: 'foto-dente.jpg',
  tipo_arquivo: 'image/jpeg',
  caminho: 'execucao/3/1234567890.jpg',
  tamanho: 50000,
  descricao: 'Foto antes do procedimento',
  created_at: '2025-02-10 15:00:00',
  usuario_nome: 'Dr. Carlos Executor',
};

// =============================================================================
// GET /api/execucao/item/[id]/anexos
// =============================================================================

describe('GET /api/execucao/item/[id]/anexos', () => {
  it('retorna lista de anexos com usuario_nome', async () => {
    mockQueryResponse('from anexos_execucao a', [ANEXO_EXEMPLO]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listAnexos, '/api/execucao/item/3/anexos', {}, ctx);

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].nome_arquivo).toBe('foto-dente.jpg');
    expect(data[0].usuario_nome).toBe('Dr. Carlos Executor');
  });

  it('retorna lista vazia', async () => {
    mockQueryResponse('from anexos_execucao a', []);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute(listAnexos, '/api/execucao/item/3/anexos', {}, ctx);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('ordena por created_at DESC', async () => {
    mockQueryResponse('from anexos_execucao a', []);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(listAnexos, '/api/execucao/item/3/anexos', {}, ctx);

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('ORDER BY a.created_at DESC');
  });

  it('filtra por item_atendimento_id', async () => {
    mockQueryResponse('from anexos_execucao a', []);

    const ctx = createRouteContext({ id: '3' });
    await callRoute(listAnexos, '/api/execucao/item/3/anexos', {}, ctx);

    const queries = getExecutedQueries();
    expect(queries[0].sql).toContain('a.item_atendimento_id = ?');
    expect(queries[0].params[0]).toBe(3);
  });
});

// =============================================================================
// POST /api/execucao/item/[id]/anexos  (upload)
// =============================================================================

describe('POST /api/execucao/item/[id]/anexos', () => {
  const createFile = (name: string, type: string, sizeBytes: number) => {
    const buffer = new ArrayBuffer(sizeBytes);
    return new File([buffer], name, { type });
  };

  it('faz upload de imagem JPEG com sucesso', async () => {
    setLastInsertId(10);

    const file = createFile('foto.jpg', 'image/jpeg', 5000);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');
    formData.append('descricao', 'Foto do procedimento');

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ id: number; caminho: string; message: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(201);
    expect(data.id).toBe(10);
    expect(data.caminho).toMatch(/^execucao\/3\/\d+\.jpg$/);
    expect(data.message).toBe('Arquivo enviado com sucesso');
  });

  it('salva arquivo no R2', async () => {
    setLastInsertId(11);

    const file = createFile('doc.pdf', 'application/pdf', 3000);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);

    // Verifica que algo foi salvo no R2
    const store = getR2Store();
    expect(store.size).toBe(1);
    const key = Array.from(store.keys())[0];
    expect(key).toMatch(/^execucao\/3\/\d+\.pdf$/);
  });

  it('registra metadados no banco', async () => {
    setLastInsertId(12);

    const file = createFile('imagem.png', 'image/png', 8000);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');
    formData.append('descricao', 'Radiografia');

    const ctx = createRouteContext({ id: '3' });
    await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO anexos_execucao'));
    expect(insertQ).toBeDefined();
    expect(insertQ!.params[0]).toBe(3);            // item_atendimento_id
    expect(insertQ!.params[1]).toBe(4);            // usuario_id
    expect(insertQ!.params[2]).toBe('imagem.png');  // nome_arquivo
    expect(insertQ!.params[3]).toBe('image/png');   // tipo_arquivo
    expect(insertQ!.params[6]).toBe('Radiografia'); // descricao
  });

  it('aceita imagem PNG', async () => {
    setLastInsertId(13);
    const file = createFile('a.png', 'image/png', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita imagem GIF', async () => {
    setLastInsertId(14);
    const file = createFile('a.gif', 'image/gif', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita imagem WebP', async () => {
    setLastInsertId(15);
    const file = createFile('a.webp', 'image/webp', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita vídeo MP4', async () => {
    setLastInsertId(16);
    const file = createFile('video.mp4', 'video/mp4', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita vídeo WebM', async () => {
    setLastInsertId(17);
    const file = createFile('video.webm', 'video/webm', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita PDF', async () => {
    setLastInsertId(18);
    const file = createFile('doc.pdf', 'application/pdf', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('aceita DOC/DOCX', async () => {
    setLastInsertId(19);
    const file = createFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('rejeita tipo de arquivo não permitido (exe)', async () => {
    const file = createFile('virus.exe', 'application/x-msdownload', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Tipo de arquivo não permitido');
  });

  it('rejeita tipo text/plain', async () => {
    const file = createFile('nota.txt', 'text/plain', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(400);
  });

  it('rejeita arquivo de imagem maior que 10MB', async () => {
    const size11MB = 11 * 1024 * 1024;
    const file = createFile('grande.jpg', 'image/jpeg', size11MB);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Arquivo muito grande');
    expect(data.error).toContain('10MB');
  });

  it('rejeita vídeo maior que 50MB', async () => {
    const size51MB = 51 * 1024 * 1024;
    const file = createFile('video.mp4', 'video/mp4', size51MB);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Arquivo muito grande');
    expect(data.error).toContain('50MB');
  });

  it('aceita vídeo de exatamente 50MB', async () => {
    setLastInsertId(20);
    const size50MB = 50 * 1024 * 1024;
    const file = createFile('video.mp4', 'video/mp4', size50MB);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);
    expect(status).toBe(201);
  });

  it('rejeita sem arquivo', async () => {
    const formData = new FormData();
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Arquivo é obrigatório');
  });

  it('rejeita sem usuario_id', async () => {
    const file = createFile('foto.jpg', 'image/jpeg', 100);
    const formData = new FormData();
    formData.append('arquivo', file);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      uploadAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Usuário é obrigatório');
  });

  it('gera chave R2 com pattern correto: execucao/{id}/{timestamp}.{ext}', async () => {
    setLastInsertId(21);
    const file = createFile('documento.pdf', 'application/pdf', 500);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '7' });
    const { data } = await callRoute<{ caminho: string }>(
      uploadAnexo,
      '/api/execucao/item/7/anexos',
      { method: 'POST', body: formData },
      ctx
    );

    expect(data.caminho).toMatch(/^execucao\/7\/\d+\.pdf$/);
  });

  it('salva descricao quando fornecida', async () => {
    setLastInsertId(22);
    const file = createFile('foto.jpg', 'image/jpeg', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');
    formData.append('descricao', 'Foto pós-operatória');

    const ctx = createRouteContext({ id: '3' });
    await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO anexos_execucao'));
    expect(insertQ!.params[6]).toBe('Foto pós-operatória');
  });

  it('descricao é null quando não fornecida', async () => {
    setLastInsertId(23);
    const file = createFile('foto.jpg', 'image/jpeg', 100);
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('usuario_id', '4');

    const ctx = createRouteContext({ id: '3' });
    await callRoute(uploadAnexo, '/api/execucao/item/3/anexos', { method: 'POST', body: formData }, ctx);

    const queries = getExecutedQueries();
    const insertQ = queries.find(q => q.sql.includes('INSERT INTO anexos_execucao'));
    expect(insertQ!.params[6]).toBeNull();
  });
});

// =============================================================================
// DELETE /api/execucao/item/[id]/anexos?anexo_id=X
// =============================================================================

describe('DELETE /api/execucao/item/[id]/anexos', () => {
  it('remove anexo do banco e do R2', async () => {
    // Pré-insere no R2
    await mockR2Bucket.put('execucao/3/12345.jpg', Buffer.from('fake-image'));
    expect(getR2Store().size).toBe(1);

    mockQueryResponse('select caminho, item_atendimento_id from anexos_execucao', [
      { caminho: 'execucao/3/12345.jpg', item_atendimento_id: 3 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ message: string }>(
      deleteAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'DELETE', searchParams: { anexo_id: '1' } },
      ctx
    );

    expect(status).toBe(200);
    expect(data.message).toBe('Anexo removido com sucesso');

    // Verifica que removeu do R2
    expect(getR2Store().size).toBe(0);

    // Verifica que removeu do banco
    const queries = getExecutedQueries();
    const deleteQ = queries.find(q => q.sql.includes('DELETE FROM anexos_execucao'));
    expect(deleteQ).toBeDefined();
  });

  it('rejeita se anexo_id não fornecido', async () => {
    const ctx = createRouteContext({ id: '3' });
    const { status, data } = await callRoute<{ error: string }>(
      deleteAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'DELETE' },
      ctx
    );

    expect(status).toBe(400);
    expect(data.error).toBe('ID do anexo é obrigatório');
  });

  it('bloqueia se anexo pertence a outro item (ownership)', async () => {
    mockQueryResponse('select caminho, item_atendimento_id from anexos_execucao', [
      { caminho: 'execucao/5/99999.jpg', item_atendimento_id: 5 }, // pertence ao item 5
    ]);

    const ctx = createRouteContext({ id: '3' }); // tentando deletar do item 3
    const { status, data } = await callRoute<{ error: string }>(
      deleteAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'DELETE', searchParams: { anexo_id: '10' } },
      ctx
    );

    expect(status).toBe(403);
    expect(data.error).toBe('Anexo não pertence a este item');
  });

  it('remove do banco mesmo se R2 falhar (graceful degradation)', async () => {
    // Anexo sem caminho no R2 (ou caminho inválido)
    mockQueryResponse('select caminho, item_atendimento_id from anexos_execucao', [
      { caminho: 'inexistente/path.jpg', item_atendimento_id: 3 },
    ]);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      deleteAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'DELETE', searchParams: { anexo_id: '1' } },
      ctx
    );

    // Deve funcionar mesmo se o arquivo não existir no R2
    expect(status).toBe(200);
  });

  it('remove do banco quando anexo não encontrado no banco (delete silencioso)', async () => {
    // Nenhum resultado do SELECT
    mockQueryResponse('select caminho, item_atendimento_id from anexos_execucao', []);

    const ctx = createRouteContext({ id: '3' });
    const { status } = await callRoute(
      deleteAnexo,
      '/api/execucao/item/3/anexos',
      { method: 'DELETE', searchParams: { anexo_id: '999' } },
      ctx
    );

    // Route executa DELETE FROM mesmo sem resultado no SELECT
    expect(status).toBe(200);
  });
});
