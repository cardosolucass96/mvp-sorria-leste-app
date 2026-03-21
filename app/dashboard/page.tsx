'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, DollarSign, ArrowDownCircle, AlertTriangle, Target,
  ClipboardList, Users, TrendingUp, Banknote, BarChart2, Activity,
  Award, Star, Megaphone, Stethoscope,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import { STATUS_CONFIG } from '@/lib/constants/status';
import type { AtendimentoStatus } from '@/lib/types';
import { PageHeader, Card, Button, Input, StatCard, EmptyState, LoadingState, Alert } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';

interface DashboardData {
  resumo: {
    faturamento: number;
    aReceber: number;
    vencidas: number;
    parcelasVencidas: number;
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

export default function DashboardAdminPage() {
  usePageTitle('Dashboard');
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
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

      const res = await fetch(`/api/dashboard/admin?${params}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      setError('Erro ao carregar dashboard');
    }
    setLoading(false);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    // Permite acesso se o role real é admin (mesmo em modo dentista)
    if (!authLoading && (!user || !isAdmin)) {
      router.push('/');
    }
  }, [user, authLoading, router, isAdmin]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const aplicarPeriodo = (periodo: string) => {
    setPeriodoSelecionado(periodo);
    const hoje = new Date();
    let inicio = '';
    let fim = hoje.toISOString().split('T')[0];

    switch (periodo) {
      case 'hoje':
        inicio = fim;
        break;
      case 'semana':
        const semanaAtras = new Date(hoje);
        semanaAtras.setDate(semanaAtras.getDate() - 7);
        inicio = semanaAtras.toISOString().split('T')[0];
        break;
      case 'mes':
        const mesAtras = new Date(hoje);
        mesAtras.setMonth(mesAtras.getMonth() - 1);
        inicio = mesAtras.toISOString().split('T')[0];
        break;
      case 'trimestre':
        const trimestreAtras = new Date(hoje);
        trimestreAtras.setMonth(trimestreAtras.getMonth() - 3);
        inicio = trimestreAtras.toISOString().split('T')[0];
        break;
      case 'ano':
        const anoAtras = new Date(hoje);
        anoAtras.setFullYear(anoAtras.getFullYear() - 1);
        inicio = anoAtras.toISOString().split('T')[0];
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
            <Card className="bg-gradient-to-br from-success-500 to-success-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-success-100 text-sm">Faturamento</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.faturamento)}</p>
                </div>
                <DollarSign className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-warning-500 to-warning-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-warning-100 text-sm">A Receber</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.aReceber)}</p>
                </div>
                <ArrowDownCircle className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-error-500 to-error-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-error-100 text-sm">Parcelas Vencidas</p>
                  <p className="text-3xl font-bold">{formatCurrency(data.resumo.vencidas)}</p>
                  <p className="text-error-200 text-xs">{data.resumo.parcelasVencidas} parcelas</p>
                </div>
                <AlertTriangle className="w-10 h-10 opacity-30" aria-hidden="true" />
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Ticket Médio</p>
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
            <StatCard icon={<Banknote className="w-6 h-6" />} label="Comissões Pagas" value={formatCurrency(data.resumo.comissoesTotal)} color="border-yellow-400" />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Faturamento Mensal */}
            <Card>
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                Faturamento Mensal
              </h3>
              <div className="space-y-3">
                {data.faturamentoMensal.length > 0 ? (
                  data.faturamentoMensal.map((mes) => (
                    <div key={mes.mes} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-neutral-600">{formatMes(mes.mes)}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-8 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.max((mes.faturamento / maxFaturamento) * 100, 5)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
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
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary-500" />
                Atendimentos por Status
              </h3>
              <div className="space-y-3">
                {data.porStatus.map((status) => {
                  const config = STATUS_CONFIG[status.status as AtendimentoStatus];
                  return (
                    <div key={status.status} className="flex items-center gap-3">
                      <span className="w-40 text-sm text-neutral-600">{config?.label || status.status}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full ${config?.bgCor || 'bg-neutral-300'} rounded-full flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max((status.count / data.resumo.totalAtendimentos) * 100, 5)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{status.count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Faturamento por Canal */}
            <Card>
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary-500" />
                Faturamento por Canal de Aquisição
              </h3>
              <div className="space-y-3">
                {data.porCanal.map((canal, idx) => {
                  const colors = ['bg-info-500', 'bg-success-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
                  return (
                    <div key={canal.origem} className="flex items-center gap-3">
                      <span className="w-28 text-sm text-neutral-600 truncate">{canal.label}</span>
                      <div className="flex-1 bg-surface-muted rounded-full h-8 overflow-hidden">
                        <div
                          className={`h-full ${colors[idx % colors.length]} rounded-full flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max((canal.total / maxCanal) * 100, 10)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {formatCurrency(canal.total)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-neutral-400 w-20 text-right">{canal.count} atend.</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top Procedimentos */}
            <Card>
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary-500" />
                Top 10 Procedimentos
              </h3>
              <div className="space-y-2">
                {data.topProcedimentos.slice(0, 10).map((proc, idx) => (
                  <div key={proc.nome} className="flex items-center gap-3">
                    <span className="w-6 h-6 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full text-xs font-bold">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm text-neutral-700 truncate" title={proc.nome}>
                      {proc.nome}
                    </span>
                    <span className="text-sm font-medium text-foreground">{formatCurrency(proc.total)}</span>
                    <span className="text-xs text-neutral-400 w-12 text-right">{proc.count}x</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-primary-500" />
                Top Vendedores
              </h3>
              <div className="space-y-3">
                {data.topVendedores.length > 0 ? (
                  data.topVendedores.map((v, idx) => (
                    <div key={v.nome} className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-white font-bold text-sm ${
                        idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-neutral-400' : idx === 2 ? 'bg-warning-600' : 'bg-neutral-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium text-neutral-800">{v.nome}</span>
                      <span className="text-success-600 font-semibold">{formatCurrency(v.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted text-center py-4">Sem dados</p>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold mb-4 text-neutral-800 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary-500" />
                Top Executores
              </h3>
              <div className="space-y-3">
                {data.topExecutores.length > 0 ? (
                  data.topExecutores.map((e, idx) => (
                    <div key={e.nome} className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg">
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-white font-bold text-sm ${
                        idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-neutral-400' : idx === 2 ? 'bg-warning-600' : 'bg-neutral-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium text-neutral-800">{e.nome}</span>
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
