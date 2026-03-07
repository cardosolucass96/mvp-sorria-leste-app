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

  // Lista de emails para facilitar o teste
  const testEmails = [
    { email: 'admin@sorrialeste.com', role: 'Admin', icon: '👑' },
    { email: 'maria@sorrialeste.com', role: 'Atendente', icon: '👋' },
    { email: 'dr.carlos@sorrialeste.com', role: 'Avaliador', icon: '🔍' },
    { email: 'dr.pedro@sorrialeste.com', role: 'Executor', icon: '🦷' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600">
      <div className="max-w-md w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-2xl p-4 shadow-xl mb-4">
            <Image
              src="/logo-sorria-leste.jpg"
              alt="Sorria Leste"
              width={80}
              height={80}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mt-4 drop-shadow-lg">Sorria Leste</h1>
          <p className="text-orange-100 text-lg">Clínica Odontológica</p>
        </div>

        {/* Card de Login */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 text-center">Entrar no Sistema</h2>

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

          {/* Emails de teste */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3 text-center">
              👇 Clique para preencher (senha: <code className="bg-gray-100 px-1 rounded">Sorria@123</code>):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {testEmails.map((item) => (
                <button
                  key={item.email}
                  type="button"
                  onClick={() => {
                    setEmail(item.email);
                    setSenha('Sorria@123');
                  }}
                  className="text-left px-3 py-2 text-sm bg-orange-50 hover:bg-orange-100 rounded-lg transition-all hover:shadow-md border border-orange-100"
                >
                  <span className="text-lg mr-1">{item.icon}</span>
                  <span className="font-medium text-orange-800">{item.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <p className="text-center text-sm text-orange-100 mt-6">
          Sorria Leste v1.0 - Sistema de Gestão
        </p>
      </div>
    </div>
  );
}
