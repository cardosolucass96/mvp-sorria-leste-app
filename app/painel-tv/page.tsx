'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Monitor, Tv, ArrowRight, RefreshCcw } from 'lucide-react';
import { Alert, Card, LoadingState } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { CategoriaComRoles } from '@/lib/types';
import usePageTitle from '@/lib/utils/usePageTitle';

export default function PainelTvIndexPage() {
  const unitFetch = useUnitFetch();
  const [categorias, setCategorias] = useState<CategoriaComRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  usePageTitle('Painel TV');

  useEffect(() => {
    let cancelled = false;

    async function carregarCategorias() {
      try {
        const response = await unitFetch('/api/categorias?ativo=1');
        if (!response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setError(data.error || 'Erro ao carregar filas');
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setCategorias(data);
        }
      } catch {
        if (!cancelled) {
          setError('Erro ao carregar filas');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    carregarCategorias();

    return () => {
      cancelled = true;
    };
  }, [unitFetch]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed_0%,_#ffedd5_30%,_#fafaf9_70%)] p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-5 rounded-[2rem] border border-primary-200/70 bg-white/75 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between md:p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary-800">
              <Tv className="h-4 w-4" />
              Painel para TV
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-neutral-900 md:text-5xl">
                Painel TV
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-neutral-600 md:text-base">
                Escolha uma fila para exibir na recepção. A tela atualiza sozinha e destaca os pacientes por ordem de entrada.
              </p>
            </div>
          </div>

          <div className="self-start rounded-2xl bg-primary-950 px-5 py-4 shadow-md md:self-center">
            <Image
              src="/logo-sorria-leste-branca-fundo-transparente.svg"
              alt="Sorria Leste"
              width={220}
              height={64}
              className="h-10 w-auto md:h-12"
              priority
            />
          </div>
        </div>

        <Card className="border-primary-200 bg-white/85">
          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-700">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 font-medium text-primary-800">
              <Tv className="h-4 w-4" />
              Modo recepção
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-warning-100 px-3 py-1 font-medium text-warning-800">
              <RefreshCcw className="h-4 w-4" />
              Atualização automática a cada 15s
            </div>
            <span>Abra a fila desejada e coloque o navegador em tela cheia na TV.</span>
          </div>
        </Card>

        <Link href="/painel-tv/todas">
          <Card className="border-primary-300 bg-[linear-gradient(135deg,_#7c2d12_0%,_#ea580c_65%,_#fb923c_100%)] text-white hover:border-primary-500">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Nova visualização</p>
                <h2 className="mt-2 text-2xl font-black md:text-3xl">Duas filas na mesma tela</h2>
                <p className="mt-2 text-sm text-white/85 md:text-base">
                  Abre um painel integrado mostrando todas as filas ativas lado a lado.
                </p>
              </div>
              <ArrowRight className="h-8 w-8 shrink-0" />
            </div>
          </Card>
        </Link>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <Card className="border-primary-200 bg-white/85">
            <LoadingState mode="skeleton" lines={6} />
          </Card>
        ) : categorias.length === 0 ? (
          <Card className="border-primary-200 bg-white/85">
            <div className="py-16 text-center">
              <Monitor className="mx-auto mb-4 h-12 w-12 text-primary-400" />
              <h2 className="text-2xl font-bold text-neutral-900">Nenhuma fila ativa</h2>
              <p className="mt-2 text-neutral-600">
                Quando houver filas cadastradas, elas aparecerão aqui para abrir o painel.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {categorias.map((categoria) => (
              <Link key={categoria.id} href={`/painel-tv/${categoria.slug}`}>
                <Card className="h-full border-primary-200 bg-white/90 hover:border-primary-400 hover:bg-white">
                  <div className="flex h-full flex-col justify-between gap-6">
                    <div className="space-y-3">
                      <div className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-800">
                        Fila
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-neutral-900">{categoria.nome}</h2>
                        <p className="mt-2 text-sm text-neutral-600">
                          URL: <span className="font-mono text-primary-700">/painel-tv/{categoria.slug}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-primary-800">
                      <span className="text-sm font-medium">Abrir painel dessa fila</span>
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
