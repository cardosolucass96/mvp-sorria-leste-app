'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Calendar,
  ClipboardList,
  RefreshCcw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import usePageTitle from '@/lib/utils/usePageTitle';
import { addDaysToClinicDateKey, getClinicDateKey } from '@/lib/time';
import { calculateFechamentoPagamentoTotais } from '@/lib/fechamento-caixa/compute';
import type {
  FechamentoCaixaDentista,
  FechamentoCaixaPagamentoRecebido,
} from '@/lib/fechamento-caixa/types';
import type {
  FinanceiroDiaResumo,
  FinanceiroMetodoResumo,
  FinanceiroReceitaPeriodo,
  FinanceiroResponse,
} from '@/lib/financeiro/types';
import { getFormaPagamentoSnapshotLabel } from '@/lib/utils/formasPagamento';
import {
  formatarCPF,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarTelefone,
} from '@/lib/utils/formatters';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  PageHeader,
  StatCard,
  Table,
  type TableColumn,
} from '@/components/ui';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const METODO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: {
    label?: string;
    data_referencia?: string;
    [key: string]: unknown;
  };
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

function todayIso(): string {
  return getClinicDateKey();
}

function getDefaultStart(): string {
  return addDaysToClinicDateKey(todayIso(), -6);
}

function formatCurrencyCompact(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (absolute >= 1_000) return `R$ ${(value / 1_000).toFixed(1).replace('.', ',')} mil`;
  return `R$ ${Math.round(value)}`;
}

function getPagamentoFormaLabel(forma: {
  metodo: string;
  forma_pagamento_grupo_snapshot?: string | null;
  forma_pagamento_subgrupo_snapshot?: string | null;
}) {
  return getFormaPagamentoSnapshotLabel(forma) || METODO_LABELS[forma.metodo] || forma.metodo;
}

function CurrencyTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const title = payload[0]?.payload?.label ?? String(label ?? '');

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      {title && <p className="mb-2 font-medium">{title}</p>}
      <div className="flex flex-col gap-1.5">
        {payload.map((item) => (
          <div key={`${item.dataKey ?? item.name}`} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color ?? CHART_COLORS[0] }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-semibold">
              {typeof item.value === 'number' ? formatarMoeda(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MethodTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const quantidade = Number(item.payload?.quantidade ?? 0);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <p className="mb-2 font-medium">{String(label ?? item.payload?.label ?? '')}</p>
      <p className="font-semibold">{typeof item.value === 'number' ? formatarMoeda(item.value) : item.value}</p>
      <p className="text-xs text-muted-foreground">{quantidade} lançamento(s)</p>
    </div>
  );
}

export default function FinanceiroPage() {
  usePageTitle('Financeiro');
  const router = useRouter();
  const { user, isLoading: authLoading, hasRole } = useAuth();
  const unitFetch = useUnitFetch();
  const canAccess = hasRole('admin');
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const [dataInicio, setDataInicio] = useState(() => getDefaultStart());
  const [dataFim, setDataFim] = useState(() => todayIso());
  const [data, setData] = useState<FinanceiroResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        data: selectedDate,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      const response = await unitFetch(`/api/financeiro?${params.toString()}`);
      const json = await response.json() as FinanceiroResponse | { error: string };

      if (!response.ok) {
        throw new Error('error' in json ? json.error : 'Erro ao carregar financeiro');
      }

      setData(json as FinanceiroResponse);
    } catch (fetchError) {
      console.error('Erro ao carregar financeiro:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar financeiro');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dataFim, dataInicio, selectedDate, unitFetch]);

  useEffect(() => {
    if (!authLoading && (!user || !canAccess)) {
      router.push('/');
    }
  }, [authLoading, canAccess, router, user]);

  useEffect(() => {
    if (!authLoading && user && canAccess) {
      void fetchData();
    }
  }, [authLoading, canAccess, fetchData, user]);

  const aplicarHoje = () => {
    const hoje = todayIso();
    setSelectedDate(hoje);
    setDataInicio(hoje);
    setDataFim(hoje);
  };

  const aplicarUltimosDias = (dias: number) => {
    const hoje = todayIso();
    setSelectedDate(hoje);
    setDataInicio(addDaysToClinicDateKey(hoje, -(dias - 1)));
    setDataFim(hoje);
  };

  const diaResumo = data?.dia.resultado.resumo;
  const totalComissoesDia = (diaResumo?.total_comissao_avaliacao ?? 0) + (diaResumo?.total_comissao_execucao ?? 0);
  const faturamentoChartData = useMemo(() => (
    data?.graficos.faturamento_por_dia.map((item) => ({
      ...item,
      label: formatarData(item.data_referencia),
    })) ?? []
  ), [data]);
  const metodosChartData = useMemo(() => data?.graficos.metodos_pagamento ?? [], [data]);
  const composicaoChartData = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Líquido', valor: data.graficos.composicao_resultado_dia.total_liquido },
      { label: 'Diárias', valor: -data.graficos.composicao_resultado_dia.total_diarias },
      { label: 'Comissões', valor: -data.graficos.composicao_resultado_dia.total_comissoes },
      { label: 'Ajustes', valor: data.graficos.composicao_resultado_dia.ajustes_manuais },
      { label: 'Resultado', valor: data.graficos.composicao_resultado_dia.total_final },
    ];
  }, [data]);
  const cancelamentosChartData = useMemo(() => (
    data?.graficos.cancelamentos_por_dia.map((item) => ({
      ...item,
      label: formatarData(item.data_referencia),
    })) ?? []
  ), [data]);

  const diasColumns = useMemo<TableColumn<FinanceiroDiaResumo>[]>(() => [
    {
      key: 'data',
      label: 'Dia',
      render: (item) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{formatarData(item.data_referencia)}</span>
          <Badge color={item.status === 'fechado' ? 'green' : 'yellow'} size="sm">
            {item.status === 'fechado' ? 'Fechado' : 'Aberto'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'total_liquido',
      label: 'Líquido',
      align: 'right',
      render: (item) => <span className="font-semibold">{formatarMoeda(item.total_liquido)}</span>,
    },
    {
      key: 'total_final',
      label: 'Resultado',
      align: 'right',
      render: (item) => <span className="font-semibold text-primary">{formatarMoeda(item.total_final)}</span>,
    },
    {
      key: 'despesas',
      label: 'Diárias + comissões',
      align: 'right',
      render: (item) => formatarMoeda(item.total_diarias + item.total_comissoes),
    },
    {
      key: 'procedimentos',
      label: 'Procedimentos',
      align: 'center',
      render: (item) => item.procedimentos_executados,
    },
    {
      key: 'pagamentos',
      label: 'Pagamentos',
      align: 'center',
      render: (item) => item.pagamentos,
    },
    {
      key: 'cancelamentos',
      label: 'Cancelamentos',
      align: 'right',
      render: (item) => (
        <span className={item.pagamentos_cancelados > 0 ? 'font-semibold text-error-600' : 'text-muted-foreground'}>
          {item.pagamentos_cancelados} · {formatarMoeda(item.valor_cancelado)}
        </span>
      ),
    },
  ], []);

  const pagamentosColumns = useMemo<TableColumn<FechamentoCaixaPagamentoRecebido>[]>(() => [
    {
      key: 'created_at',
      label: 'Horário',
      render: (item) => <span className="text-sm text-muted-foreground">{formatarDataHora(item.created_at)}</span>,
    },
    {
      key: 'cliente',
      label: 'Cliente',
      render: (item) => (
        <div className="flex flex-col gap-1">
          <Link href={`/clientes/${item.cliente_id}`} className="font-medium text-primary hover:underline">
            {item.cliente_nome}
          </Link>
          <span className="text-xs text-muted-foreground">Telefone: {formatarTelefone(item.cliente_telefone)}</span>
          <span className="text-xs text-muted-foreground">CPF: {formatarCPF(item.cliente_cpf)}</span>
        </div>
      ),
    },
    {
      key: 'formas',
      label: 'Formas',
      render: (item) => (
        <div className="flex flex-col gap-1">
          {item.formas.map((forma) => (
            <span key={forma.id} className="text-sm">
              {getPagamentoFormaLabel(forma)}: {formatarMoeda(forma.valor)}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'recebido_por',
      label: 'Recebido por',
      render: (item) => <span className="text-sm text-muted-foreground">{item.recebido_por_nome || '-'}</span>,
    },
    {
      key: 'observacoes',
      label: 'Descritivo',
      render: (item) => (
        <div className="flex max-w-sm flex-col gap-1 text-sm text-muted-foreground">
          <span>{item.observacoes || '-'}</span>
          {item.motivo_cancelamento && <span>Motivo: {item.motivo_cancelamento}</span>}
        </div>
      ),
    },
    {
      key: 'bruto',
      label: 'Bruto',
      align: 'right',
      render: (item) => {
        const totais = calculateFechamentoPagamentoTotais(item);
        return <span className="font-semibold">{formatarMoeda(totais.bruto)}</span>;
      },
    },
    {
      key: 'liquido',
      label: 'Líquido',
      align: 'right',
      render: (item) => {
        const totais = calculateFechamentoPagamentoTotais(item);
        return <span className="font-semibold text-primary">{formatarMoeda(totais.liquido)}</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Badge color={item.cancelado ? 'red' : 'green'} size="sm">
          {item.cancelado ? 'Cancelado' : 'Recebido'}
        </Badge>
      ),
    },
  ], []);

  const receitasPeriodoColumns = useMemo<TableColumn<FinanceiroReceitaPeriodo>[]>(() => [
    {
      key: 'data_referencia',
      label: 'Data',
      render: (item) => <span className="font-medium">{formatarData(item.data_referencia)}</span>,
    },
    ...pagamentosColumns,
  ], [pagamentosColumns]);

  const profissionaisColumns = useMemo<TableColumn<FechamentoCaixaDentista>[]>(() => [
    {
      key: 'nome',
      label: 'Profissional',
      render: (item) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{item.nome}</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge color={item.included ? 'green' : 'red'} size="sm">
              {item.included ? 'Incluído' : 'Excluído'}
            </Badge>
            {item.manualmente_editado && <Badge color="amber" size="sm">Editado</Badge>}
          </div>
        </div>
      ),
    },
    {
      key: 'valor_diaria',
      label: 'Diária',
      align: 'right',
      render: (item) => formatarMoeda(item.valor_diaria),
    },
    {
      key: 'comissoes',
      label: 'Comissões',
      align: 'right',
      render: (item) => formatarMoeda(item.comissao_avaliacao + item.comissao_execucao),
    },
    {
      key: 'ajustes',
      label: 'Ajustes',
      align: 'center',
      render: (item) => item.ajuste_count,
    },
    {
      key: 'procedimentos',
      label: 'Procedimentos',
      align: 'center',
      render: (item) => item.procedimentos_executados.length,
    },
    {
      key: 'total_dia',
      label: 'Total do dia',
      align: 'right',
      render: (item) => <span className="font-semibold text-primary">{formatarMoeda(item.total_dia)}</span>,
    },
  ], []);

  if (authLoading || !user || !canAccess) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <PageHeader
        title="Financeiro"
        icon={<TrendingUp className="h-7 w-7" />}
        description="Consulta financeira por dia e período, com base no fechamento de caixa."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => aplicarUltimosDias(7)}>
              7 dias
            </Button>
            <Button size="sm" variant="secondary" onClick={() => aplicarUltimosDias(30)}>
              30 dias
            </Button>
            <Button size="sm" variant="ghost" onClick={aplicarHoje}>
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={() => void fetchData()} icon={<RefreshCcw className="h-4 w-4" />}>
              Atualizar
            </Button>
          </div>
        }
      />

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Filtros</p>
              <p className="text-lg font-semibold">
                {data ? `${formatarData(data.periodo.data_inicio)} a ${formatarData(data.periodo.data_fim)}` : 'Período financeiro'}
              </p>
              <p className="text-sm text-muted-foreground">
                Dia selecionado: {formatarData(selectedDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[34rem]">
            <Input
              label="Dia"
              name="data"
              type="date"
              value={selectedDate}
              onChange={setSelectedDate}
            />
            <Input
              label="Data início"
              name="data_inicio"
              type="date"
              value={dataInicio}
              onChange={setDataInicio}
            />
            <Input
              label="Data fim"
              name="data_fim"
              type="date"
              value={dataFim}
              onChange={setDataFim}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingState text="Carregando financeiro..." />
      ) : data && diaResumo ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard icon={<Banknote className="h-6 w-6" />} label="Total bruto" value={formatarMoeda(diaResumo.total_bruto)} color="border-success-500" />
            <StatCard icon={<Wallet className="h-6 w-6" />} label="Total líquido" value={formatarMoeda(diaResumo.total_liquido)} color="border-info-500" />
            <StatCard icon={<TrendingUp className="h-6 w-6" />} label="Resultado final" value={formatarMoeda(diaResumo.total_final)} color="border-primary-500" />
            <StatCard icon={<Calendar className="h-6 w-6" />} label="Diárias" value={formatarMoeda(diaResumo.total_diarias)} color="border-warning-500" />
            <StatCard icon={<Banknote className="h-6 w-6" />} label="Comissões" value={formatarMoeda(totalComissoesDia)} color="border-evaluation-500" />
            <StatCard icon={<ClipboardList className="h-6 w-6" />} label="Ajustes" value={formatarMoeda(diaResumo.ajustes_manuais)} color="border-border" />
          </div>

          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Status do fechamento</h2>
                <p className="text-sm text-muted-foreground">
                  Unidade: {data.dia.resultado.unidade_nome || `Unidade ${data.dia.resultado.unidade_id}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge color={data.dia.meta.status === 'fechado' ? 'green' : 'yellow'}>
                  {data.dia.meta.status === 'fechado' ? 'Fechado' : 'Aberto'}
                </Badge>
                {data.dia.meta.editado_manual && <Badge color="amber">Editado manualmente</Badge>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border border-border bg-secondary/55 p-3">
                <p className="text-xs uppercase text-muted-foreground">Referência</p>
                <p className="font-semibold">{formatarData(data.dia.meta.data_referencia)}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/55 p-3">
                <p className="text-xs uppercase text-muted-foreground">Fechado por</p>
                <p className="font-semibold">{data.dia.meta.fechado_por_nome || '-'}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/55 p-3">
                <p className="text-xs uppercase text-muted-foreground">Fechado em</p>
                <p className="font-semibold">{formatarDataHora(data.dia.meta.fechado_em)}</p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-base font-semibold">Evolução do período</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={faturamentoChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis width={78} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tickLine={false} axisLine={false} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Line type="monotone" dataKey="total_liquido" name="Líquido" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="total_final" name="Resultado" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold">Recebimento por método</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metodosChartData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(value) => formatCurrencyCompact(Number(value))} tickLine={false} axisLine={false} />
                    <YAxis dataKey="label" type="category" width={112} tickLine={false} axisLine={false} />
                    <Tooltip content={<MethodTooltip />} />
                    <Bar dataKey="total" name="Total" radius={4}>
                      {metodosChartData.map((entry: FinanceiroMetodoResumo, index: number) => (
                        <Cell key={entry.metodo} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold">Composição do resultado</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={composicaoChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis width={78} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tickLine={false} axisLine={false} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Bar dataKey="valor" name="Valor" radius={4}>
                      {composicaoChartData.map((entry, index) => (
                        <Cell
                          key={entry.label}
                          fill={entry.valor < 0 ? 'var(--chart-4)' : CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold">Cancelamentos por dia</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cancelamentosChartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis width={78} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tickLine={false} axisLine={false} />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Bar dataKey="valor" name="Valor cancelado" fill="var(--chart-4)" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Resumo dia a dia</h2>
                <p className="text-sm text-muted-foreground">
                  {data.periodo.dias} dia(s) no período, com total líquido de {formatarMoeda(data.resumo_periodo.total_liquido)}.
                </p>
              </div>
              <Badge color="blue">{data.dias.length} registro(s)</Badge>
            </div>
            <Table
              columns={diasColumns}
              data={data.dias}
              keyExtractor={(item) => item.data_referencia}
              onRowClick={(item) => setSelectedDate(item.data_referencia)}
              emptyMessage="Nenhum dia encontrado no período."
              caption="Resumo financeiro dia a dia"
              className="[&_table]:min-w-[980px]"
            />
          </Card>

          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Receitas recebidas no período</h2>
                <p className="text-sm text-muted-foreground">
                  Lista dos valores que entraram entre {formatarData(data.periodo.data_inicio)} e {formatarData(data.periodo.data_fim)}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="green">{data.receitas_periodo.filter((receita) => !receita.cancelado).length} recebida(s)</Badge>
                <Badge color="blue">{formatarMoeda(data.resumo_periodo.total_liquido)} líquido</Badge>
              </div>
            </div>
            <Table
              columns={receitasPeriodoColumns}
              data={data.receitas_periodo}
              keyExtractor={(item) => `${item.data_referencia}:${item.id}`}
              emptyMessage="Nenhuma receita recebida nesse período."
              caption="Receitas recebidas no período"
              className="[&_table]:min-w-[1200px]"
            />
          </Card>

          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Pagamentos recebidos no dia</h2>
                <p className="text-sm text-muted-foreground">
                  Descritivo dos recebimentos, formas de pagamento, valores e cancelamentos.
                </p>
              </div>
              <Badge color="green">{data.dia.resultado.pagamentos_recebidos_dia.length} registro(s)</Badge>
            </div>
            <Table
              columns={pagamentosColumns}
              data={data.dia.resultado.pagamentos_recebidos_dia}
              keyExtractor={(item) => item.id}
              emptyMessage="Nenhum pagamento recebido nesse dia."
              caption="Pagamentos recebidos no dia"
              className="[&_table]:min-w-[1120px]"
            />
          </Card>

          <Card>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold">Profissionais no fechamento</h2>
                <p className="text-sm text-muted-foreground">
                  Leitura das diárias, comissões, ajustes e totais calculados para o dia.
                </p>
              </div>
              <Badge color="gray">{data.dia.resultado.dentistas.length} profissional(is)</Badge>
            </div>
            <Table
              columns={profissionaisColumns}
              data={data.dia.resultado.dentistas}
              keyExtractor={(item) => item.usuario_id}
              emptyMessage="Nenhum profissional encontrado nesse fechamento."
              caption="Profissionais no fechamento financeiro"
              className="[&_table]:min-w-[880px]"
            />
          </Card>
        </>
      ) : (
        <Alert type="info">Nenhum dado financeiro encontrado para os filtros selecionados.</Alert>
      )}
    </div>
  );
}
