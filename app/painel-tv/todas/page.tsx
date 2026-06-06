'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, RefreshCcw, Stethoscope, Tv2, UserRound } from 'lucide-react';
import { Alert, Card, LoadingState } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { CategoriaComRoles } from '@/lib/types';
import usePageTitle from '@/lib/utils/usePageTitle';

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

interface FilaPainel {
  categoria: CategoriaComRoles;
  pacientes: PacientePainelTv[];
  atualizado_em: string | null;
  erro?: string;
}

function formatarHorario(dataIso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dataIso));
}

function formatarDataHora(dataIso?: string | null) {
  if (!dataIso) return '--';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dataIso));
}

export default function PainelTvTodasPage() {
  const unitFetch = useUnitFetch();
  const [filas, setFilas] = useState<FilaPainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agora, setAgora] = useState(() => new Date());

  usePageTitle('Painel TV - Todas as Filas');

  const carregarTudo = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    }

    try {
      const categoriasResponse = await unitFetch('/api/categorias?ativo=1');
      const categoriasData = await categoriasResponse.json();

      if (!categoriasResponse.ok) {
        setError(categoriasData.error || 'Erro ao carregar filas');
        return;
      }

      const categorias = categoriasData as CategoriaComRoles[];
      const resultados = await Promise.all(
        categorias.map(async (categoria) => {
          try {
            const response = await unitFetch(`/api/painel-tv/${categoria.slug}`);
            const data = await response.json();

            if (!response.ok) {
              return {
                categoria,
                pacientes: [],
                atualizado_em: null,
                erro: data.error || 'Erro ao carregar fila',
              } satisfies FilaPainel;
            }

            const filaData = data as PainelTvResponse;
            return {
              categoria,
              pacientes: filaData.pacientes,
              atualizado_em: filaData.atualizado_em,
            } satisfies FilaPainel;
          } catch {
            return {
              categoria,
              pacientes: [],
              atualizado_em: null,
              erro: 'Erro ao carregar fila',
            } satisfies FilaPainel;
          }
        })
      );

      setFilas(resultados);
      setError('');
    } catch {
      setError('Erro ao carregar painel');
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, [unitFetch]);

  useEffect(() => {
    carregarTudo(true);
  }, [carregarTudo]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      carregarTudo(false);
    }, 15000);
    const clockId = window.setInterval(() => {
      setAgora(new Date());
    }, 1000);

    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, [carregarTudo]);

  const filasOrdenadas = useMemo(
    () => filas.slice().sort((a, b) => a.categoria.ordem - b.categoria.ordem || a.categoria.nome.localeCompare(b.categoria.nome)),
    [filas]
  );

  const ultimaAtualizacao = useMemo(() => {
    const atualizacoes = filasOrdenadas
      .map((fila) => fila.atualizado_em)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a));

    return atualizacoes[0] ?? null;
  }, [filasOrdenadas]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(135deg,_#7c2d12_0%,_#ea580c_45%,_#ffedd5_100%)] p-8 text-white">
        <div className="mx-auto max-w-7xl">
          <LoadingState mode="skeleton" lines={10} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_#7c2d12_0%,_#ea580c_45%,_#ffedd5_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col px-5 py-6 md:px-8 md:py-8">
        <header className="rounded-[2rem] border border-white/20 bg-white/10 p-5 shadow-xl backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <Link
                href="/painel-tv"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar aos painéis
              </Link>

              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white/90">
                  <Tv2 className="h-4 w-4" />
                  Painel integrado
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                  Todas as filas
                </h1>
                <p className="mt-3 max-w-4xl text-base text-white/80 md:text-lg">
                  Visualização única para recepção, com as filas lado a lado na mesma tela.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:w-[34rem]">
              <div className="md:col-span-2 flex justify-start md:justify-end">
                <div className="rounded-2xl bg-primary-950/90 px-5 py-4 shadow-lg ring-1 ring-white/10">
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
              <div className="rounded-2xl border border-white/20 bg-black/15 px-5 py-4">
                <p className="text-sm uppercase tracking-[0.2em] text-white/65">Horário atual</p>
                <p className="mt-2 text-3xl font-bold">{agora.toLocaleTimeString('pt-BR')}</p>
              </div>
              <div className="rounded-2xl border border-white/20 bg-black/15 px-5 py-4">
                <p className="text-sm uppercase tracking-[0.2em] text-white/65">Última atualização</p>
                <p className="mt-2 text-xl font-bold">{formatarDataHora(ultimaAtualizacao)}</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm text-white/80">
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

        <section className="mt-6 grid flex-1 gap-5 xl:grid-cols-2">
          {filasOrdenadas.map((fila) => (
            <Card
              key={fila.categoria.id}
              className="border-white/15 bg-white/10 p-0 text-white shadow-xl backdrop-blur-md"
            >
              <div className="flex h-full flex-col">
                <div className="border-b border-white/10 px-5 py-4 md:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">Fila</p>
                      <h2 className="mt-2 text-3xl font-black">{fila.categoria.nome}</h2>
                    </div>
                    <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
                      {fila.pacientes.length} paciente{fila.pacientes.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {fila.erro ? (
                  <div className="p-5 md:p-6">
                    <Alert type="error">{fila.erro}</Alert>
                  </div>
                ) : fila.pacientes.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center p-8">
                    <div className="text-center">
                      <UserRound className="mx-auto h-14 w-14 text-white/75" />
                      <h3 className="mt-4 text-2xl font-bold">Fila vazia</h3>
                      <p className="mt-2 text-white/75">
                        Quando alguém entrar em {fila.categoria.nome}, aparecerá aqui.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
                    {fila.pacientes.map((paciente) => (
                      <article
                        key={`${fila.categoria.slug}-${paciente.atendimento_id}`}
                        className="rounded-[1.5rem] border border-white/15 bg-black/15 p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-2xl font-black leading-tight">{paciente.cliente_nome}</h3>
                            <p className="mt-2 inline-flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/65">
                              <Clock3 className="h-4 w-4" />
                              {formatarHorario(paciente.entrou_na_fila_em)}
                            </p>
                          </div>
                          <div
                            className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] ${
                              paciente.possui_procedimento_em_execucao
                                ? 'bg-success-500 text-white'
                                : 'bg-warning-300 text-warning-900'
                            }`}
                          >
                            {paciente.possui_procedimento_em_execucao ? 'Em atendimento' : 'Aguardando'}
                          </div>
                        </div>

                        <div className="mt-5 space-y-4">
                          <div>
                            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60">
                              <Stethoscope className="h-4 w-4" />
                              Doutor
                            </p>
                            <p className="mt-2 text-lg font-bold leading-tight">
                              {paciente.doutores.length > 0 ? paciente.doutores.join(', ') : 'Ainda não definido'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Procedimentos</p>
                            <p className="mt-2 text-sm leading-6 text-white/80">
                              {paciente.procedimentos.join(' • ')}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
