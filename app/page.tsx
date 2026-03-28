'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Users, ClipboardList, Clock, CheckCircle, Search, Activity,
  AlertTriangle, UserPlus, FileEdit, Banknote, User, CreditCard,
  ChevronRight, Stethoscope, LayoutDashboard,
} from 'lucide-react';
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
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-primary-500" aria-hidden="true" />
            Painel Administrativo
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, {user?.nome?.split(' ')[0]}! Visão geral do sistema.
          </p>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <Users className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <ClipboardList className="w-6 h-6 text-warning-600" aria-hidden="true" />
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
                <Clock className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <CheckCircle className="w-6 h-6 text-success-600" aria-hidden="true" />
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
              <Search className="w-8 h-8 text-primary-300" aria-hidden="true" />
            </div>
          </Link>

          <Link href="/execucao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Em Execução</p>
                <p className="text-2xl font-bold text-primary-700">{stats?.emExecucao || 0}</p>
              </div>
              <Activity className="w-8 h-8 text-primary-300" aria-hidden="true" />
            </div>
          </Link>

          <Link href="/pagamentos" className="card hover:shadow-lg transition-shadow border-l-4 border-error-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-error-600">{stats?.parcelasVencidas || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-error-300" aria-hidden="true" />
            </div>
          </Link>
        </div>

        {/* Ações Rápidas */}
        <div className="card bg-gradient-to-r from-primary-50 to-warning-50">
          <h2 className="text-base font-semibold mb-4 text-primary-800">Ações Rápidas</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { href: '/clientes/novo', Icon: UserPlus, label: 'Novo Cliente' },
              { href: '/atendimentos/novo', Icon: FileEdit, label: 'Novo Atendimento' },
              { href: '/avaliacao', Icon: Search, label: 'Fila Avaliação' },
              { href: '/comissoes', Icon: Banknote, label: 'Comissões' },
              { href: '/usuarios', Icon: User, label: 'Usuários' },
            ].map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all hover:shadow-md border border-primary-100">
                <Icon className="w-7 h-7 text-primary-500" aria-hidden="true" />
                <span className="text-sm font-medium text-center text-primary-800">{label}</span>
              </Link>
            ))}
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
            Olá, {user?.nome?.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-neutral-600">
            Área de Recepção — Atendimento ao Cliente
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/clientes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <Users className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <ClipboardList className="w-6 h-6 text-warning-600" aria-hidden="true" />
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
                <CreditCard className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <AlertTriangle className="w-6 h-6 text-error-600" aria-hidden="true" />
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
                <UserPlus className="w-7 h-7 text-white" aria-hidden="true" />
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
                <FileEdit className="w-7 h-7 text-white" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-warning-900">Novo Atendimento</h3>
                <p className="text-sm text-warning-700">Iniciar atendimento para cliente existente</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Acesso Rápido */}
        <div className="card bg-gradient-to-r from-primary-50 to-warning-50">
          <h2 className="text-base font-semibold mb-4 text-primary-800">Acesso Rápido</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { href: '/clientes', Icon: Search, label: 'Buscar Cliente' },
              { href: '/atendimentos', Icon: ClipboardList, label: 'Ver Atendimentos' },
              { href: '/pagamentos', Icon: CreditCard, label: 'Pagamentos' },
              { href: '/minhas-comissoes', Icon: Banknote, label: 'Minhas Comissões' },
            ].map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-2 p-4 bg-surface rounded-xl hover:bg-primary-50 transition-all border border-primary-100">
                <Icon className="w-6 h-6 text-primary-500" aria-hidden="true" />
                <span className="text-sm text-primary-800">{label}</span>
              </Link>
            ))}
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
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Search className="w-8 h-8 text-primary-500" aria-hidden="true" />
            Área do Avaliador
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! Sua fila de avaliações.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-primary-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <User className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <ClipboardList className="w-6 h-6 text-warning-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm text-muted">Na Fila sem Avaliador</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.atendimentosDisponiveisAvaliacao || 0}</p>
              </div>
            </div>
          </Link>

          <Link href="/minhas-comissoes" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-success-500">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-100 rounded-full">
                <Banknote className="w-6 h-6 text-success-600" aria-hidden="true" />
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
                  <Search className="w-8 h-8 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-primary-900">Acessar Fila de Avaliação</h3>
                  <p className="text-primary-700">
                    {(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimentos aguardando
                  </p>
                </div>
              </div>
              <ChevronRight className="w-8 h-8 text-primary-400" aria-hidden="true" />
            </div>
          </div>
        </Link>

        {/* Info de Comissões */}
        <div className="card bg-success-50 border border-success-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-success-900 flex items-center gap-2">
                <Banknote className="w-4 h-4" aria-hidden="true" />
                Suas Comissões de Venda
              </h3>
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
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Stethoscope className="w-8 h-8 text-primary-500" aria-hidden="true" />
            {isDentista ? 'Área do Dentista' : 'Área do Executor'}
          </h1>
          <p className="mt-2 text-neutral-600">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! {isDentista ? 'Suas filas de avaliação e execução.' : 'Sua fila de procedimentos.'}
          </p>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 ${isDentista ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
          {isDentista && (
            <Link href="/avaliacao" className="card hover:shadow-lg transition-all hover:-translate-y-1 border-l-4 border-purple-500">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <Search className="w-6 h-6 text-purple-600" aria-hidden="true" />
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
                <User className="w-6 h-6 text-primary-600" aria-hidden="true" />
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
                <ClipboardList className="w-6 h-6 text-warning-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm text-muted">Disponíveis para Pegar</p>
                <p className="text-2xl font-bold text-warning-600">{stats?.procedimentosDisponiveis || 0}</p>
              </div>
            </div>
          </Link>

          {/* Comissões: feature oculta temporariamente, lógica mantida */}
        </div>

        {/* Ações Rápidas */}
        <div className={`grid grid-cols-1 ${isDentista ? 'md:grid-cols-2' : ''} gap-4`}>
          {isDentista && (
            <Link href="/avaliacao" className="block">
              <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-purple-500 rounded-full">
                      <Search className="w-7 h-7 text-white" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-purple-900">Fila de Avaliação</h3>
                      <p className="text-purple-700">
                        {(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimentos aguardando
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-7 h-7 text-purple-400" aria-hidden="true" />
                </div>
              </div>
            </Link>
          )}

          <Link href="/execucao" className="block">
            <div className="card hover:shadow-lg transition-all hover:-translate-y-1 bg-gradient-to-r from-primary-50 to-warning-50 border-2 border-primary-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-primary-500 rounded-full">
                    <Activity className="w-7 h-7 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-primary-900">Fila de Execução</h3>
                    <p className="text-primary-700">
                      {(stats?.meusProcedimentos || 0) + (stats?.procedimentosDisponiveis || 0)} procedimentos na fila
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-7 h-7 text-primary-400" aria-hidden="true" />
              </div>
            </div>
          </Link>
        </div>

        {/* Meus Procedimentos */}
        <Link href="/meus-procedimentos" className="block">
          <div className="card bg-success-50 border border-success-200 hover:shadow-lg transition-all">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-success-900 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" aria-hidden="true" />
                  Meus Procedimentos
                </h3>
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
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Stethoscope className="w-8 h-8 text-primary-500" aria-hidden="true" />
          Bem-vindo ao Sorria Leste!
        </h1>
        <p className="mt-2 text-neutral-600">
          Sistema de Gestão Odontológica
        </p>
      </div>

      <div className="card bg-warning-50 border border-warning-200">
        <div className="flex items-center gap-2 text-warning-800">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p>Seu perfil não está configurado corretamente. Entre em contato com o administrador.</p>
        </div>
      </div>
    </div>
  );
}
