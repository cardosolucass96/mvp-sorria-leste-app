'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Erro ao fazer login');
    }

    setIsLoading(false);
  };

  // Lista de emails para facilitar o teste
  const testEmails = [
    { email: 'admin@sorrialeste.com', role: 'Admin' },
    { email: 'maria@sorrialeste.com', role: 'Atendente' },
    { email: 'dr.carlos@sorrialeste.com', role: 'Avaliador' },
    { email: 'dr.pedro@sorrialeste.com', role: 'Executor' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-6xl">🦷</span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">Sorria Leste</h1>
          <p className="text-gray-600">Sistema de Gestão Odontológica</p>
        </div>

        {/* Card de Login */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Entrar no Sistema</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="seu.email@sorrialeste.com"
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {/* Emails de teste */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3">
              Emails de teste disponíveis:
            </p>
            <div className="space-y-2">
              {testEmails.map((item) => (
                <button
                  key={item.email}
                  onClick={() => setEmail(item.email)}
                  className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <span className="font-medium">{item.role}:</span>{' '}
                  <span className="text-blue-600">{item.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <p className="text-center text-sm text-gray-500 mt-4">
          MVP v0.1 - Validação de Regras de Negócio
        </p>
      </div>
    </div>
  );
}
