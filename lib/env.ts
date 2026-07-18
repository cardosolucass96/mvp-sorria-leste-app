import { getCloudflareContext } from '@opennextjs/cloudflare';

type RuntimeEnv = Record<string, unknown>;

function readCloudflareEnv(): RuntimeEnv {
  try {
    const ctx = getCloudflareContext<{ env?: RuntimeEnv }>();
    return (ctx?.env || {}) as unknown as RuntimeEnv;
  } catch {
    return {};
  }
}

export function getOptionalRuntimeEnv(name: string): string | null {
  const cloudflareValue = readCloudflareEnv()[name];
  if (typeof cloudflareValue === 'string' && cloudflareValue.trim()) {
    return cloudflareValue;
  }

  const processValue = process.env[name];
  if (typeof processValue === 'string' && processValue.trim()) {
    return processValue;
  }

  return null;
}

export function getRequiredRuntimeEnv(name: string): string {
  const value = getOptionalRuntimeEnv(name);
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function getAppBaseUrl() {
  return getOptionalRuntimeEnv('APP_BASE_URL') || 'https://sorria-leste-app.<seu-subdominio>.workers.dev';
}
