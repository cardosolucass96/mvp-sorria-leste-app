import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { callRoute, createRouteContext } from '../../helpers/api-test-helper';
import {
  getExecutedQueries,
  mockQueryResponse,
  resetMockDb,
  setMockCloudflareEnv,
  setupCloudflareContextMock,
  teardownCloudflareContextMock,
} from '../../helpers/db-mock';

import { POST as renderTermoRoute } from '@/app/api/clientes/[id]/termos/[slug]/render/route';
import { POST as gerarTermoDigitalRoute } from '@/app/api/clientes/[id]/termos/[slug]/autentique/route';
import { GET as listarTermosDigitaisRoute } from '@/app/api/clientes/[id]/termos-digitais/route';
import { POST as webhookAutentiqueRoute } from '@/app/api/webhooks/autentique/route';
import type { TermoDigital } from '@/lib/types';

interface TermoCampoDraftResponse {
  key: string;
  source: string;
}

interface TermoRenderResponse {
  html: string;
  titulo: string;
  slug: string;
  placeholdersNaoEncontrados: string[];
  draft?: {
    campos: TermoCampoDraftResponse[];
    pendentes: string[];
    placeholdersUsados: string[];
  };
}

interface TermoDigitalGerado {
  documentoId: string;
  signaturePublicId: string;
  shortLink: string;
  status: string;
}

function mockJsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  }) as Promise<Response>;
}

function setupBaseSchemaMocks() {
  mockQueryResponse("select name from sqlite_master where type='table' and name='termos'", { name: 'termos' });
  mockQueryResponse("pragma table_info(termos)", [
    { name: 'id' },
    { name: 'slug' },
    { name: 'titulo' },
    { name: 'conteudo_html' },
    { name: 'ativo' },
    { name: 'permite_autentique' },
    { name: 'created_by' },
    { name: 'updated_by' },
  ]);
  mockQueryResponse('pragma table_info(unidades)', [
    { name: 'id' },
    { name: 'nome' },
    { name: 'razao_social' },
    { name: 'cnpj' },
    { name: 'endereco' },
    { name: 'telefone' },
    { name: 'email' },
    { name: 'responsavel' },
    { name: 'recibo_rodape' },
  ]);
}

function setupClienteTermoMocks(
  html = '<p>Paciente: {{cliente_nome}}</p><p>Profissional: {{profissional_nome}}</p>',
  overrides?: Record<string, unknown>
) {
  setupBaseSchemaMocks();

  mockQueryResponse('select id from clientes where id', { id: 1 });
  mockQueryResponse('select * from clientes where id', {
    id: 1,
    nome: 'Maria Teste',
    cpf: '12345678910',
    telefone: '85999999999',
    email: 'maria@example.com',
    data_nascimento: '1990-01-20',
    endereco: 'Rua Exemplo, 10',
    origem: 'indicacao',
    sexo: 'feminino',
    plano_odontologico: 'Clin',
    observacoes: null,
    created_at: '2026-07-10T12:00:00.000Z',
  });
  mockQueryResponse('from termos where slug', {
    id: 99,
    slug: 'termo-consentimento',
    titulo: 'Termo de Consentimento',
    conteudo_html: html,
    ativo: 1,
    permite_autentique: 1,
    created_by: 1,
    updated_by: 1,
    created_at: '2026-07-10T12:00:00.000Z',
    updated_at: '2026-07-10T12:00:00.000Z',
    ...overrides,
  });
  mockQueryResponse('from unidades where id = ?', {
    id: 1,
    nome: 'Barra do Ceará',
    razao_social: 'Clínica Sorria Leste Ltda.',
    cnpj: '46261849000110',
    endereco: 'Avenida Presidente Castelo Branco, 5185 B',
    telefone: '85991234567',
    email: 'barra@sorrialeste.com',
    responsavel: 'Responsável Teste',
    recibo_rodape: 'Rodapé Teste',
    ativo: 1,
    created_at: '2026-07-10T12:00:00.000Z',
  });
}

