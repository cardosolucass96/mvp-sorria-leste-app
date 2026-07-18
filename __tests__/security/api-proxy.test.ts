import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { generateToken } from '@/lib/auth/jwt';

describe('proxy de autenticação das APIs', () => {
  it('mantém o login público', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/api/auth/login'));
    expect(response.status).toBe(200);
  });

  it('mantém o webhook do Autentique público', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/api/webhooks/autentique'));
    expect(response.status).toBe(200);
  });

  it('rejeita uma API sem token', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/api/clientes'));
    expect(response.status).toBe(401);
  });

  it('libera uma API com JWT válido', async () => {
    const token = await generateToken({
      id: 1,
      email: 'admin@sorrialeste.test',
      role: 'admin',
      roles: ['admin'],
      nome: 'Admin',
      unidade_ids: [1],
      unidade_atual: 1,
    });
    const response = await middleware(new NextRequest('http://localhost:3000/api/clientes', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(response.status).toBe(200);
  });

  it('usa BETTER_AUTH_SECRET quando JWT_SECRET não existe', async () => {
    const previousJwtSecret = process.env.JWT_SECRET;
    const previousBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
    delete process.env.JWT_SECRET;
    process.env.BETTER_AUTH_SECRET = 'sorria-leste-test-better-auth-secret';

    await expect(generateToken({
      id: 1,
      email: 'admin@sorrialeste.test',
      role: 'admin',
      roles: ['admin'],
      nome: 'Admin',
      unidade_ids: [1],
      unidade_atual: 1,
    })).resolves.toMatch(/^[^.]+\.[^.]+\.[^.]+$/);

    restoreEnv('JWT_SECRET', previousJwtSecret);
    restoreEnv('BETTER_AUTH_SECRET', previousBetterAuthSecret);
  });

  it('falha fechada se nenhum segredo JWT estiver configurado', async () => {
    const previousJwtSecret = process.env.JWT_SECRET;
    const previousBetterAuthSecret = process.env.BETTER_AUTH_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    await expect(generateToken({
      id: 1,
      email: 'admin@sorrialeste.test',
      role: 'admin',
      roles: ['admin'],
      nome: 'Admin',
      unidade_ids: [1],
      unidade_atual: 1,
    })).rejects.toThrow('JWT_SECRET ou BETTER_AUTH_SECRET não configurado');
    restoreEnv('JWT_SECRET', previousJwtSecret);
    restoreEnv('BETTER_AUTH_SECRET', previousBetterAuthSecret);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
