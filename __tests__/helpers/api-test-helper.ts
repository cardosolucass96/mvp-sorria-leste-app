/**
 * Helper para testar route handlers do Next.js App Router.
 *
 * Permite chamar os handlers diretamente (sem HTTP real)
 * construindo Request/NextRequest e parseando a Response.
 */

import { NextRequest } from 'next/server';

interface CallRouteOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: Record<string, unknown> | FormData;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
}

interface RouteResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

/**
 * Chama um route handler do Next.js App Router diretamente.
 *
 * @example
 * ```ts
 * import { GET, POST } from '@/app/api/clientes/route';
 * 
 * const { status, data } = await callRoute(GET, '/api/clientes', { method: 'GET' });
 * const { status, data } = await callRoute(POST, '/api/clientes', {
 *   method: 'POST',
 *   body: { nome: 'Teste', origem: 'fachada' }
 * });
 * ```
 */
export async function callRoute<T = unknown>(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
  path: string,
  options: CallRouteOptions = {},
  routeContext?: unknown
): Promise<RouteResponse<T>> {
  const { method = 'GET', body, searchParams, headers: customHeaders } = options;

  // Construir URL
  const url = new URL(path, 'http://localhost:3000');
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  // Construir headers
  const headers: Record<string, string> = {
    ...customHeaders,
  };

  // Construir body
  let requestBody: string | FormData | undefined;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  } else if (body instanceof FormData) {
    requestBody = body;
  }

  // Criar Request
  const request = new NextRequest(url.toString(), {
    method,
    headers,
    body: method !== 'GET' ? requestBody : undefined,
  });

  // Chamar handler
  const response = await handler(request, routeContext);

  // Parsear resposta
  let data: T;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json() as T;
  } else {
    data = (await response.text()) as unknown as T;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

/**
 * Cria context params para rotas dinâmicas do Next.js App Router.
 *
 * @example
 * ```ts
 * import { GET } from '@/app/api/clientes/[id]/route';
 * 
 * const ctx = createRouteContext({ id: '1' });
 * const { data } = await callRoute(GET, '/api/clientes/1', {}, ctx);
 * ```
 */
export function createRouteContext(params: Record<string, string | string[]>) {
  return { params: Promise.resolve(params) };
}

/**
 * Cria um FormData simulado para upload de arquivos.
 */
export function createMockFormData(fields: Record<string, string | Blob>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}
