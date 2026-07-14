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
    <div className="min-h-screen bg-gradient-to-br from-primary-100 via-primary-200 to-card/90 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col gap-5 rounded-[2rem] border border-primary-200/70 bg-card/80 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between md:p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary-800">
              <Tv className="h-4 w-4" />
              Painel para TV
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
                Painel TV
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
                Escolha uma fila para exibir na recepção. A tela atualiza sozinha e destaca os pacientes por ordem de entrada.
              </p>
            </div>
          </div>

          <div className="self-start rounded-2xl bg-primary-900 px-5 py-4 shadow-md md:self-center">
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

        <Card className="border-primary-200 bg-card/85">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
          <Card className="border-primary-300 bg-gradient-to-br from-primary-900 via-primary-600 to-primary-500 text-primary-50 hover:border-primary-500">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-100/70">Nova visualização</p>
                <h2 className="mt-2 text-2xl font-black md:text-3xl">Duas filas na mesma tela</h2>
                <p className="mt-2 text-sm text-primary-100/85 md:text-base">
                  Abre um painel integrado mostrando todas as filas ativas lado a lado.
                </p>
              </div>
              <ArrowRight className="h-8 w-8 shrink-0 text-primary-50" />
            </div>
          </Card>
        </Link>

        {error && <Alert type="error">{error}</Alert>}

        {loading ? (
          <Card className="border-primary-200 bg-card/85">
            <LoadingState mode="skeleton" lines={6} />
          </Card>
        ) : categorias.length === 0 ? (
          <Card className="border-primary-200 bg-card/85">
            <div className="py-16 text-center">
              <Monitor className="mx-auto mb-4 h-12 w-12 text-primary-400" />
              <h2 className="text-2xl font-bold text-foreground">Nenhuma fila ativa</h2>
              <p className="mt-2 text-muted-foreground">
                Quando houver filas cadastradas, elas aparecerão aqui para abrir o painel.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {categorias.map((categoria) => (
              <Link key={categoria.id} href={`/painel-tv/${categoria.slug}`}>
                <Card className="h-full border-primary-200 bg-card/90 hover:border-primary-400 hover:bg-card">
                  <div className="flex h-full flex-col justify-between gap-6">
                    <div className="space-y-3">
                      <div className="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-800">
                        Fila
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-foreground">{categoria.nome}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          URL: <span className="font-mono text-primary-700">/painel-tv/{categoria.slug}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-primary-700">
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
