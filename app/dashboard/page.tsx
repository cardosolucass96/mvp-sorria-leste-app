'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

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

const statusLabels: Record<string, string> = {
  triagem: 'Triagem',
  avaliacao: 'Avaliação',
  aguardando_pagamento: 'Aguardando Pagamento',
  em_execucao: 'Em Execução',
  finalizado: 'Finalizado',
};

const statusColors: Record<string, string> = {
  triagem: 'bg-gray-500',
  avaliacao: 'bg-orange-500',
  aguardando_pagamento: 'bg-amber-500',
  em_execucao: 'bg-blue-500',
  finalizado: 'bg-green-500',
};

export default function DashboardAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [periodoSelecionado, setPeriodoSelecionado] = useState('todos');

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetchDashboard();
  }, [dataInicio, dataFim]);

  const fetchDashboard = async () => {
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
    }
    setLoading(false);
  };

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatMes = (mes: string) => {
    const [ano, mesNum] = mes.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mesNum) - 1]}/${ano.slice(2)}`;
  };

  if (authLoading || !user || user.role !== 'admin') {
    return null;
  }

  const maxFaturamento = data?.faturamentoMensal.reduce((max, m) => Math.max(max, m.faturamento), 0) || 1;
  const maxCanal = data?.porCanal.reduce((max, c) => Math.max(max, c.total), 0) || 1;
  const maxProcedimento = data?.topProcedimentos.reduce((max, p) => Math.max(max, p.total), 0) || 1;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📊 Dashboard Administrativo</h1>
            <p className="text-gray-600">Visão geral do desempenho da clínica</p>
          </div>
          
          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {['hoje', 'semana', 'mes', 'trimestre', 'ano', 'todos'].map((periodo) => (
              <button
                key={periodo}
                onClick={() => aplicarPeriodo(periodo)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  periodoSelecionado === periodo
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {periodo === 'hoje' && 'Hoje'}
                {periodo === 'semana' && '7 dias'}
                {periodo === 'mes' && '30 dias'}
                {periodo === 'trimestre' && '3 meses'}
                {periodo === 'ano' && '1 ano'}
                {periodo === 'todos' && 'Todos'}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros de Data Customizados */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                setPeriodoSelecionado('');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                setPeriodoSelecionado('');
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={() => {
              setDataInicio('');
              setDataFim('');
              setPeriodoSelecionado('todos');
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Limpar
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando dados...</p>
          </div>
        ) : data ? (
          <>
            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Faturamento */}
              <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm">Faturamento</p>
                    <p className="text-3xl font-bold">{formatCurrency(data.resumo.faturamento)}</p>
                  </div>
                  <span className="text-5xl opacity-50">💰</span>
                </div>
              </div>

              {/* A Receber */}
              <div className="card bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-amber-100 text-sm">A Receber</p>
                    <p className="text-3xl font-bold">{formatCurrency(data.resumo.aReceber)}</p>
                  </div>
                  <span className="text-5xl opacity-50">📥</span>
                </div>
              </div>

              {/* Vencidas */}
              <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm">Parcelas Vencidas</p>
                    <p className="text-3xl font-bold">{formatCurrency(data.resumo.vencidas)}</p>
                    <p className="text-red-200 text-xs">{data.resumo.parcelasVencidas} parcelas</p>
                  </div>
                  <span className="text-5xl opacity-50">⚠️</span>
                </div>
              </div>

              {/* Ticket Médio */}
              <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100 text-sm">Ticket Médio</p>
                    <p className="text-3xl font-bold">{formatCurrency(data.resumo.ticketMedio)}</p>
                  </div>
                  <span className="text-5xl opacity-50">🎯</span>
                </div>
              </div>
            </div>

            {/* Segunda linha de cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-full">
                    <span className="text-2xl">📋</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Atendimentos</p>
                    <p className="text-2xl font-bold text-gray-900">{data.resumo.totalAtendimentos}</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <span className="text-2xl">👥</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Clientes</p>
                    <p className="text-2xl font-bold text-gray-900">{data.resumo.totalClientes}</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-full">
                    <span className="text-2xl">✅</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Taxa de Conversão</p>
                    <p className="text-2xl font-bold text-gray-900">{data.resumo.taxaConversao}%</p>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-yellow-100 rounded-full">
                    <span className="text-2xl">💵</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Comissões Pagas</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.resumo.comissoesTotal)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Faturamento Mensal */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">📈 Faturamento Mensal</h3>
                <div className="space-y-3">
                  {data.faturamentoMensal.length > 0 ? (
                    data.faturamentoMensal.map((mes) => (
                      <div key={mes.mes} className="flex items-center gap-3">
                        <span className="w-16 text-sm text-gray-600">{formatMes(mes.mes)}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-end pr-2"
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
                    <p className="text-gray-500 text-center py-4">Sem dados no período</p>
                  )}
                </div>
              </div>

              {/* Atendimentos por Status */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">📊 Atendimentos por Status</h3>
                <div className="space-y-3">
                  {data.porStatus.map((status) => (
                    <div key={status.status} className="flex items-center gap-3">
                      <span className="w-40 text-sm text-gray-600">{statusLabels[status.status]}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full ${statusColors[status.status]} rounded-full flex items-center justify-end pr-2`}
                          style={{ width: `${Math.max((status.count / data.resumo.totalAtendimentos) * 100, 5)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{status.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Faturamento por Canal */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">📣 Faturamento por Canal de Aquisição</h3>
                <div className="space-y-3">
                  {data.porCanal.map((canal, idx) => {
                    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
                    return (
                      <div key={canal.origem} className="flex items-center gap-3">
                        <span className="w-28 text-sm text-gray-600 truncate">{canal.label}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden">
                          <div
                            className={`h-full ${colors[idx % colors.length]} rounded-full flex items-center justify-end pr-2`}
                            style={{ width: `${Math.max((canal.total / maxCanal) * 100, 10)}%` }}
                          >
                            <span className="text-xs text-white font-medium">
                              {formatCurrency(canal.total)}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 w-20 text-right">{canal.count} atend.</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Procedimentos */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">🦷 Top 10 Procedimentos</h3>
                <div className="space-y-2">
                  {data.topProcedimentos.slice(0, 10).map((proc, idx) => (
                    <div key={proc.nome} className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-orange-100 text-orange-600 rounded-full text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm text-gray-700 truncate" title={proc.nome}>
                        {proc.nome}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(proc.total)}</span>
                      <span className="text-xs text-gray-400 w-12 text-right">{proc.count}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Vendedores */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">🏆 Top Vendedores</h3>
                <div className="space-y-3">
                  {data.topVendedores.length > 0 ? (
                    data.topVendedores.map((v, idx) => (
                      <div key={v.nome} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full text-white font-bold ${
                          idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 font-medium text-gray-800">{v.nome}</span>
                        <span className="text-green-600 font-semibold">{formatCurrency(v.total)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">Sem dados</p>
                  )}
                </div>
              </div>

              {/* Top Executores */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-gray-800">⭐ Top Executores</h3>
                <div className="space-y-3">
                  {data.topExecutores.length > 0 ? (
                    data.topExecutores.map((e, idx) => (
                      <div key={e.nome} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <span className={`w-8 h-8 flex items-center justify-center rounded-full text-white font-bold ${
                          idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 font-medium text-gray-800">{e.nome}</span>
                        <span className="text-blue-600 font-semibold">{formatCurrency(e.total)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">Sem dados</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">Erro ao carregar dados</p>
          </div>
        )}
      </div>
  );
}
