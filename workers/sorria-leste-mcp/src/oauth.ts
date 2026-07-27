import { getOAuthApi, OAuthProvider, type AuthRequest, type ClientInfo, type OAuthProviderOptions } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from 'agents/mcp';
import { createServer } from './mcp';
import { canAuthorizeScopes, grantedScopes, safeEqual, verifyPassword } from './security';
import type { AppUser, Env, WorkerExecutionContext } from './types';

type PropsExecutionContext = WorkerExecutionContext & { props?: Record<string, unknown> };

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie') ?? '';
  const match = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function securityHeaders(csrfToken: string, secure: boolean, formTargets: string[]): Headers {
  const allowedTargets = Array.from(new Set(formTargets.filter(Boolean))).join(' ');
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `form-action 'self' ${allowedTargets}`.trim(),
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
  });
  const prefix = secure ? '__Host-MCP_CSRF' : 'MCP_CSRF';
  headers.append('Set-Cookie', `${prefix}=${encodeURIComponent(csrfToken)}; HttpOnly; ${secure ? 'Secure; ' : ''}Path=/; SameSite=Lax; Max-Age=600`);
  return headers;
}

function readCsrf(request: Request): string | null {
  return cookieValue(request, '__Host-MCP_CSRF') ?? cookieValue(request, 'MCP_CSRF');
}

async function renderAuthorize(
  request: Request,
  env: Env,
  oauthRequest: AuthRequest,
  client: ClientInfo,
  error?: string,
): Promise<Response> {
  const url = new URL(request.url);
  const redirectUrl = new URL(oauthRequest.redirectUri);
  const csrfToken = crypto.randomUUID();
  const requestedScopes = oauthRequest.scope.length > 0 ? oauthRequest.scope.join(', ') : 'sorria.read';
  const hasFinancialRead = oauthRequest.scope.includes('sorria.finance.read');
  const hasWrite = oauthRequest.scope.includes('sorria.write');
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Autorizar Sorria Leste MCP</title><style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1f2937}label{display:block;margin-top:1rem;font-weight:600}input{box-sizing:border-box;width:100%;padding:.7rem;margin-top:.35rem}button{margin-top:1.5rem;padding:.75rem 1rem;background:#ea580c;color:#fff;border:0;border-radius:.4rem;font-weight:700}.notice{background:#fff7ed;padding:1rem;border-radius:.4rem}.error{color:#b91c1c}</style></head><body><h1>Autorizar acesso ao MCP</h1><p class="notice"><strong>${escapeHtml(client.clientName || client.clientId)}</strong> pediu acesso ao MCP Sorria Leste com o escopo <code>${escapeHtml(requestedScopes)}</code>.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<p>Leitura operacional e financeira seguem restritas a administradores previamente autorizados. Escrita V1 exige escopo próprio e libera apenas cadastro de cliente e agendamento de avaliação para contas autorizadas.</p>${hasFinancialRead ? '<p class="notice">Este pedido inclui leitura financeira. Use apenas em ambientes autorizados.</p>' : ''}${hasWrite ? '<p class="notice">Este pedido inclui escrita operacional mínima. Não libera prontuários, pagamentos, procedimentos, follow-ups nem anexos.</p>' : ''}<form method="post" action="/oauth/authorize"><input type="hidden" name="csrf_token" value="${csrfToken}"><input type="hidden" name="authorization_request" value="${escapeHtml(url.toString())}"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Senha</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Autorizar acesso</button></form></body></html>`;
  return new Response(body, {
    status: 200,
    headers: securityHeaders(csrfToken, url.protocol === 'https:', [
      url.origin,
      `${url.origin}/oauth/authorize`,
      redirectUrl.origin,
      redirectUrl.toString(),
    ]),
  });
}

async function authenticate(env: Env, email: string, password: string): Promise<AppUser | null> {
  const user = await env.DB.prepare(
    'SELECT id, nome, email, senha, role, ativo FROM usuarios WHERE email = ?',
  ).bind(email.trim().toLowerCase()).first<AppUser & { senha: string }>();
  if (!user || user.ativo !== 1) return null;
  return (await verifyPassword(password, user.senha)) ? user : null;
}

const apiHandler = {
  async fetch(request: Request, env: Env, context: WorkerExecutionContext) {
    const contextProps = (context as PropsExecutionContext).props;
    const props = contextProps && typeof contextProps === 'object' ? contextProps : {};
    return createMcpHandler(createServer(env, props), {
      route: '/mcp',
      authContext: { props },
    })(request, env, context as never);
  },
};

const defaultHandler = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const oauth = getOAuthApi(options, env);

    if (url.pathname === '/healthz') {
      return Response.json({ status: 'ok', service: 'sorria-leste-mcp' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (url.pathname !== '/oauth/authorize') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      const client = await oauth.lookupClient(authRequest.clientId);
      if (!client || !grantedScopes(authRequest.scope)) return new Response('Cliente ou escopo não autorizado.', { status: 400 });
      return renderAuthorize(request, env, authRequest, client);
    }

    if (request.method === 'POST') {
      const form = await request.formData();
      const formToken = String(form.get('csrf_token') ?? '');
      const cookieToken = readCsrf(request) ?? '';
      const originalUrl = String(form.get('authorization_request') ?? '');
      const email = String(form.get('email') ?? '');
      const password = String(form.get('password') ?? '');
      if (!safeEqual(formToken, cookieToken) || !originalUrl.startsWith(url.origin)) {
        return new Response('Solicitação de autorização inválida.', { status: 400 });
      }

      const originalRequest = new Request(originalUrl, { method: 'GET' });
      const authRequest = await oauth.parseAuthRequest(originalRequest);
      const client = await oauth.lookupClient(authRequest.clientId);
      if (!client || !grantedScopes(authRequest.scope)) return new Response('Cliente ou escopo não autorizado.', { status: 400 });

      const user = await authenticate(env, email, password);
      if (!user) return renderAuthorize(originalRequest, env, authRequest, client, 'Credenciais inválidas ou conta sem permissão MCP.');

      const scope = grantedScopes(authRequest.scope);
      if (!scope) return new Response('Escopo não autorizado.', { status: 400 });
      if (!canAuthorizeScopes(user, env, scope)) {
        return renderAuthorize(originalRequest, env, authRequest, client, 'Conta sem permissão para o escopo MCP solicitado.');
      }
      const { redirectTo } = await oauth.completeAuthorization({
        request: authRequest,
        userId: String(user.id),
        metadata: { clientId: client.clientId, grantedAt: new Date().toISOString() },
        scope,
        props: { userId: user.id, email: user.email, clientId: client.clientId, scope },
      });
      return Response.redirect(redirectTo, 302);
    }

    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
  },
};

const options: OAuthProviderOptions<Env> = {
  apiRoute: '/mcp',
  apiHandler,
  defaultHandler,
  authorizeEndpoint: '/oauth/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['sorria.read', 'sorria.finance.read', 'sorria.write'],
  allowPlainPKCE: false,
  allowImplicitFlow: false,
  accessTokenTTL: 3600,
  refreshTokenTTL: 2_592_000,
  resourceMetadata: {
    resource_name: 'Sorria Leste MCP',
    scopes_supported: ['sorria.read', 'sorria.finance.read', 'sorria.write'],
    bearer_methods_supported: ['header'],
  },
};

export const oauthProvider = new OAuthProvider(options);
