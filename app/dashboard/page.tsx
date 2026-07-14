'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, DollarSign, ArrowDownCircle, AlertTriangle, Target,
  ClipboardList, Users, TrendingUp, Banknote, BarChart2,
  Award, Star, Megaphone, Stethoscope,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import { STATUS_CONFIG } from '@/lib/constants/status';
import type { AtendimentoStatus } from '@/lib/types';
import { PageHeader, Card, Button, Input, StatCard, EmptyState, LoadingState, Alert } from '@/components/ui';
import { addDaysToClinicDateKey, getClinicDateKey } from '@/lib/time';
import usePageTitle from '@/lib/utils/usePageTitle';

interface DashboardData {
  resumo: {
    faturamento: number;
    aReceber: number;
    totalAtendimentos: number;
    totalClientes: number;
    ticketMedio: number;
    taxaConversao: number;
    comissoesTotal: number;
    atendimentosFinalizados: number;
  };
  porStatus: { status: string; count: number }[];
  porCanal: { origem: string; label: string; total: number; count: number }[];
  topProcedimentos: { nome: string; total: number; count: number }[];
  faturamentoMensal: { mes: string; faturamento: number; atendimentos: number }[];
  topVendedores: { nome: string; total: number }[];
  topExecutores: { nome: string; total: number }[];
}

