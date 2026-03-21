/**
 * Sprint 7 — Testes do proxy de arquivos R2
 *
 * Cobre: GET  /api/arquivos/[...path]
 *
 * O proxy serve arquivos diretamente do R2 com headers corretos.
 */

import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
  resetMockDb,
  mockR2Bucket,
  resetR2Store,
} from '../../helpers/db-mock';

import { GET as getArquivo } from '@/app/api/arquivos/[...path]/route';

beforeEach(() => {
  resetMockDb();
  resetR2Store();
  setupCloudflareContextMock();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

// Helper: Chama a rota diretamente já que callRoute parseia JSON mas aqui a resposta é binária
async function callProxy(pathSegments: string[], query = '') {
  const params = Promise.resolve({ path: pathSegments });
  const url = `http://localhost/api/arquivos/${pathSegments.join('/')}${query}`;
  const req = new Request(url, { method: 'GET' });
  return getArquivo(req as any, { params } as any);
}

// =============================================================================
// GET /api/arquivos/[...path]
// =============================================================================

describe('GET /api/arquivos/[...path]', () => {
  it('serve arquivo do R2 com Content-Type correto', async () => {
    await mockR2Bucket.put('execucao/3/12345.jpg', Buffer.from('FAKE_IMAGE'), {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { originalName: 'foto.jpg' },
    });

    const res = await callProxy(['execucao', '3', '12345.jpg']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('define Cache-Control público de 1 ano', async () => {
    await mockR2Bucket.put('execucao/3/abc.pdf', Buffer.from('PDF_CONTENT'), {
      httpMetadata: { contentType: 'application/pdf' },
    });

    const res = await callProxy(['execucao', '3', 'abc.pdf']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000');
  });

  it('define Content-Length correto', async () => {
    const data = Buffer.from('Hello World R2');
    await mockR2Bucket.put('teste/arquivo.txt', data, {
      httpMetadata: { contentType: 'text/plain' },
    });

    const res = await callProxy(['teste', 'arquivo.txt']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe(data.length.toString());
  });

  it('retorna 404 quando arquivo não existe no R2', async () => {
    const res = await callProxy(['execucao', '99', 'inexistente.jpg']);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Arquivo não encontrado');
  });

  it('usa Content-Disposition attachment quando ?download=true', async () => {
    await mockR2Bucket.put('execucao/3/ts123.pdf', Buffer.from('PDF'), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { originalName: 'receita-paciente.pdf' },
    });

    const res = await callProxy(['execucao', '3', 'ts123.pdf'], '?download=true');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="receita-paciente.pdf"');
  });

  it('usa nome do key como fallback no download sem customMetadata', async () => {
    await mockR2Bucket.put('execucao/3/file123.jpg', Buffer.from('IMG'), {
      httpMetadata: { contentType: 'image/jpeg' },
      // sem customMetadata
    });

    const res = await callProxy(['execucao', '3', 'file123.jpg'], '?download=true');

    expect(res.status).toBe(200);
    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('file123.jpg');
  });

  it('não define Content-Disposition sem ?download=true', async () => {
    await mockR2Bucket.put('execucao/3/img.png', Buffer.from('PNG'), {
      httpMetadata: { contentType: 'image/png' },
    });

    const res = await callProxy(['execucao', '3', 'img.png']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBeNull();
  });

  it('junta múltiplos segmentos de path corretamente', async () => {
    await mockR2Bucket.put('a/b/c/d.txt', Buffer.from('NESTED'), {
      httpMetadata: { contentType: 'text/plain' },
    });

    const res = await callProxy(['a', 'b', 'c', 'd.txt']);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('NESTED');
  });

  it('usa application/octet-stream quando httpMetadata não tem contentType', async () => {
    await mockR2Bucket.put('execucao/3/data.bin', Buffer.from('BINARY'), {
      // sem httpMetadata
    });

    const res = await callProxy(['execucao', '3', 'data.bin']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('retorna corpo do arquivo corretamente', async () => {
    const conteudo = 'Conteúdo de teste do arquivo';
    await mockR2Bucket.put('docs/relatorio.txt', Buffer.from(conteudo), {
      httpMetadata: { contentType: 'text/plain' },
    });

    const res = await callProxy(['docs', 'relatorio.txt']);
    const text = await res.text();

    expect(text).toBe(conteudo);
  });

  it('funciona com path de segmento único', async () => {
    await mockR2Bucket.put('simples.pdf', Buffer.from('SIMPLE'), {
      httpMetadata: { contentType: 'application/pdf' },
    });

    const res = await callProxy(['simples.pdf']);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });
});
