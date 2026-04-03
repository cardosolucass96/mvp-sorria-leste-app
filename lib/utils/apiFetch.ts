/**
 * Wrapper de fetch que trata 401 globalmente.
 * Em caso de sessão expirada, dispara 'auth:expired' → AuthContext faz logout.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  return res;
}
