import type { AppUser, Env, OAuthProps } from './types';

const READ_SCOPE = 'sorria.read';
const FINANCIAL_READ_SCOPE = 'sorria.finance.read';
const WRITE_SCOPE = 'sorria.write';
const FINANCIAL_FIELD_PATTERN = /(valor|pagamento|pagamentos|saldo|comissao|comissoes|caixa|desconto|recebido|crediario|dinheiro|pix|cartao|cobranca)/i;
const FINANCIAL_TEXT_PATTERN = /(valor|pagamento|pagamentos|saldo|comissão|comissões|comissao|comissoes|caixa|desconto|recebido|crediario|crediário|dinheiro|pix|cartao|cartão|cobranca|cobrança)/i;
const MONEY_TEXT_PATTERN = /\bR\$\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d{2})\b/g;
const HAS_MONEY_TEXT_PATTERN = /\bR\$\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d{2})\b/;

const ALLOWED_SCOPES = new Set([READ_SCOPE, FINANCIAL_READ_SCOPE, WRITE_SCOPE]);

function parseEmailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function allowedEmails(env: Env): Set<string> {
  return parseEmailList(env.MCP_ALLOWED_EMAILS);
}

export function allowedWriteEmails(env: Env): Set<string> {
  return parseEmailList(env.MCP_WRITE_ALLOWED_EMAILS);
}

export function isMcpAdministrator(user: Pick<AppUser, 'email' | 'role' | 'ativo'>, env: Env): boolean {
  return user.ativo === 1
    && user.role === 'admin'
    && allowedEmails(env).has(user.email.trim().toLowerCase());
}

export function isMcpWriter(user: Pick<AppUser, 'email' | 'role' | 'ativo'>, env: Env): boolean {
  return user.ativo === 1
    && ['admin', 'atendente'].includes(user.role)
    && allowedWriteEmails(env).has(user.email.trim().toLowerCase());
}

export function parseOAuthProps(input: unknown): OAuthProps | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const userId = Number(raw.userId);
  const email = typeof raw.email === 'string' ? raw.email : '';
  const clientId = typeof raw.clientId === 'string' ? raw.clientId : '';
  const scope = Array.isArray(raw.scope) && raw.scope.every((value) => typeof value === 'string')
    ? raw.scope as string[]
    : [];

  if (!Number.isInteger(userId) || userId <= 0 || !email || !clientId) return null;
  return { userId, email, clientId, scope };
}

export function hasReadScope(scope: string[]): boolean {
  return scope.includes(READ_SCOPE);
}

export function hasFinancialScope(scope: string[]): boolean {
  return scope.includes(FINANCIAL_READ_SCOPE);
}

export function hasWriteScope(scope: string[]): boolean {
  return scope.includes(WRITE_SCOPE);
}

export function grantedScopes(requestedScope: string[]): string[] | null {
  if (requestedScope.some((scope) => !ALLOWED_SCOPES.has(scope))) return null;

  const requested = requestedScope.length > 0 ? requestedScope : [READ_SCOPE];
  const granted = new Set(requested);

  if (granted.has(FINANCIAL_READ_SCOPE)) {
    granted.add(READ_SCOPE);
  }

  return Array.from(granted).sort((left, right) => left.localeCompare(right));
}

export function canAuthorizeScopes(
  user: Pick<AppUser, 'email' | 'role' | 'ativo'>,
  env: Env,
  scope: string[],
): boolean {
  const needsRead = hasReadScope(scope);
  const needsFinancial = hasFinancialScope(scope);
  const needsWrite = hasWriteScope(scope);

  if ((needsRead || needsFinancial) && !isMcpAdministrator(user, env)) return false;
  if (needsWrite && !isMcpWriter(user, env)) return false;
  return needsRead || needsFinancial || needsWrite;
}

export function maskCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***.***.***-${digits.slice(-2)}`;
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

export function maskNullableText(
  value: string | null | undefined,
  maxLength = 140,
  options?: { allowFinancialText?: boolean },
): string | null {
  if (!value) return null;
  const allowFinancialText = options?.allowFinancialText ?? false;
  if (!allowFinancialText && FINANCIAL_TEXT_PATTERN.test(value)) return '[texto oculto]';
  const sanitized = (allowFinancialText ? value : value.replace(MONEY_TEXT_PATTERN, '[texto oculto]'))
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return null;
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength - 1)}…` : sanitized;
}

export function isForbiddenFollowupType(value: string | null | undefined): boolean {
  return value?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === 'cobranca';
}

export function omitFinancialFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitFinancialFields(item)) as T;
  }

  if (typeof value === 'string') {
    return (FINANCIAL_TEXT_PATTERN.test(value) || HAS_MONEY_TEXT_PATTERN.test(value) ? '[texto oculto]' : value) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FINANCIAL_FIELD_PATTERN.test(key)) continue;
    cleaned[key] = omitFinancialFields(item);
  }
  return cleaned as T;
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

/** Compatível com o formato PBKDF2 já empregado pela aplicação principal. */
export async function verifyPassword(plainPassword: string, storedPassword: string): Promise<boolean> {
  if (!storedPassword.startsWith('pbkdf2:')) return safeEqual(plainPassword, storedPassword);

  const [, iterationString, saltHex, expectedHashHex] = storedPassword.split(':');
  const iterations = Number.parseInt(iterationString ?? '', 10);
  const salt = hexToBytes(saltHex ?? '');
  const expectedHash = hexToBytes(expectedHashHex ?? '');
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expectedHash) return false;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plainPassword),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltBuffer = Uint8Array.from(salt).buffer as ArrayBuffer;
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    keyMaterial,
    expectedHash.byteLength * 8,
  ));

  let difference = derived.byteLength ^ expectedHash.byteLength;
  for (let index = 0; index < Math.max(derived.length, expectedHash.length); index += 1) {
    difference |= (derived[index] ?? 0) ^ (expectedHash[index] ?? 0);
  }
  return difference === 0;
}
