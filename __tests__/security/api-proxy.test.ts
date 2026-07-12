import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { generateToken } from '@/lib/auth/jwt';

describe('proxy de autenticação das APIs', () => {
  it('mantém o login público', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/api/auth/login'));
    expect(response.status).toBe(200);
  });

  it('rejeita uma API sem token', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/api/clientes'));
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
    const response = await proxy(new NextRequest('http://localhost:3000/api/clientes', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    expect(response.status).toBe(200);
  });

  it('falha fechada se o segredo JWT não estiver configurado', async () => {
    const previousSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(generateToken({
      id: 1,
      email: 'admin@sorrialeste.test',
      role: 'admin',
      roles: ['admin'],
      nome: 'Admin',
      unidade_ids: [1],
      unidade_atual: 1,
    })).rejects.toThrow('JWT_SECRET não configurado');
    process.env.JWT_SECRET = previousSecret;
  });
});
