'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardStats {
  totalClientes: number;
  atendimentosHoje: number;
  aguardandoPagamento: number;
  finalizadosHoje: number;
  emExecucao: number;
  emAvaliacao: number;
  parcelasVencidas: number;
  minhasComissoes: number;
  meusProcedimentos: number;
  procedimentosDisponiveis: number;
  meusAtendimentosAvaliacao: number;
  atendimentosDisponiveisAvaliacao: number;
}

export default function Home() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      carregarDados();
    }
  }, [user?.id]);

  async function carregarDados() {
    try {
      const response = await fetch(`/api/dashboard?usuario_id=${user?.id}&role=${user?.role}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO ADMIN
  // ===========================
  if (user?.role === 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            🏥 Painel Administrativo
          </h1>
          <p className="mt-2 text-gray-600">
            Olá, {user?.nome?.split(' ')[0]}! Visão geral do sistema.
          </p>
        </div>

        {/* Cards de Resumo - Admin vê tudo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Clientes</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.totalClientes || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos" className="card hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Atendimentos Hoje</p>
                <p className="text-2xl font-bold text-amber-600">{stats?.atendimentosHoje || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Aguardando Pagamento</p>
                <p className="text-2xl font-bold">{stats?.aguardandoPagamento || 0}</p>
              </div>
            </div>
          </Link>

          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Finalizados Hoje</p>
                <p className="text-2xl font-bold">{stats?.finalizadosHoje || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Segunda linha de cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-400">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Fila de Avaliação</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.emAvaliacao || 0}</p>
              </div>
              <span className="text-3xl">🔍</span>
            </div>
          </Link>

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Em Execução</p>
                <p className="text-2xl font-bold text-orange-700">{stats?.emExecucao || 0}</p>
              </div>
              <span className="text-3xl">🦷</span>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{stats?.parcelasVencidas || 0}</p>
              </div>
              <span className="text-3xl">⚠️</span>
            </div>
          </Link>
        </div>

        {/* Ações Rápidas */}
        <div className="card bg-gradient-to-r from-orange-50 to-amber-50">
          <h2 className="text-xl font-semibold mb-4 text-orange-800">⚡ Ações Rápidas</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link href="/clientes/novo" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all hover:shadow-md border border-orange-100">
              <span className="text-3xl">➕</span>
              <span className="text-sm font-medium text-center text-orange-800">Novo Cliente</span>
            </Link>
            <Link href="/atendimentos/novo" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all hover:shadow-md border border-orange-100">
              <span className="text-3xl">📝</span>
              <span className="text-sm font-medium text-center text-orange-800">Novo Atendimento</span>
            </Link>
            <Link href="/avaliacao" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all hover:shadow-md border border-orange-100">
              <span className="text-3xl">🔍</span>
              <span className="text-sm font-medium text-center text-orange-800">Fila Avaliação</span>
            </Link>
            <Link href="/comissoes" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all hover:shadow-md border border-orange-100">
              <span className="text-3xl">💵</span>
              <span className="text-sm font-medium text-center text-orange-800">Comissões</span>
            </Link>
            <Link href="/usuarios" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all hover:shadow-md border border-orange-100">
              <span className="text-3xl">👤</span>
              <span className="text-sm font-medium text-center text-orange-800">Usuários</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO ATENDENTE
  // ===========================
  if (user?.role === 'atendente') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            👋 Olá, {user?.nome?.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-gray-600">
            Área de Recepção - Atendimento ao Cliente
          </p>
        </div>

        {/* Cards principais para atendente */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Clientes Cadastrados</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.totalClientes || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-amber-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Atendimentos Hoje</p>
                <p className="text-2xl font-bold text-amber-600">{stats?.atendimentosHoje || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-400">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Aguardando Pagamento</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.aguardandoPagamento || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow border-l-4 border-red-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{stats?.parcelasVencidas || 0}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ações Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/clientes/novo" className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-orange-50 border-2 border-orange-200">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-orange-500 rounded-full">
                <span className="text-3xl">➕</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-orange-900">Cadastrar Novo Cliente</h3>
                <p className="text-sm text-orange-700">Registrar um novo paciente no sistema</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos/novo" className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-amber-50 border-2 border-amber-200">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-amber-500 rounded-full">
                <span className="text-3xl">📝</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-amber-900">Novo Atendimento</h3>
                <p className="text-sm text-amber-700">Iniciar atendimento para cliente existente</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Links secundários */}
        <div className="card bg-gradient-to-r from-orange-50 to-amber-50">
          <h2 className="text-lg font-semibold mb-4 text-orange-800">🔗 Acesso Rápido</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/clientes" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all border border-orange-100">
              <span className="text-2xl">🔍</span>
              <span className="text-sm text-orange-800">Buscar Cliente</span>
            </Link>
            <Link href="/atendimentos" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all border border-orange-100">
              <span className="text-2xl">📋</span>
              <span className="text-sm text-orange-800">Ver Atendimentos</span>
            </Link>
            <Link href="/pagamentos" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all border border-orange-100">
              <span className="text-2xl">💳</span>
              <span className="text-sm text-orange-800">Pagamentos</span>
            </Link>
            <Link href="/minhas-comissoes" className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl hover:bg-orange-50 transition-all border border-orange-100">
              <span className="text-2xl">💰</span>
              <span className="text-sm text-orange-800">Minhas Comissões</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO AVALIADOR
  // ===========================
  if (user?.role === 'avaliador') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            🔍 Área do Avaliador
          </h1>
          <p className="mt-2 text-gray-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! Sua fila de avaliações.
          </p>
        </div>

        {/* Cards principais para avaliador */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Meus Atendimentos</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.meusAtendimentosAvaliacao || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-amber-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Disponíveis para Pegar</p>
                <p className="text-2xl font-bold text-amber-600">{stats?.atendimentosDisponiveisAvaliacao || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/minhas-comissoes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-green-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Comissões (Este Mês)</p>
                <p className="text-2xl font-bold text-green-600">{formatarMoeda(stats?.minhasComissoes || 0)}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ação Principal */}
        <Link href="/avaliacao" className="block">
          <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-orange-500 rounded-full">
                  <span className="text-4xl">🔍</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-orange-900">Acessar Fila de Avaliação</h3>
                  <p className="text-orange-700">
                    {(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimentos aguardando
                  </p>
                </div>
              </div>
              <span className="text-4xl text-orange-500">→</span>
            </div>
          </div>
        </Link>

        {/* Info de Comissões */}
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-900">💵 Suas Comissões de Venda</h3>
              <p className="text-sm text-green-700">Comissão sobre procedimentos que você vendeu</p>
            </div>
            <Link href="/minhas-comissoes" className="btn bg-green-600 text-white hover:bg-green-700">
              Ver Detalhes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO EXECUTOR
  // ===========================
  if (user?.role === 'executor') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            🦷 Área do Executor
          </h1>
          <p className="mt-2 text-gray-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! Sua fila de procedimentos.
          </p>
        </div>

        {/* Cards principais para executor */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-orange-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Meus Procedimentos</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.meusProcedimentos || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-amber-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Disponíveis para Pegar</p>
                <p className="text-2xl font-bold text-amber-600">{stats?.procedimentosDisponiveis || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/minhas-comissoes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-green-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Comissões (Este Mês)</p>
                <p className="text-2xl font-bold text-green-600">{formatarMoeda(stats?.minhasComissoes || 0)}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ação Principal */}
        <Link href="/execucao" className="block">
          <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-orange-500 rounded-full">
                  <span className="text-4xl">🦷</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-orange-900">Acessar Fila de Execução</h3>
                  <p className="text-orange-700">
                    {(stats?.meusProcedimentos || 0) + (stats?.procedimentosDisponiveis || 0)} procedimentos na fila
                  </p>
                </div>
              </div>
              <span className="text-4xl text-orange-500">→</span>
            </div>
          </div>
        </Link>

        {/* Info de Comissões */}
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-900">💵 Suas Comissões de Execução</h3>
              <p className="text-sm text-green-700">Comissão sobre procedimentos que você executou</p>
            </div>
            <Link href="/minhas-comissoes" className="btn bg-green-600 text-white hover:bg-green-700">
              Ver Detalhes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // FALLBACK (usuário sem role definido)
  // ===========================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          🦷 Bem-vindo ao Sorria Leste!
        </h1>
        <p className="mt-2 text-gray-600">
          Sistema de Gestão Odontológica
        </p>
      </div>

      <div className="card bg-yellow-50 border border-yellow-200">
        <p className="text-yellow-800">
          ⚠️ Seu perfil não está configurado corretamente. Entre em contato com o administrador.
        </p>
      </div>
    </div>
  );
}