beforeEach(() => {
  resetMockDb();
  setupCloudflareContextMock();
  setMockCloudflareEnv({
    AUTENTIQUE_API_TOKEN: 'autentique-token-teste',
    AUTENTIQUE_WEBHOOK_SECRET: 'autentique-webhook-secret',
    AUTENTIQUE_FOLDER_ID_VILA_UNIAO: 'folder-vila-uniao',
    AUTENTIQUE_FOLDER_ID_BARRA_DO_CEARA: 'folder-barra-do-ceara',
    AUTENTIQUE_FOLDER_ID_PIRAMBU: 'folder-pirambu',
  });
  jest.restoreAllMocks();
});

afterEach(() => {
  teardownCloudflareContextMock();
});

describe('termos digitais do cliente', () => {
  it('retorna draft no render do termo', async () => {
    setupClienteTermoMocks('<p>{{cliente_nome}}</p><p>{{campo_livre}}</p>');

    const { status, data } = await callRoute<TermoRenderResponse>(
      renderTermoRoute,
      '/api/clientes/1/termos/termo-consentimento/render',
      { method: 'POST' },
      createRouteContext({ id: '1', slug: 'termo-consentimento' })
    );

    expect(status).toBe(200);
    expect(data.draft?.campos).toEqual([
      expect.objectContaining({ key: 'cliente_nome', source: 'cliente' }),
      expect.objectContaining({ key: 'campo_livre', source: 'manual' }),
    ]);
    expect(data.draft?.pendentes).toContain('campo_livre');
  });

  it('cria termo digital no Autentique e persiste snapshot local', async () => {
    setupClienteTermoMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.body).toBeInstanceOf(FormData);
        const operations = JSON.parse(String((init?.body as FormData).get('operations')));
        expect(String(operations.query)).toContain('action {');
        expect(String(operations.query)).toContain('link {');
        expect(String(operations.query)).toContain('folder_id: $folder_id');
        expect(operations.variables.document).toEqual({ name: 'Termo de Consentimento - Maria Teste' });
        expect(operations.variables.folder_id).toBe('folder-barra-do-ceara');
        expect(operations.variables.signers).toEqual([
          expect.objectContaining({
            name: 'Maria Teste',
            action: 'SIGN',
            delivery_method: 'DELIVERY_METHOD_LINK',
            configs: { cpf: '12345678910' },
          }),
        ]);
        return mockJsonResponse({
          data: {
            createDocument: {
              id: 'doc-autentique-1',
              name: 'Termo de Consentimento - Maria Teste',
              signatures: [
                { public_id: 'signature-owner', action: null, link: null },
                { public_id: 'signature-1', action: { name: 'SIGN' }, link: null },
              ],
            },
          },
        });
      })
      .mockImplementationOnce(async () => mockJsonResponse({
        data: {
          createLinkToSignature: {
            short_link: 'https://assina.ae/assinatura-1',
          },
        },
      }));

    const { status, data } = await callRoute<TermoDigitalGerado>(
      gerarTermoDigitalRoute,
      '/api/clientes/1/termos/termo-consentimento/autentique',
      {
        method: 'POST',
        body: { placeholders: { profissional_nome: 'Dra. Helena' } },
      },
      createRouteContext({ id: '1', slug: 'termo-consentimento' })
    );

    expect(status).toBe(201);
    expect(data).toEqual({
      documentoId: 'doc-autentique-1',
      signaturePublicId: 'signature-1',
      shortLink: 'https://assina.ae/assinatura-1',
      status: 'criado',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const insertQuery = getExecutedQueries().find((query) => query.sql.includes('INSERT INTO termos_digitais'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.params).toEqual(expect.arrayContaining([
      'doc-autentique-1',
      'signature-1',
      'https://assina.ae/assinatura-1',
    ]));
  });

  it('usa o link retornado na criação quando o Autentique já devolve a assinatura acionável', async () => {
    setupClienteTermoMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(async () => mockJsonResponse({
        data: {
          createDocument: {
            id: 'doc-autentique-2',
            name: 'Termo de Consentimento - Maria Teste',
            signatures: [
              { public_id: 'signature-owner', action: null, link: null },
              {
                public_id: 'signature-2',
                action: { name: 'SIGN' },
                link: { short_link: 'https://assina.ae/assinatura-2' },
              },
            ],
          },
        },
      }));

    const { status, data } = await callRoute<TermoDigitalGerado>(
      gerarTermoDigitalRoute,
      '/api/clientes/1/termos/termo-consentimento/autentique',
      {
        method: 'POST',
        body: { placeholders: { profissional_nome: 'Dra. Helena' } },
      },
      createRouteContext({ id: '1', slug: 'termo-consentimento' })
    );

    expect(status).toBe(201);
    expect(data).toEqual({
      documentoId: 'doc-autentique-2',
      signaturePublicId: 'signature-2',
      shortLink: 'https://assina.ae/assinatura-2',
      status: 'criado',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('envia o folder_id da unidade atual quando a pasta do Autentique está configurada', async () => {
    setupClienteTermoMocks('<p>{{cliente_nome}}</p>', { titulo: 'Termo da Unidade' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });

    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(async (_input, init) => {
        const operations = JSON.parse(String((init?.body as FormData).get('operations')));
        expect(String(operations.query)).toContain('$folder_id: UUID');
        expect(operations.variables.document).toEqual({ name: 'Termo da Unidade - Maria Teste' });
        expect(operations.variables.folder_id).toBe('folder-barra-do-ceara');
        return mockJsonResponse({
          data: {
            createDocument: {
              id: 'doc-autentique-folder',
              name: 'Termo da Unidade - Maria Teste',
              signatures: [
                { public_id: 'signature-folder', action: { name: 'SIGN' }, link: { short_link: 'https://assina.ae/folder' } },
              ],
            },
          },
        });
      });

    const { status } = await callRoute<TermoDigitalGerado>(
      gerarTermoDigitalRoute,
      '/api/clientes/1/termos/termo-consentimento/autentique',
      {
        method: 'POST',
        body: { placeholders: {} },
      },
      createRouteContext({ id: '1', slug: 'termo-consentimento' })
    );

    expect(status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('bloqueia geração digital quando ainda há campos pendentes', async () => {
    setupClienteTermoMocks('<p>{{cliente_nome}}</p><p>{{campo_livre}}</p>');
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { status, data } = await callRoute<{ error: string; pendentes: string[] }>(
      gerarTermoDigitalRoute,
      '/api/clientes/1/termos/termo-consentimento/autentique',
      { method: 'POST', body: { placeholders: {} } },
      createRouteContext({ id: '1', slug: 'termo-consentimento' })
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Preencha todos os campos pendentes');
    expect(data.pendentes).toContain('campo_livre');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('bloqueia termo marcado somente para impressão no fluxo digital', async () => {
    setupClienteTermoMocks('<p>Referência somente impressão</p>', {
      slug: 'referencia-implante',
      titulo: 'Referência implante',
      permite_autentique: 0,
    });
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { status, data } = await callRoute<{ error: string }>(
      gerarTermoDigitalRoute,
      '/api/clientes/1/termos/referencia-implante/autentique',
      { method: 'POST', body: { placeholders: {} } },
      createRouteContext({ id: '1', slug: 'referencia-implante' })
    );

    expect(status).toBe(400);
    expect(data.error).toBe('Este termo está disponível apenas para impressão.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lista termos digitais do cliente', async () => {
    setupBaseSchemaMocks();
    mockQueryResponse('select id from clientes where id', { id: 1 });
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });
    mockQueryResponse('from termos_digitais', [{
      id: 7,
      cliente_id: 1,
      unidade_id: 1,
      termo_id: 99,
      termo_slug: 'termo-consentimento',
      termo_titulo: 'Termo de Consentimento',
      signatario_nome: 'Maria Teste',
      signatario_cpf: '12345678910',
      signatario_email: 'maria@example.com',
      signatario_telefone: '85999999999',
      placeholders_json: '{"profissional_nome":"Dra. Helena"}',
      html_renderizado: '<p>ok</p>',
      autentique_document_id: 'doc-autentique-1',
      autentique_signature_public_id: 'signature-1',
      autentique_short_link: 'https://assina.ae/assinatura-1',
      status: 'criado',
      pdf_assinado_url: null,
      viewed_at: null,
      signed_at: null,
      rejected_at: null,
      finished_at: null,
      created_by: 1,
      created_at: '2026-07-18T12:00:00.000Z',
      updated_at: '2026-07-18T12:00:00.000Z',
    }]);

    const { status, data } = await callRoute<TermoDigital[]>(
      listarTermosDigitaisRoute,
      '/api/clientes/1/termos-digitais',
      {},
      createRouteContext({ id: '1' })
    );

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].autentique_short_link).toBe('https://assina.ae/assinatura-1');
  });
});

describe('webhook do Autentique', () => {
  it('aceita webhook com HMAC válido e atualiza status de assinatura', async () => {
    setupBaseSchemaMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });
    mockQueryResponse('select * from termos_digitais where autentique_signature_public_id', {
      id: 7,
      cliente_id: 1,
      unidade_id: 1,
      termo_id: 99,
      termo_slug: 'termo-consentimento',
      termo_titulo: 'Termo de Consentimento',
      signatario_nome: 'Maria Teste',
      signatario_cpf: '12345678910',
      signatario_email: 'maria@example.com',
      signatario_telefone: '85999999999',
      placeholders_json: '{}',
      html_renderizado: '<p>ok</p>',
      autentique_document_id: 'doc-autentique-1',
      autentique_signature_public_id: 'signature-1',
      autentique_short_link: 'https://assina.ae/assinatura-1',
      status: 'criado',
      pdf_assinado_url: null,
      viewed_at: null,
      signed_at: null,
      rejected_at: null,
      finished_at: null,
      created_by: 1,
      created_at: '2026-07-18T12:00:00.000Z',
      updated_at: '2026-07-18T12:00:00.000Z',
    });

    const rawBody = JSON.stringify({
      event: {
        id: 'event-1',
        type: 'signature.accepted',
        created_at: '2026-07-18T13:00:00.000Z',
        data: {
          object: {
            public_id: 'signature-1',
            signed: '2026-07-18T12:59:00.000Z',
          },
        },
      },
    });
    const signature = createHmac('sha256', 'autentique-webhook-secret').update(rawBody).digest('hex');
    const request = new NextRequest('http://localhost:3000/api/webhooks/autentique', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-autentique-signature': signature,
      },
      body: rawBody,
    });

    const response = await webhookAutentiqueRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.received).toBe(true);

    const updateQuery = getExecutedQueries().find((query) => query.sql.includes('UPDATE termos_digitais'));
    expect(updateQuery?.params?.[0]).toBe('assinado');
    expect(updateQuery?.params?.[3]).toBe('2026-07-18T12:59:00.000Z');
  });

  it('rejeita webhook com assinatura inválida', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/autentique', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-autentique-signature': 'assinatura-invalida',
      },
      body: JSON.stringify({ event: { id: 'event-x', type: 'signature.created', data: { object: {} } } }),
    });

    const response = await webhookAutentiqueRoute(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toContain('Assinatura');
  });

  it('ignora evento duplicado', async () => {
    setupBaseSchemaMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });
    mockQueryResponse('select id from autentique_webhook_events where event_id', { id: 42 });

    const rawBody = JSON.stringify({
      event: {
        id: 'event-duplicado',
        type: 'signature.viewed',
        created_at: '2026-07-18T13:00:00.000Z',
        data: { object: { public_id: 'signature-1' } },
      },
    });
    const signature = createHmac('sha256', 'autentique-webhook-secret').update(rawBody).digest('hex');
    const request = new NextRequest('http://localhost:3000/api/webhooks/autentique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autentique-signature': signature },
      body: rawBody,
    });

    const response = await webhookAutentiqueRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.duplicate).toBe(true);
  });

  it('salva PDF assinado ao receber document.finished', async () => {
    setupBaseSchemaMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });
    mockQueryResponse('select * from termos_digitais where autentique_document_id', {
      id: 7,
      cliente_id: 1,
      unidade_id: 1,
      termo_id: 99,
      termo_slug: 'termo-consentimento',
      termo_titulo: 'Termo de Consentimento',
      signatario_nome: 'Maria Teste',
      signatario_cpf: '12345678910',
      signatario_email: 'maria@example.com',
      signatario_telefone: '85999999999',
      placeholders_json: '{}',
      html_renderizado: '<p>ok</p>',
      autentique_document_id: 'doc-autentique-1',
      autentique_signature_public_id: 'signature-1',
      autentique_short_link: 'https://assina.ae/assinatura-1',
      status: 'assinado',
      pdf_assinado_url: null,
      viewed_at: '2026-07-18T12:30:00.000Z',
      signed_at: '2026-07-18T12:40:00.000Z',
      rejected_at: null,
      finished_at: null,
      created_by: 1,
      created_at: '2026-07-18T12:00:00.000Z',
      updated_at: '2026-07-18T12:40:00.000Z',
    });

    const rawBody = JSON.stringify({
      event: {
        id: 'event-finished',
        type: 'document.finished',
        created_at: '2026-07-18T14:00:00.000Z',
        data: {
          object: {
            id: 'doc-autentique-1',
            files: {
              signed: 'https://painel.autentique.com.br/documentos/doc-autentique-1/assinado.pdf',
            },
          },
        },
      },
    });
    const signature = createHmac('sha256', 'autentique-webhook-secret').update(rawBody).digest('hex');
    const request = new NextRequest('http://localhost:3000/api/webhooks/autentique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autentique-signature': signature },
      body: rawBody,
    });

    const response = await webhookAutentiqueRoute(request);

    expect(response.status).toBe(200);
    const updateQuery = getExecutedQueries().find((query) => query.sql.includes('UPDATE termos_digitais'));
    expect(updateQuery?.params?.[0]).toBe('concluido');
    expect(updateQuery?.params?.[1]).toBe('https://painel.autentique.com.br/documentos/doc-autentique-1/assinado.pdf');
  });

  it('não rebaixa status concluído quando eventos chegam fora de ordem', async () => {
    setupBaseSchemaMocks();
    mockQueryResponse("select name from sqlite_master where type='table' and name='termos_digitais'", { name: 'termos_digitais' });
    mockQueryResponse("select name from sqlite_master where type='table' and name='autentique_webhook_events'", { name: 'autentique_webhook_events' });
    mockQueryResponse('select * from termos_digitais where autentique_signature_public_id', {
      id: 7,
      cliente_id: 1,
      unidade_id: 1,
      termo_id: 99,
      termo_slug: 'termo-consentimento',
      termo_titulo: 'Termo de Consentimento',
      signatario_nome: 'Maria Teste',
      signatario_cpf: '12345678910',
      signatario_email: 'maria@example.com',
      signatario_telefone: '85999999999',
      placeholders_json: '{}',
      html_renderizado: '<p>ok</p>',
      autentique_document_id: 'doc-autentique-1',
      autentique_signature_public_id: 'signature-1',
      autentique_short_link: 'https://assina.ae/assinatura-1',
      status: 'concluido',
      pdf_assinado_url: 'https://painel.autentique.com.br/documentos/doc-autentique-1/assinado.pdf',
      viewed_at: '2026-07-18T12:30:00.000Z',
      signed_at: '2026-07-18T12:40:00.000Z',
      rejected_at: null,
      finished_at: '2026-07-18T12:45:00.000Z',
      created_by: 1,
      created_at: '2026-07-18T12:00:00.000Z',
      updated_at: '2026-07-18T12:45:00.000Z',
    });

    const rawBody = JSON.stringify({
      event: {
        id: 'event-viewed-after-finished',
        type: 'signature.viewed',
        created_at: '2026-07-18T15:00:00.000Z',
        data: { object: { public_id: 'signature-1', viewed: '2026-07-18T12:20:00.000Z' } },
      },
    });
    const signature = createHmac('sha256', 'autentique-webhook-secret').update(rawBody).digest('hex');
    const request = new NextRequest('http://localhost:3000/api/webhooks/autentique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autentique-signature': signature },
      body: rawBody,
    });

    const response = await webhookAutentiqueRoute(request);

    expect(response.status).toBe(200);
    const updateQuery = getExecutedQueries().find((query) => query.sql.includes('UPDATE termos_digitais'));
    expect(updateQuery?.params?.[0]).toBe('concluido');
  });
});
