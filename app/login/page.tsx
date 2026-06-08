'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
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
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#fed7aa_0%,#fb923c_24%,#ea580c_56%,#7c2d12_100%)] dark:bg-[radial-gradient(circle_at_top,#5b3a21_0%,#2f1605_22%,#171210_72%,#0f0a08_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent_45%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_45%)]" />

      <button
        type="button"
        onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.25] bg-white/[0.15] text-white shadow-lg backdrop-blur transition-colors hover:bg-white/[0.20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:border-white/[0.10] dark:bg-black/[0.20]"
        aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
        title={isDarkMode ? 'Modo claro' : 'Modo escuro'}
      >
        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative z-10 max-w-md w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4 inline-block rounded-2xl border border-white/[0.35] bg-white/[0.92] p-4 shadow-2xl backdrop-blur dark:border-white/[0.10] dark:bg-card/[0.92]">
            <Image
              src="/logo-sorria-leste.jpg"
              alt="Sorria Leste"
              width={80}
              height={80}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mt-4 drop-shadow-lg">Sorria Leste</h1>
          <p className="text-primary-100 dark:text-primary-200/90 text-lg">Clínica Odontológica</p>
        </div>

        {/* Card de Login */}
        <div className="rounded-2xl border border-white/[0.35] bg-white/[0.94] p-8 shadow-2xl backdrop-blur dark:border-white/[0.10] dark:bg-card/[0.94]">
          <h2 className="text-center text-xl font-semibold text-foreground mb-2">Entrar no Sistema</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Acesse sua unidade e continue o atendimento de onde parou.
          </p>

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
          <div className="mt-4 rounded-xl border border-white/[0.20] bg-white/[0.16] p-4 text-sm text-white shadow-lg backdrop-blur dark:border-white/[0.10] dark:bg-black/[0.20]">
            <p className="mb-3 text-center text-primary-50/90">Clique para entrar (senha: Sorria@123):</p>
            <div className="grid grid-cols-4 gap-2">
              {DEV_USERS.map((u) => (
                <Button
                  key={u.email}
                  type="button"
                  onClick={() => loginRapido(u.email)}
                  disabled={isLoading}
                  className="text-xs shadow-none"
                  variant="secondary"
                  size="xs"
                >
                  {u.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-sm text-primary-100/95 dark:text-primary-200/80 mt-6">
          Sorria Leste v1.0 - Sistema de Gestão
        </p>
      </div>
    </div>
  );
}
