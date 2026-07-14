'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Clock3, RefreshCcw, Stethoscope, Tv2, UserRound } from 'lucide-react';
import { Alert, LoadingState } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import usePageTitle from '@/lib/utils/usePageTitle';
import { formatarHoraDaClinica, formatarInstanteUtcNaClinica } from '@/lib/utils/formatters';

interface PacientePainelTv {
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  entrou_na_fila_em: string;
  doutores: string[];
  procedimentos: string[];
  quantidade_procedimentos: number;
  possui_procedimento_em_execucao: boolean;
}

interface PainelTvResponse {
  categoria: { id: number; nome: string; slug: string; cor: string; icone: string };
  pacientes: PacientePainelTv[];
  atualizado_em: string;
}

function formatarHorario(dataIso: string) {
  return formatarInstanteUtcNaClinica(dataIso, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDataHora(dataIso: string) {
  return formatarInstanteUtcNaClinica(dataIso, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PainelTvFilaPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const unitFetch = useUnitFetch();
  const [painel, setPainel] = useState<PainelTvResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agora, setAgora] = useState(() => new Date());

  usePageTitle(painel?.categoria ? `Painel ${painel.categoria.nome}` : 'Painel TV');

  const carregarPainel = useCallback(async (isInitialLoad = false) => {
    if (!slug) return;
    if (isInitialLoad) {
      setLoading(true);
    }

    try {
      const response = await unitFetch(`/api/painel-tv/${slug}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao carregar painel');
        return;
      }

      setPainel(data);
      setError('');
    } catch {
      setError('Erro ao carregar painel');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [slug, unitFetch]);

  useEffect(() => {
    carregarPainel(true);
  }, [carregarPainel]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      carregarPainel(false);
    }, 15000);
    const clockId = window.setInterval(() => {
      setAgora(new Date());
    }, 1000);

    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [carregarPainel]);

  const pacientes = useMemo(
    () => (painel?.pacientes ?? []).slice().sort((a, b) => a.entrou_na_fila_em.localeCompare(b.entrou_na_fila_em)),
    [painel]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-700 to-primary-100 p-8 text-foreground">
        <div className="mx-auto max-w-7xl">
          <LoadingState mode="skeleton" lines={8} />
        </div>
      </div>
    );
  }

  if (!painel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-700 to-primary-100 p-8 text-foreground">
        <div className="mx-auto max-w-5xl">
          <Alert type="error">{error || 'Painel indisponível'}</Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-700 to-primary-100 text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 md:px-8 md:py-8">
        <header className="rounded-[2rem] border border-border/50 bg-card/70 p-5 shadow-xl backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Link
                href="/painel-tv"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-4 py-2 text-sm font-medium text-foreground/90 transition hover:bg-background/70"
              >
                <ArrowLeft className="h-4 w-4" />
                Trocar fila
              </Link>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-muted/60 px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  <Tv2 className="h-4 w-4" />
                  Painel da recepção
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                  {painel.categoria.nome}
                </h1>
                <p className="mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">
                  Pacientes em ordem de entrada na fila. Quando um doutor já estiver vinculado, ele aparece aqui no painel.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:w-[32rem]">
              <div className="md:col-span-2 flex justify-start md:justify-end">
                <div className="rounded-2xl bg-primary-950/90 px-5 py-4 shadow-lg ring-1 ring-primary-200/50">
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
              <div className="rounded-2xl border border-border/50 bg-background/60 px-5 py-4">
                <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Horário atual</p>
                <p className="mt-2 text-3xl font-bold">{formatarHoraDaClinica(agora)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/60 px-5 py-4">
                <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Última atualização</p>
                <p className="mt-2 text-xl font-bold">{formatarDataHora(painel.atualizado_em)}</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCcw className="h-4 w-4" />
                  Auto refresh de 15 em 15 segundos
                </p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="mt-4">
            <Alert type="error">{error}</Alert>
          </div>
        )}

        {pacientes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <div className="w-full rounded-[2rem] border border-border/50 bg-card/80 p-10 text-center shadow-xl backdrop-blur-md">
              <UserRound className="mx-auto h-16 w-16 text-muted-foreground" />
              <h2 className="mt-5 text-3xl font-bold">Nenhum paciente na fila</h2>
              <p className="mt-3 text-lg text-muted-foreground">
                Quando alguém entrar em {painel.categoria.nome}, o nome aparecerá automaticamente aqui.
              </p>
            </div>
          </div>
        ) : (
          <section className="mt-6 grid flex-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {pacientes.map((paciente, index) => (
              <article
                key={paciente.atendimento_id}
                className="flex min-h-[280px] flex-col rounded-[2rem] border border-border/50 bg-card/70 p-6 shadow-xl backdrop-blur-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                      Paciente {index + 1}
                    </p>
                    <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
                      {paciente.cliente_nome}
                    </h2>
                  </div>
                  <div
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      paciente.possui_procedimento_em_execucao
                      ? 'bg-success-500 text-success-50'
                        : 'bg-warning-300 text-warning-900'
                    }`}
                  >
                    {paciente.possui_procedimento_em_execucao ? 'Em atendimento' : 'Aguardando doutor'}
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl bg-background/60 p-4">
                    <p className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      Entrou na fila
                    </p>
                    <p className="mt-2 text-2xl font-bold">{formatarHorario(paciente.entrou_na_fila_em)}</p>
                  </div>

                  <div className="rounded-2xl bg-background/60 p-4">
                    <p className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-muted-foreground">
                      <Stethoscope className="h-4 w-4" />
                      Doutor
                    </p>
                    <p className="mt-2 text-2xl font-bold leading-tight">
                      {paciente.doutores.length > 0 ? paciente.doutores.join(', ') : 'Ainda não definido'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-background/60 p-4">
                    <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Procedimentos</p>
                    <p className="mt-2 text-lg font-semibold">
                      {paciente.quantidade_procedimentos} item{paciente.quantidade_procedimentos !== 1 ? 's' : ''}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {paciente.procedimentos.join(' • ')}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