function parseDateKeyAsUtcNoon(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateKey(
  dateKey: string,
  adjustments: { days?: number; months?: number; years?: number }
): string {
  const date = parseDateKeyAsUtcNoon(dateKey);

  if (adjustments.years) {
    date.setUTCFullYear(date.getUTCFullYear() + adjustments.years);
  }
  if (adjustments.months) {
    date.setUTCMonth(date.getUTCMonth() + adjustments.months);
  }
  if (adjustments.days) {
    date.setUTCDate(date.getUTCDate() + adjustments.days);
  }

  return formatUtcDateKey(date);
}

export default function DashboardAdminPage() {
  usePageTitle('Dashboard');
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
  const unitFetch = useUnitFetch();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [periodoSelecionado, setPeriodoSelecionado] = useState('todos');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);

      const res = await unitFetch(`/api/dashboard/admin?${params}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      setError('Erro ao carregar dashboard');
    }
    setLoading(false);
  }, [dataInicio, dataFim, unitFetch]);

  useEffect(() => {
    // Permite acesso se o role real é admin (mesmo em modo dentista)
    if (!authLoading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, authLoading, router, isAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchDashboard]);

  const aplicarPeriodo = (periodo: string) => {
    setPeriodoSelecionado(periodo);
    const hoje = getClinicDateKey();
    let inicio = '';
    let fim = hoje;

    switch (periodo) {
      case 'hoje':
        inicio = fim;
        break;
      case 'semana':
        inicio = addDaysToClinicDateKey(hoje, -7);
        break;
      case 'mes':
        inicio = shiftDateKey(hoje, { months: -1 });
        break;
      case 'trimestre':
        inicio = shiftDateKey(hoje, { months: -3 });
        break;
      case 'ano':
        inicio = shiftDateKey(hoje, { years: -1 });
        break;
      case 'todos':
        inicio = '';
        fim = '';
        break;
    }

    setDataInicio(inicio);
    setDataFim(fim);
  };

  const formatCurrency = formatarMoeda;

  const formatMes = (mes: string) => {
    const [ano, mesNum] = mes.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
  };

  if (authLoading || !user || !isAdmin) {
    return null;
  }

  const maxFaturamento = data?.faturamentoMensal.reduce((max, m) => Math.max(max, m.faturamento), 0) || 1;
  const maxCanal = data?.porCanal.reduce((max, c) => Math.max(max, c.total), 0) || 1;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {/* Header */}
      <PageHeader
        title="Dashboard"
        icon={<LayoutDashboard className="w-7 h-7" />}
        description="Visão geral do desempenho da clínica"
        actions={
          <div className="flex flex-wrap gap-2">
            {['hoje', 'semana', 'mes', 'trimestre', 'ano', 'todos'].map((periodo) => (
              <Button
                key={periodo}
                size="sm"
                variant={periodoSelecionado === periodo ? 'primary' : 'secondary'}
                onClick={() => aplicarPeriodo(periodo)}
              >
                {periodo === 'hoje' && 'Hoje'}
                {periodo === 'semana' && '7 dias'}
                {periodo === 'mes' && '30 dias'}
                {periodo === 'trimestre' && '3 meses'}
                {periodo === 'ano' && '1 ano'}
                {periodo === 'todos' && 'Todos'}
              </Button>
            ))}
          </div>
        }
      />

      {/* Filtros de Data Customizados */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="w-44">
          <Input
            label="Data Início"
            name="data_inicio"
            type="date"
            value={dataInicio}
            onChange={(val) => {
              setDataInicio(val);
              setPeriodoSelecionado('');
            }}
          />
        </div>
        <div className="w-44">
          <Input
            label="Data Fim"
            name="data_fim"
            type="date"
            value={dataFim}
            onChange={(val) => {
              setDataFim(val);
              setPeriodoSelecionado('');
            }}
          />
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setDataInicio('');
            setDataFim('');
            setPeriodoSelecionado('todos');
          }}
        >
          Limpar
        </Button>
      </div>

      {loading ? (
        <LoadingState text="Carregando dados..." />
      ) : data ? (
        <>
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-success-500 to-success-600 text-success-50 border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-success-100 text-sm">Faturamento</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.faturamento)}</p>
                </div>
                <DollarSign className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-warning-500 to-warning-600 text-warning-50 border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-warning-100 text-sm">A Receber</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.aReceber)}</p>
                </div>
                <ArrowDownCircle className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-evaluation-500 to-evaluation-600 text-evaluation-50 border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-evaluation-100 text-sm">Ticket Médio</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.ticketMedio)}</p>
                </div>
                <Target className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>
          </div>

          {/* Segunda linha de cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<ClipboardList className="w-6 h-6" />} label="Total Atendimentos" value={data.resumo.totalAtendimentos} color="border-primary-400" />
            <StatCard icon={<Users className="w-6 h-6" />} label="Total Clientes" value={data.resumo.totalClientes} color="border-info-400" />
            <StatCard icon={<TrendingUp className="w-6 h-6" />} label="Taxa de Conversão" value={`${data.resumo.taxaConversao}%`} color="border-success-400" />
            <StatCard icon={<Banknote className="w-6 h-6" />} label="Comissões Pagas" value={formatCurrency(data.resumo.comissoesTotal)} color="border-warning-400" />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Faturamento Mensal */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                Faturamento Mensal
              </h3>
              <div className="space-y-3">
                {data.faturamentoMensal.length > 0 ? (
                  data.faturamentoMensal.map((mes) => (
                    <div key={mes.mes} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-muted-foreground">{formatMes(mes.mes)}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-8 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.max((mes.faturamento / maxFaturamento) * 100, 5)}%` }}
                        >
                          <span className="text-xs text-primary-50 font-medium">
                            {formatCurrency(mes.faturamento)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted text-center py-4">Sem dados no período</p>
                )}
              </div>
            </Card>

            {/* Atendimentos por Status */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <BarChart2 className="w-4 h-4 text-primary-500" />
                Atendimentos por Status
              </h3>
              <div className="space-y-3">
                {data.porStatus.map((status) => {
                  const config = STATUS_CONFIG[status.status as AtendimentoStatus];
                  return (
                    <div key={status.status} className="flex items-center gap-3">
                      <span className="w-40 text-sm text-muted-foreground">{config?.label || status.status}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-6 overflow-hidden">
                          <div
                          className={`h-full ${config?.bgCor || 'bg-muted'} rounded-full flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max((status.count / data.resumo.totalAtendimentos) * 100, 5)}%` }}
                        >
                          <span className={`text-xs font-medium ${config?.cor || 'text-foreground'}`}>{status.count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Faturamento por Canal */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Megaphone className="w-4 h-4 text-primary-500" />
                Faturamento por Canal de Aquisição
              </h3>
              <div className="space-y-3">
                {data.porCanal.map((canal, idx) => {
                  const colors = ['bg-info-500', 'bg-success-500', 'bg-evaluation-500', 'bg-dentist-500', 'bg-warning-500'];
                  const textColors = ['text-info-50', 'text-success-50', 'text-evaluation-50', 'text-dentist-50', 'text-warning-50'];
                  return (
                    <div key={canal.origem} className="flex items-center gap-3">
                      <span className="w-28 truncate text-sm text-muted-foreground">{canal.label}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-8 overflow-hidden">
                        <div
                          className={`h-full ${colors[idx % colors.length]} rounded-full flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max((canal.total / maxCanal) * 100, 10)}%` }}
                        >
                          <span className={`text-xs font-medium ${textColors[idx % textColors.length]}`}>
                            {formatCurrency(canal.total)}
                          </span>
                        </div>
                      </div>
                      <span className="w-20 text-right text-xs text-muted-foreground">{canal.count} atend.</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top Procedimentos */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Stethoscope className="w-4 h-4 text-primary-500" />
                Top 10 Procedimentos
              </h3>
              <div className="space-y-2">
                {data.topProcedimentos.slice(0, 10).map((proc, idx) => (
                  <div key={proc.nome} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate text-sm text-foreground" title={proc.nome}>
                      {proc.nome}
                    </span>
                    <span className="text-sm font-medium text-foreground">{formatCurrency(proc.total)}</span>
                    <span className="w-12 text-right text-xs text-muted-foreground">{proc.count}x</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Award className="w-4 h-4 text-primary-500" />
                Top Vendedores
              </h3>
              <div className="space-y-3">
                {data.topVendedores.length > 0 ? (
                  data.topVendedores.map((v, idx) => (
                    <div key={v.nome} className="flex items-center gap-3 rounded-lg bg-secondary/55 p-3">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                          idx === 0 ? 'bg-warning-500 text-warning-50' : idx === 1 ? 'bg-muted/45 text-foreground' : idx === 2 ? 'bg-warning-600 text-warning-50' : 'bg-muted/30 text-foreground'
                        }`}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium text-foreground">{v.nome}</span>
                      <span className="text-success-600 font-semibold">{formatCurrency(v.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted text-center py-4">Sem dados</p>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
                <Star className="w-4 h-4 text-primary-500" />
                Top Executores
              </h3>
              <div className="space-y-3">
                {data.topExecutores.length > 0 ? (
                  data.topExecutores.map((e, idx) => (
                    <div key={e.nome} className="flex items-center gap-3 rounded-lg bg-secondary/55 p-3">
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                        idx === 0 ? 'bg-warning-500 text-warning-50' : idx === 1 ? 'bg-muted/45 text-foreground' : idx === 2 ? 'bg-warning-600 text-warning-50' : 'bg-muted/30 text-foreground'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium text-foreground">{e.nome}</span>
                      <span className="text-info-600 font-semibold">{formatCurrency(e.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted text-center py-4">Sem dados</p>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12 text-error-400" />}
          title="Erro ao carregar dados"
          description="Tente recarregar a página"
        />
      )}
    </div>
  );
}
