/**
 * Módulo JWT usando Web Crypto API (HMAC-SHA256).
 * Compatível com Cloudflare Workers.
 *
 * Gera e valida tokens JWT com payload customizado.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'sorria-leste-dev-secret-change-in-production';
const JWT_EXPIRATION_HOURS = 24;

interface JwtHeader {
  alg: string;
  typ: string;
}

export interface JwtPayload {
  sub: number;       // user id
  email: string;
  role: string;
  nome: string;
  iat: number;       // issued at (unix seconds)
  exp: number;       // expires at (unix seconds)
}

/** Base64url encode */
function base64urlEncode(data: string | ArrayBuffer): string {
  let str: string;
  if (typeof data === 'string') {
    str = btoa(data);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url decode → string */
function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return atob(base64);
}

/** Gera a assinatura HMAC-SHA256 */
async function sign(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return base64urlEncode(signature);
}

/** Verifica a assinatura HMAC-SHA256 */
async function verify(input: string, signatureStr: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Decodificar a assinatura de base64url
  let base64 = signatureStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(input));
}

/**
 * Gera um JWT para o usuário.
 */
export async function generateToken(user: {
  id: number;
  email: string;
  role: string;
  nome: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    nome: user.nome,
    iat: now,
    exp: now + JWT_EXPIRATION_HOURS * 3600,
  };

  const headerStr = base64urlEncode(JSON.stringify(header));
  const payloadStr = base64urlEncode(JSON.stringify(payload));
  const signature = await sign(`${headerStr}.${payloadStr}`);

  return `${headerStr}.${payloadStr}.${signature}`;
}

/**
 * Valida e decodifica um JWT.
 * @returns O payload se o token é válido, ou null se inválido/expirado.
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerStr, payloadStr, signatureStr] = parts;

    // Verificar assinatura
    const isValid = await verify(`${headerStr}.${payloadStr}`, signatureStr);
    if (!isValid) return null;

    // Decodificar payload
    const payload = JSON.parse(base64urlDecode(payloadStr)) as JwtPayload;

    // Verificar expiração
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extrai o token do header Authorization ou do cookie.
 */
export function extractToken(request: Request): string | null {
  // Tentar header Authorization: Bearer <token>
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Tentar cookie
  const cookies = request.headers.get('Cookie');
  if (cookies) {
    const match = cookies.match(/auth-token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}
