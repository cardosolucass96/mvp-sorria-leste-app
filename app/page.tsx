'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import LoadingState from '@/components/ui/LoadingState';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  usePageTitle('Início');
  const { user, hasRole, effectiveRole, viewMode } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      carregarDados();
    }
  }, [user?.id, viewMode]);

  async function carregarDados() {
    try {
      const roleParaAPI = effectiveRole || user?.role;
      const response = await fetch(`/api/dashboard?usuario_id=${user?.id}&role=${roleParaAPI}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingState text="Carregando painel..." />;
  }

  // ===========================
  // TELA DO ADMIN
  // ===========================
  if (effectiveRole === 'admin') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            🏥 Painel Administrativo
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, {user?.nome?.split(' ')[0]}! Visão geral do sistema.
          </p>
        </div>

        {/* Cards de Resumo - Admin vê tudo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <p className="text-sm text-muted">Total Clientes</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.totalClientes || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos" className="card hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-muted">Atendimentos Hoje</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.atendimentosHoje || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-sm text-muted">Aguardando Pagamento</p>
                <p className="text-2xl font-bold">{stats?.aguardandoPagamento || 0}</p>
              </div>
            </div>
          </Link>

          <div className="card">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-100 rounded-full">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-sm text-muted">Finalizados Hoje</p>
                <p className="text-2xl font-bold">{stats?.finalizadosHoje || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Segunda linha de cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-400">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Fila de Avaliação</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.emAvaliacao || 0}</p>
              </div>
              <span className="text-3xl">🔍</span>
            </div>
          </Link>

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Em Execução</p>
                <p className="text-2xl font-bold text-primary-700">{stats?.emExecucao || 0}</p>
              </div>
              <span className="text-3xl">🦷</span>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow border-l-4 border-error-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-error-600">{stats?.parcelasVencidas || 0}</p>
              </div>
              <span className="text-3xl">⚠️</span>
            </div>
          </Link>
        </div>

        {/* Ações Rápidas */}
        <div className="card bg-gradient-to-r from-primary-50 to-warning-50">
          <h2 className="text-xl font-semibold mb-4 text-primary-800">⚡ Ações Rápidas</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link href="/clientes/novo" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
              <span className="text-3xl">➕</span>
              <span className="text-sm font-medium text-center text-primary-800">Novo Cliente</span>
            </Link>
            <Link href="/atendimentos/novo" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
              <span className="text-3xl">📝</span>
              <span className="text-sm font-medium text-center text-primary-800">Novo Atendimento</span>
            </Link>
            <Link href="/avaliacao" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
              <span className="text-3xl">🔍</span>
              <span className="text-sm font-medium text-center text-primary-800">Fila Avaliação</span>
            </Link>
            <Link href="/comissoes" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
              <span className="text-3xl">💵</span>
              <span className="text-sm font-medium text-center text-primary-800">Comissões</span>
            </Link>
            <Link href="/usuarios" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
              <span className="text-3xl">👤</span>
              <span className="text-sm font-medium text-center text-primary-800">Usuários</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO ATENDENTE
  // ===========================
  if (effectiveRole === 'atendente') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            👋 Olá, {user?.nome?.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-neutral-600">
            Área de Recepção - Atendimento ao Cliente
          </p>
        </div>

        {/* Cards principais para atendente */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">👥</span>
              </div>
              <div>
                <p className="text-sm text-muted">Clientes Cadastrados</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.totalClientes || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-warning-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-muted">Atendimentos Hoje</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.atendimentosHoje || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-400">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-muted">Aguardando Pagamento</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.aguardandoPagamento || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow border-l-4 border-error-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-error-100 rounded-full">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <p className="text-sm text-muted">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-error-600">{stats?.parcelasVencidas || 0}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ações Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/clientes/novo" className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-primary-50 border-2 border-primary-200">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-primary-500 rounded-full">
                <span className="text-3xl">➕</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-primary-900">Cadastrar Novo Cliente</h3>
                <p className="text-sm text-primary-700">Registrar um novo paciente no sistema</p>
              </div>
            </div>
          </Link>

          <Link href="/atendimentos/novo" className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-warning-50 border-2 border-warning-200">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-warning-500 rounded-full">
                <span className="text-3xl">📝</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-warning-900">Novo Atendimento</h3>
                <p className="text-sm text-warning-700">Iniciar atendimento para cliente existente</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Links secundários */}
        <div className="card bg-gradient-to-r from-primary-50 to-warning-50">
          <h2 className="text-lg font-semibold mb-4 text-primary-800">🔗 Acesso Rápido</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/clientes" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all border border-primary-100">
              <span className="text-2xl">🔍</span>
              <span className="text-sm text-primary-800">Buscar Cliente</span>
            </Link>
            <Link href="/atendimentos" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all border border-primary-100">
              <span className="text-2xl">📋</span>
              <span className="text-sm text-primary-800">Ver Atendimentos</span>
            </Link>
            <Link href="/pagamentos" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all border border-primary-100">
              <span className="text-2xl">💳</span>
              <span className="text-sm text-primary-800">Pagamentos</span>
            </Link>
            <Link href="/minhas-comissoes" className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all border border-primary-100">
              <span className="text-2xl">💰</span>
              <span className="text-sm text-primary-800">Minhas Comissões</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO AVALIADOR
  // ===========================
  if (effectiveRole === 'avaliador') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            🔍 Área do Avaliador
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! Sua fila de avaliações.
          </p>
        </div>

        {/* Cards principais para avaliador */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <p className="text-sm text-muted">Meus Atendimentos</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.meusAtendimentosAvaliacao || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-warning-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-muted">Disponíveis para Pegar</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.atendimentosDisponiveisAvaliacao || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/minhas-comissoes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-success-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-muted">Comissões (Este Mês)</p>
                <p className="text-2xl font-bold text-success-600">{formatarMoeda(stats?.minhasComissoes || 0)}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ação Principal */}
        <Link href="/avaliacao" className="block">
          <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-primary-50 to-warning-50 border-2 border-primary-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-primary-500 rounded-full">
                  <span className="text-4xl">🔍</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-primary-900">Acessar Fila de Avaliação</h3>
                  <p className="text-primary-700">
                    {(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimentos aguardando
                  </p>
                </div>
              </div>
              <span className="text-4xl text-primary-500">→</span>
            </div>
          </div>
        </Link>

        {/* Info de Comissões */}
        <div className="card bg-success-50 border border-success-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-success-900">💵 Suas Comissões de Venda</h3>
              <p className="text-sm text-success-700">Comissão sobre procedimentos que você vendeu</p>
            </div>
            <Link href="/minhas-comissoes" className="btn bg-success-600 text-white hover:bg-success-700">
              Ver Detalhes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===========================
  // TELA DO EXECUTOR (ou Admin em modo dentista)
  // ===========================
  if (effectiveRole === 'executor') {
    const isDentista = user?.role === 'admin';
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            🦷 {isDentista ? 'Área do Dentista' : 'Área do Executor'}
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! {isDentista ? 'Suas filas de avaliação e execução.' : 'Sua fila de procedimentos.'}
          </p>
        </div>

        {/* Cards principais */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isDentista ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
          {isDentista && (
            <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-purple-500">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <span className="text-2xl">🔍</span>
                </div>
                <div>
                  <p className="text-sm text-muted">Fila Avaliação</p>
                  <p className="text-2xl font-bold text-purple-600">{(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)}</p>
                </div>
              </div>
            </Link>
          )}

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <p className="text-sm text-muted">Meus Procedimentos</p>
                <p className="text-2xl font-bold text-primary-600">{stats?.meusProcedimentos || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-warning-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning-100 rounded-full">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-sm text-muted">Disponíveis para Pegar</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.procedimentosDisponiveis || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/meus-procedimentos" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-success-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-100 rounded-full">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-sm text-muted">Comissões (Este Mês)</p>
                <p className="text-2xl font-bold text-success-600">{formatarMoeda(stats?.minhasComissoes || 0)}</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Ações Rápidas */}
        <div className={`grid grid-cols-1 ${isDentista ? 'md:grid-cols-2' : ''} gap-4`}>
          {isDentista && (
            <Link href="/avaliacao" className="block">
              <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-purple-500 rounded-full">
                      <span className="text-3xl">🔍</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-purple-900">Fila de Avaliação</h3>
                      <p className="text-purple-700">
                        {(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimentos aguardando
                      </p>
                    </div>
                  </div>
                  <span className="text-3xl text-purple-500">→</span>
                </div>
              </div>
            </Link>
          )}

          <Link href="/execucao" className="block">
            <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-primary-50 to-warning-50 border-2 border-primary-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-primary-500 rounded-full">
                    <span className="text-3xl">🦷</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-primary-900">Fila de Execução</h3>
                    <p className="text-primary-700">
                      {(stats?.meusProcedimentos || 0) + (stats?.procedimentosDisponiveis || 0)} procedimentos na fila
                    </p>
                  </div>
                </div>
                <span className="text-3xl text-primary-500">→</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Meus Procedimentos */}
        <Link href="/meus-procedimentos" className="block">
          <div className="card bg-success-50 border border-success-200 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-success-900">📋 Meus Procedimentos</h3>
                <p className="text-sm text-success-700">Histórico completo de avaliações e execuções</p>
              </div>
              <span className="btn bg-success-600 text-white hover:bg-success-700">
                Ver Detalhes
              </span>
            </div>
          </div>
        </Link>
      </div>
    );
  }

  // ===========================
  // FALLBACK (usuário sem role definido)
  // ===========================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          🦷 Bem-vindo ao Sorria Leste!
        </h1>
        <p className="mt-2 text-neutral-600">
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
