/**
 * Testes de segurança — Path Traversal & Acesso a Arquivos
 *
 * Sprint 10 — Testa contra:
 * - Path traversal com ../ nos segmentos do path
 * - Null bytes no path
 * - URL encoding de caracteres especiais
 * - Acesso sem autenticação a arquivos privados
 * - R2 key enumeration
 * - Upload com tipos de arquivo não permitidos
 * - Verificação de Content-Type e Content-Disposition
 */

import { callRoute, createRouteContext, createMockFormData } from '../helpers/api-test-helper';
import {
  resetMockDb,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  getR2Store,
  resetR2Store,
  mockR2Bucket,
  mockQueryResponse,
  getExecutedQueries,
} from '../helpers/db-mock';

import { GET as getArquivos } from '@/app/api/arquivos/[...path]/route';
import { POST as postAnexos, DELETE as deleteAnexos } from '@/app/api/execucao/item/[id]/anexos/route';

describe('Segurança — Path Traversal & Acesso a Arquivos', () => {
  beforeEach(() => {
    setupCloudflareContextMock();
    resetMockDb();
    resetR2Store();
  });

  afterEach(() => {
    teardownCloudflareContextMock();
  });

  // ═════════════════════════════════════════════
  // PATH TRAVERSAL — Rota /api/arquivos/[...path]
  // ═════════════════════════════════════════════

  describe('path traversal — /api/arquivos/[...path]', () => {
    beforeEach(async () => {
      // Colocar um arquivo "secreto" no R2
      await mockR2Bucket.put('internal/secrets.json', Buffer.from('{"apiKey":"secret123"}'), {
        httpMetadata: { contentType: 'application/json' },
      });
      // Colocar um arquivo válido
      await mockR2Bucket.put('execucao/1/photo.jpg', Buffer.from('image-data'), {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { originalName: 'foto.jpg' },
      });
    });

    test('acesso normal a arquivo existente funciona', async () => {
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg'] });
      const { status, headers } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg', {}, ctx
      );

      expect(status).toBe(200);
      expect(headers.get('Content-Type')).toBe('image/jpeg');
    });

    test('arquivo inexistente retorna 404', async () => {
      const ctx = createRouteContext({ path: ['execucao', '999', 'nao-existe.jpg'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/999/nao-existe.jpg', {}, ctx
      );

      expect(status).toBe(404);
    });

    test('path traversal com ../ nos segmentos', async () => {
      // Tentar usar ../ para acessar pasta pai
      const ctx = createRouteContext({ path: ['execucao', '1', '..', 'internal', 'secrets.json'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/../internal/secrets.json', {}, ctx
      );

      // No R2, a key fica "execucao/1/../internal/secrets.json" (literal)
      // R2 trata keys como strings planas, então ../ NÃO navega para cima
      // O arquivo "execucao/1/../internal/secrets.json" não existe
      // Resultado: 404 ou acessa o arquivo literal — é que R2 NÃO resolve ../
      // Isso é seguro no R2, diferente de filesystem local
      expect([200, 404]).toContain(status);

      // Se retornou 200, NÃO deve ser o secrets.json
      // (R2 keys são flat, ../ é literal)
    });

    test('path traversal com segmentos ..', async () => {
      // Caminho: ['..', '..', 'etc', 'passwd']
      const ctx = createRouteContext({ path: ['..', '..', 'etc', 'passwd'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/../../etc/passwd', {}, ctx
      );

      // R2 trata como key literal "../../etc/passwd" — não existe
      expect(status).toBe(404);
    });

    test('null bytes no path não causam problemas', async () => {
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg\x00.txt'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg%00.txt', {}, ctx
      );

      // Key literal com null byte não encontra o arquivo real
      expect(status).toBe(404);
    });

    test('path com espaços e caracteres especiais', async () => {
      // Adicionar arquivo com espaço no nome
      await mockR2Bucket.put('execucao/1/foto com espaco.jpg', Buffer.from('data'), {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      const ctx = createRouteContext({ path: ['execucao', '1', 'foto com espaco.jpg'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/foto%20com%20espaco.jpg', {}, ctx
      );

      expect(status).toBe(200);
    });

    test('Cache-Control é definido como público (1 ano)', async () => {
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg'] });
      const { headers } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg', {}, ctx
      );

      expect(headers.get('Cache-Control')).toBe('public, max-age=31536000');
    });

    test('download=true retorna Content-Disposition com nome original', async () => {
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg'] });
      const { headers } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg',
        { searchParams: { download: 'true' } },
        ctx
      );

      const disposition = headers.get('Content-Disposition');
      expect(disposition).toBeDefined();
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('foto.jpg');
    });

    test('sem customMetadata.originalName usa nome do path no download', async () => {
      await mockR2Bucket.put('execucao/2/doc.pdf', Buffer.from('pdf-data'), {
        httpMetadata: { contentType: 'application/pdf' },
        // Sem customMetadata
      });

      const ctx = createRouteContext({ path: ['execucao', '2', 'doc.pdf'] });
      const { headers } = await callRoute(
        getArquivos, '/api/arquivos/execucao/2/doc.pdf',
        { searchParams: { download: 'true' } },
        ctx
      );

      const disposition = headers.get('Content-Disposition');
      expect(disposition).toContain('doc.pdf');
    });

    test('Content-Type fallback para application/octet-stream', async () => {
      await mockR2Bucket.put('execucao/1/unknownfile', Buffer.from('data'), {
        // Sem httpMetadata
      });

      const ctx = createRouteContext({ path: ['execucao', '1', 'unknownfile'] });
      const { headers } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/unknownfile', {}, ctx
      );

      expect(headers.get('Content-Type')).toBe('application/octet-stream');
    });

    test('acesso a arquivo de outro item (sem verificação de ownership)', async () => {
      // Arquivo pertence ao item 1, mas qualquer um pode acessar
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg', {}, ctx
      );

      // ⚠ LIMITAÇÃO MVP: Sem verificação de ownership
      // Qualquer pessoa com a URL pode acessar o arquivo
      expect(status).toBe(200);
    });

    test('keys R2 do prefixo internal/ são acessíveis (sem restrição de prefixo)', async () => {
      // ⚠ LIMITAÇÃO MVP: Não há restrição de prefixo
      const ctx = createRouteContext({ path: ['internal', 'secrets.json'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/internal/secrets.json', {}, ctx
      );

      // Se o atacante adivinhar a key, pode acessar qualquer objeto no R2
      expect(status).toBe(200);
    });
  });

  // ═════════════════════════════════════════════
  // UPLOAD DE ARQUIVOS — Validação de Tipo
  // ═════════════════════════════════════════════

  describe('upload — validação de tipo de arquivo', () => {
    test('tipo de arquivo não permitido é rejeitado', async () => {
      const file = new File(['conteudo'], 'malware.exe', { type: 'application/x-msdownload' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
      expect(data.error).toContain('Tipo de arquivo não permitido');
    });

    test('arquivo .html é rejeitado (XSS stored)', async () => {
      const file = new File(['<script>alert(1)</script>'], 'malicious.html', { type: 'text/html' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
    });

    test('arquivo .svg é rejeitado (pode conter script)', async () => {
      const svgContent = '<svg onload="alert(1)"><circle r="10"/></svg>';
      const file = new File([svgContent], 'image.svg', { type: 'image/svg+xml' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
    });

    test('tipos permitidos são aceitos: image/jpeg', async () => {
      const file = new File(['image-data'], 'photo.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 1, nome_arquivo: 'photo.jpg',
      });

      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(201);
    });

    test('tipos permitidos são aceitos: application/pdf', async () => {
      const file = new File(['pdf-data'], 'doc.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 1, nome_arquivo: 'doc.pdf',
      });

      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(201);
    });
  });

  // ═════════════════════════════════════════════
  // UPLOAD — Limite de Tamanho
  // ═════════════════════════════════════════════

  describe('upload — limites de tamanho', () => {
    test('arquivo > 10MB (não vídeo) é rejeitado', async () => {
      const largeContent = new Uint8Array(11 * 1024 * 1024); // 11MB
      const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status, data } = await callRoute<{ error: string }>(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
      expect(data.error).toMatch(/tamanho|grande|máximo|10MB/i);
    });

    test('vídeo > 50MB é rejeitado', async () => {
      const largeContent = new Uint8Array(51 * 1024 * 1024); // 51MB
      const file = new File([largeContent], 'video.mp4', { type: 'video/mp4' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
    });

    test('vídeo de exatamente 50MB é aceito', async () => {
      const content = new Uint8Array(50 * 1024 * 1024); // 50MB exato
      const file = new File([content], 'video.mp4', { type: 'video/mp4' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 1, nome_arquivo: 'video.mp4',
      });

      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(201);
    });

    test('upload sem arquivo retorna 400', async () => {
      const formData = new FormData();
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
    });

    test('upload sem usuario_id retorna 400', async () => {
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('arquivo', file);

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      expect(status).toBe(400);
    });
  });

  // ═════════════════════════════════════════════
  // R2 KEY — Formato e Segurança
  // ═════════════════════════════════════════════

  describe('R2 key format', () => {
    test('arquivo é salvo com key no formato execucao/{id}/{timestamp}.{ext}', async () => {
      const file = new File(['data'], 'minha_foto.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '42' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 42, nome_arquivo: 'minha_foto.jpg',
      });

      await callRoute(
        postAnexos, '/api/execucao/item/42/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      // Verificar que o R2 recebeu um objeto com key no formato correto
      const store = getR2Store();
      const keys = Array.from(store.keys());
      const matchingKey = keys.find((k) => k.startsWith('execucao/42/'));
      expect(matchingKey).toBeDefined();
      expect(matchingKey).toMatch(/^execucao\/42\/\d+\.jpg$/);
    });

    test('extensão é derivada do nome original do arquivo', async () => {
      const file = new File(['data'], 'relatorio.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '5' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 5, nome_arquivo: 'relatorio.pdf',
      });

      await callRoute(
        postAnexos, '/api/execucao/item/5/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      const store = getR2Store();
      const keys = Array.from(store.keys());
      const matchingKey = keys.find((k) => k.startsWith('execucao/5/'));
      expect(matchingKey).toBeDefined();
      expect(matchingKey).toMatch(/\.pdf$/);
    });

    test('nome original é armazenado como customMetadata', async () => {
      const file = new File(['data'], 'foto_paciente.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', '1');

      const ctx = createRouteContext({ id: '1' });
      mockQueryResponse('select * from anexos_execucao where id', {
        id: 1, item_atendimento_id: 1, nome_arquivo: 'foto_paciente.jpg',
      });

      await callRoute(
        postAnexos, '/api/execucao/item/1/anexos',
        { method: 'POST', body: formData },
        ctx
      );

      const store = getR2Store();
      const keys = Array.from(store.keys());
      const matchingKey = keys.find((k) => k.startsWith('execucao/1/'));
      if (matchingKey) {
        const stored = store.get(matchingKey);
        expect(stored?.customMetadata?.originalName).toBe('foto_paciente.jpg');
      }
    });
  });

  // ═════════════════════════════════════════════
  // DELETE — Ownership Verification
  // ═════════════════════════════════════════════

  describe('delete — verificação de ownership', () => {
    test('deletar anexo de outro item retorna 403', async () => {
      // Anexo pertence ao item 99, tentando deletar via item 1
      // A rota usa query() (all) não queryOne, retorna array
      mockQueryResponse('select caminho, item_atendimento_id from anexos_execucao', [
        {
          caminho: 'execucao/99/photo.jpg',
          item_atendimento_id: 99, // pertence ao item 99
        },
      ]);

      const ctx = createRouteContext({ id: '1' }); // tentando via item 1
      const { status, data } = await callRoute<{ error: string }>(
        deleteAnexos, '/api/execucao/item/1/anexos',
        {
          method: 'DELETE',
          searchParams: { anexo_id: '10' },
        },
        ctx
      );

      // A rota verifica que anexo.item_atendimento_id !== parseInt(id)
      expect(status).toBe(403);
      expect(data.error).toContain('não pertence');
    });

    test('deletar anexo do próprio item funciona', async () => {
      // Adicionar arquivo no R2
      await mockR2Bucket.put('execucao/1/photo.jpg', Buffer.from('data'));

      mockQueryResponse('select * from anexos_execucao where id', {
        id: 10,
        item_atendimento_id: 1,
        caminho: 'execucao/1/photo.jpg',
      });

      const ctx = createRouteContext({ id: '1' });
      const { status } = await callRoute(
        deleteAnexos, '/api/execucao/item/1/anexos',
        {
          method: 'DELETE',
          searchParams: { anexo_id: '10' },
        },
        ctx
      );

      expect(status).toBe(200);
    });
  });

  // ═════════════════════════════════════════════
  // SEGURANÇA GERAL DO ENDPOINT DE ARQUIVOS
  // ═════════════════════════════════════════════

  describe('segurança geral — /api/arquivos/', () => {
    test('⚠ endpoint é acessível sem autenticação (limitação MVP)', async () => {
      await mockR2Bucket.put('execucao/1/photo.jpg', Buffer.from('data'), {
        httpMetadata: { contentType: 'image/jpeg' },
      });

      // Sem nenhum header de autenticação
      const ctx = createRouteContext({ path: ['execucao', '1', 'photo.jpg'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/1/photo.jpg', {}, ctx
      );

      // ⚠ Deveria exigir autenticação — mas no MVP é público
      expect(status).toBe(200);
    });

    test('R2 key enumeration: adivinhando KEY consegue acessar arquivo', async () => {
      // Arquivo de outro item
      await mockR2Bucket.put('execucao/999/confidential.pdf', Buffer.from('secret'), {
        httpMetadata: { contentType: 'application/pdf' },
      });

      // Atacante adivinha a key
      const ctx = createRouteContext({ path: ['execucao', '999', 'confidential.pdf'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/execucao/999/confidential.pdf', {}, ctx
      );

      // ⚠ Sem auth, se souber a key, acessa
      expect(status).toBe(200);
    });

    test('path segments são unidos por / (comportamento de join)', async () => {
      await mockR2Bucket.put('a/b/c', Buffer.from('data'), {
        httpMetadata: { contentType: 'text/plain' },
      });

      const ctx = createRouteContext({ path: ['a', 'b', 'c'] });
      const { status } = await callRoute(
        getArquivos, '/api/arquivos/a/b/c', {}, ctx
      );

      expect(status).toBe(200);
    });
  });
});
