'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function LoginPage() {
  usePageTitle('Login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, senha);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Erro ao fazer login');
    }

    setIsLoading(false);
  };

  const loginRapido = async (emailDev: string) => {
    setError('');
    setIsLoading(true);
    setEmail(emailDev);
    setSenha('Sorria@123');
    const result = await login(emailDev, 'Sorria@123');
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Erro ao fazer login');
      setIsLoading(false);
    }
  };

  const DEV_USERS = [
    { label: 'Admin',     email: 'admin@sorrialeste.com' },
    { label: 'Atendente', email: 'maria@sorrialeste.com' },
    { label: 'Avaliador', email: 'dr.carlos@sorrialeste.com' },
    { label: 'Executor',  email: 'dr.pedro@sorrialeste.com' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600">
      <div className="max-w-md w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-surface rounded-2xl p-4 shadow-xl mb-4">
            <Image
              src="/logo-sorria-leste.jpg"
              alt="Sorria Leste"
              width={80}
              height={80}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mt-4 drop-shadow-lg">Sorria Leste</h1>
          <p className="text-primary-100 text-lg">Clínica Odontológica</p>
        </div>

        {/* Card de Login */}
        <div className="bg-surface rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold mb-6 text-neutral-800 text-center">Entrar no Sistema</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="seu.email@sorrialeste.com"
              required
              disabled={isLoading}
            />

            <Input
              label="Senha"
              name="senha"
              type="password"
              value={senha}
              onChange={setSenha}
              placeholder="••••••••"
              required
              disabled={isLoading}
            />

            {error && (
              <Alert type="error">{error}</Alert>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={isLoading}
            >
              Entrar
            </Button>
          </form>

        </div>

        {/* Atalhos de dev — visíveis apenas em localhost */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 bg-surface/80 rounded-xl p-4 text-sm">
            <p className="text-neutral-500 mb-2 text-center">Clique para entrar (senha: Sorria@123):</p>
            <div className="grid grid-cols-4 gap-2">
              {DEV_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => loginRapido(u.email)}
                  disabled={isLoading}
                  className="py-1.5 px-2 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium transition-colors disabled:opacity-50 text-xs"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-sm text-primary-100 mt-6">
          Sorria Leste v1.0 - Sistema de Gestão
        </p>
      </div>
    </div>
  );
}
