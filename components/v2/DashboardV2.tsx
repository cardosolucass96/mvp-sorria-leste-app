'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, CalendarCheck2, ChartNoAxesCombined, CircleDollarSign, SearchCheck, Target, Users } from 'lucide-react';
import { Alert, Card, Input, LoadingState, PageHeader, StatCard, Table } from '@/components/ui';
import type { TableColumn } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { getClinicDateKey, getClinicMonthKey } from '@/lib/time';
import { formatarMoeda } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface EvaluatorMetric {
  id: number;
  nome: string;
  avaliacoes_concluidas: number;
  avaliacoes_com_orcamento: number;
  avaliacoes_convertidas: number;
}

interface DashboardData {
  atendimentos_clinicos_realizados: number;
  avaliacoes_concluidas: number;
  avaliacoes_com_orcamento: number;
  orcamentos_apresentados: number;
  avaliacoes_convertidas: number;
  taxa_geracao: number;
  taxa_apresentacao: number;
  conversao_comercial: number;
  valor_proposto_centavos: number;
  valor_aceito_centavos: number;
  valor_recebido_centavos: number;
  valor_executado_centavos: number;
  avaliacoes_sem_orcamento_por_motivo: Array<{ motivo: string; total: number }>;
  por_avaliador: EvaluatorMetric[];
}

export default function DashboardV2() {
  usePageTitle('Dashboard V2');
  const unitFetch = useUnitFetch();
  const [from, setFrom] = useState(`${getClinicMonthKey()}-01`);
  const [to, setTo] = useState(getClinicDateKey());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ data_inicio: from, data_fim: to });
      const response = await unitFetch(`/api/v2/dashboard?${params}`);
      const result = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Erro ao carregar indicadores');
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar indicadores');
    } finally {
      setLoading(false);
    }
  }, [from, to, unitFetch]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  const evaluatorColumns: TableColumn<EvaluatorMetric>[] = [
    { key: 'nome', label: 'Avaliador' },
    { key: 'avaliacoes_concluidas', label: 'Avaliações', align: 'center' },
    { key: 'avaliacoes_com_orcamento', label: 'Com orçamento', align: 'center' },
    { key: 'avaliacoes_convertidas', label: 'Convertidas', align: 'center' },
    {
      key: 'conversao',
      label: 'Conversão',
      align: 'right',
      render: (item) => `${item.avaliacoes_com_orcamento > 0 ? Math.round((item.avaliacoes_convertidas / item.avaliacoes_com_orcamento) * 100) : 0}%`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicadores operacionais V2"
        description="Métricas por entidades distintas; nenhuma linha de orçamento é contada como atendimento."
        icon={<ChartNoAxesCombined className="size-7" />}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44"><Input label="Data inicial" name="data_inicio" type="date" value={from} onChange={setFrom} /></div>
        <div className="w-44"><Input label="Data final" name="data_fim" type="date" value={to} onChange={setTo} /></div>
      </div>
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {loading || !data ? <LoadingState text="Calculando indicadores..." /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={<CalendarCheck2 className="size-5" />} label="Atendimentos clínicos" value={data.atendimentos_clinicos_realizados} color="border-info-500" />
            <StatCard icon={<SearchCheck className="size-5" />} label="Avaliações concluídas" value={data.avaliacoes_concluidas} color="border-evaluation-500" />
            <StatCard icon={<Target className="size-5" />} label="Com orçamento" value={data.avaliacoes_com_orcamento} color="border-warning-500" />
            <StatCard icon={<Users className="size-5" />} label="Convertidas" value={data.avaliacoes_convertidas} color="border-success-500" />
            <StatCard icon={<CircleDollarSign className="size-5" />} label="Recebido" value={formatarMoeda(data.valor_recebido_centavos / 100)} color="border-success-500" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={<Target className="size-5" />} label="Taxa de geração" value={`${data.taxa_geracao}%`} description="Com orçamento / avaliações" />
            <StatCard icon={<Target className="size-5" />} label="Taxa de apresentação" value={`${data.taxa_apresentacao}%`} description="Apresentados / gerados" />
            <StatCard icon={<Target className="size-5" />} label="Conversão comercial" value={`${data.conversao_comercial}%`} description="Com aceite / apresentados" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Banknote className="size-5" />} label="Valor proposto" value={formatarMoeda(data.valor_proposto_centavos / 100)} />
            <StatCard icon={<Banknote className="size-5" />} label="Valor aceito" value={formatarMoeda(data.valor_aceito_centavos / 100)} />
            <StatCard icon={<Banknote className="size-5" />} label="Valor recebido" value={formatarMoeda(data.valor_recebido_centavos / 100)} />
            <StatCard icon={<Banknote className="size-5" />} label="Valor executado" value={formatarMoeda(data.valor_executado_centavos / 100)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Table columns={evaluatorColumns} data={data.por_avaliador} keyExtractor={(item) => item.id} emptyMessage="Sem avaliações no período" caption="Indicadores por avaliador" />
            <Card>
              <h2 className="font-semibold text-foreground">Avaliações sem orçamento</h2>
              <div className="mt-4 space-y-3">
                {data.avaliacoes_sem_orcamento_por_motivo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma no período.</p>
                ) : data.avaliacoes_sem_orcamento_por_motivo.map((item) => (
                  <div key={item.motivo} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0">
                    <p className="text-sm text-foreground">{item.motivo}</p>
                    <span className="font-semibold text-foreground">{item.total}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
