/**
 * Módulo de hash de senhas usando Web Crypto API (PBKDF2).
 * Compatível com Cloudflare Workers (sem dependências nativas do Node).
 *
 * Formato armazenado: `pbkdf2:iterations:salt_hex:hash_hex`
 */

const ALGORITHM = 'PBKDF2';
const HASH_ALGO = 'SHA-256';
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits

/** Converte ArrayBuffer → hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Converte hex string → Uint8Array */
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Gera o hash de uma senha em texto plano.
 * @returns string no formato `pbkdf2:100000:salt_hex:hash_hex`
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(plainPassword),
    ALGORITHM,
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  const saltHex = bufToHex(salt.buffer as ArrayBuffer);
  const hashHex = bufToHex(derivedBits);

  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verifica se uma senha em texto plano confere com o hash armazenado.
 * Suporta tanto o novo formato hash quanto texto plano legado (migração gradual).
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string
): Promise<boolean> {
  // Se o stored NÃO está no formato hash, é texto plano legado
  if (!storedPassword.startsWith('pbkdf2:')) {
    return plainPassword === storedPassword;
  }

  const parts = storedPassword.split(':');
  if (parts.length !== 4) return false;

  const [, iterStr, saltHex, expectedHashHex] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = hexToBuf(saltHex);

  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(plainPassword),
    ALGORITHM,
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt,
      iterations,
      hash: HASH_ALGO,
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  const actualHashHex = bufToHex(derivedBits);
  return actualHashHex === expectedHashHex;
}

/**
 * Verifica se a senha armazenada precisa ser migrada (ainda é texto plano).
 */
export function needsMigration(storedPassword: string): boolean {
  return !storedPassword.startsWith('pbkdf2:');
}
