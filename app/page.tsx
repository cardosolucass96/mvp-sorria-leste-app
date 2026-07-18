'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import {
  Users, ClipboardList, Clock, CheckCircle, Search, Activity,
  AlertTriangle, UserPlus, FileEdit, Banknote, User, CreditCard,
  ChevronRight, Stethoscope, LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { formatarMoeda } from '@/lib/utils/formatters';
import LoadingState from '@/components/ui/LoadingState';
import StatCard from '@/components/ui/StatCard';
import usePageTitle from '@/lib/utils/usePageTitle';

interface DashboardStats {
  totalClientes: number;
  atendimentosHoje: number;
  aguardandoPagamento: number;
  finalizadosHoje: number;
  emExecucao: number;
  emAvaliacao: number;
  minhasComissoes: number;
  meusProcedimentos: number;
  procedimentosDisponiveis: number;
  meusAtendimentosAvaliacao: number;
  atendimentosDisponiveisAvaliacao: number;
}

interface QuickLinkCardProps {
  href: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone?: 'primary' | 'warning' | 'success' | 'evaluation';
}

function QuickLinkCard({
  href,
  label,
  description,
  Icon,
  tone = 'primary',
}: QuickLinkCardProps) {
  const toneClassMap = {
    primary: 'tone-primary',
    warning: 'tone-warning',
    success: 'tone-success',
    evaluation: 'tone-evaluation',
  } satisfies Record<NonNullable<QuickLinkCardProps['tone']>, string>;

  const iconBgMap = {
    primary: 'bg-primary-500',
    warning: 'bg-warning-500',
    success: 'bg-success-600',
    evaluation: 'bg-evaluation-500',
  } satisfies Record<NonNullable<QuickLinkCardProps['tone']>, string>;

  const chevronColorMap = {
    primary: 'text-primary-400',
    warning: 'text-warning-500',
    success: 'text-success-500',
    evaluation: 'text-evaluation-500',
  } satisfies Record<NonNullable<QuickLinkCardProps['tone']>, string>;

  return (
    <Link href={href} className="block">
      <div className={`card ${toneClassMap[tone]} hover:-translate-y-1 hover:shadow-lg transition-all`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`rounded-full p-4 ${iconBgMap[tone]}`}>
              <Icon className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{label}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <ChevronRight className={`w-7 h-7 shrink-0 ${chevronColorMap[tone]}`} aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  usePageTitle('Início');
  const { user, effectiveRole, viewMode } = useAuth();
  const unitFetch = useUnitFetch();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const carregarDados = useCallback(async () => {
    try {
      const roleParaAPI = user?.role === 'admin' && viewMode === 'dentista'
        ? 'admin'
        : (effectiveRole || user?.role);
      const response = await unitFetch(`/api/dashboard?usuario_id=${user?.id}&role=${roleParaAPI}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, effectiveRole, unitFetch, viewMode]);

  useEffect(() => {
    if (user?.id) {
      carregarDados();
    }
  }, [user?.id, viewMode, carregarDados]);

  if (loading) {
    return <LoadingState text="Carregando painel..." />;
  }

  // ===========================
  // TELA DO ADMIN
  // ===========================
  if (effectiveRole === 'admin') {
    const operacaoEmCurso = (stats?.emAvaliacao || 0) + (stats?.emExecucao || 0);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-primary-500" aria-hidden="true" />
            Painel Administrativo
          </h1>
          <p className="mt-2 text-muted-foreground">
            Olá, {user?.nome?.split(' ')[0]}! O que merece atenção na operação de hoje.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Atendimentos Hoje"
            value={stats?.atendimentosHoje || 0}
            icon={<ClipboardList className="w-5 h-5" />}
            color="border-primary-400"
            href="/atendimentos"
            description="Entradas criadas hoje"
          />
          <StatCard
            label="Operação em Curso"
            value={operacaoEmCurso}
            icon={<Activity className="w-5 h-5" />}
            color="border-info-500"
            description="Avaliação + execução agora"
          />
          <StatCard
            label="Aguardando Pagamento"
            value={stats?.aguardandoPagamento || 0}
            icon={<Clock className="w-5 h-5" />}
            color="border-primary-400"
            href="/pagamentos"
            description="Pacientes parados no financeiro"
          />
          <StatCard
            label="Finalizados Hoje"
            value={stats?.finalizadosHoje || 0}
            icon={<CheckCircle className="w-5 h-5" />}
            color="border-primary-400"
            description="Saídas concluídas no dia"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            label="Fila de Avaliação"
            value={stats?.emAvaliacao || 0}
            icon={<Search className="w-5 h-5" />}
            color="border-primary-400"
            href="/avaliacao"
            description="Atendimentos em avaliação"
          />
          <StatCard
            label="Em Execução"
            value={stats?.emExecucao || 0}
            icon={<Activity className="w-5 h-5" />}
            color="border-primary-400"
            href="/execucao"
            description="Atendimentos em procedimento"
          />
          <StatCard
            label="Base de Clientes"
            value={stats?.totalClientes || 0}
            icon={<Users className="w-5 h-5" />}
            color="border-primary-400"
            href="/clientes"
            description="Cadastros ativos no sistema"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
          <div className="space-y-4">
            <QuickLinkCard
              href="/pagamentos"
              Icon={CreditCard}
              label="Destravar o Financeiro"
              description={`${stats?.aguardandoPagamento || 0} atendimento(s) aguardando pagamento agora`}
              tone="warning"
            />
            <QuickLinkCard
              href="/avaliacao"
              Icon={Search}
              label="Ver Fila de Avaliação"
              description={`${stats?.emAvaliacao || 0} atendimento(s) em avaliação na unidade`}
              tone="evaluation"
            />
            <QuickLinkCard
              href="/execucao"
              Icon={Activity}
              label="Acompanhar Execução"
              description={`${stats?.emExecucao || 0} atendimento(s) em execução neste momento`}
              tone="primary"
            />
          </div>

          <div className="card tone-primary">
            <h2 className="mb-4 text-base font-semibold text-foreground">Ações Rápidas</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { href: '/clientes/novo', Icon: UserPlus, label: 'Novo Cliente' },
                { href: '/atendimentos/novo', Icon: FileEdit, label: 'Novo Atendimento' },
                { href: '/comissoes', Icon: Banknote, label: 'Comissões' },
                { href: '/usuarios', Icon: User, label: 'Usuários' },
              ].map(({ href, Icon, label }) => (
                <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/75 p-4 transition-all hover:bg-primary/10 hover:shadow-md">
                  <Icon className="w-7 h-7 text-primary-500" aria-hidden="true" />
                  <span className="text-center text-sm font-medium text-foreground">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="card tone-success">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-foreground">Resumo do Dia</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {stats?.finalizadosHoje || 0} finalizado(s), {stats?.aguardandoPagamento || 0} aguardando pagamento e {operacaoEmCurso} em curso.
              </p>
            </div>
            <Link href="/dashboard/admin" className="btn bg-success-600 text-success-50 hover:bg-success-700">
              Dashboard Admin
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
            Olá, {user?.nome?.split(' ')[0]}!
          </h1>
          <p className="mt-2 text-muted-foreground">
            Área de Recepção — prioridades do dia e próximos atendimentos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Atendimentos Hoje"
            value={stats?.atendimentosHoje || 0}
            icon={<ClipboardList className="w-5 h-5" />}
            color="border-primary-400"
            href="/atendimentos"
            description="Fluxo aberto hoje"
          />
          <StatCard
            label="Aguardando Pagamento"
            value={stats?.aguardandoPagamento || 0}
            icon={<CreditCard className="w-5 h-5" />}
            color="border-primary-400"
            href="/pagamentos"
            description="Clientes prontos para cobrança"
          />
          <StatCard
            label="Finalizados Hoje"
            value={stats?.finalizadosHoje || 0}
            icon={<CheckCircle className="w-5 h-5" />}
            color="border-success-500"
            description="Atendimentos encerrados no dia"
          />
          <StatCard
            label="Base de Clientes"
            value={stats?.totalClientes || 0}
            icon={<Users className="w-5 h-5" />}
            color="border-primary-400"
            href="/clientes"
            description="Cadastros totais"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickLinkCard
            href="/clientes/novo"
            Icon={UserPlus}
            label="Cadastrar Novo Cliente"
            description="Registrar rapidamente um novo paciente"
            tone="primary"
          />
          <QuickLinkCard
            href="/atendimentos/novo"
            Icon={FileEdit}
            label="Novo Atendimento"
            description="Abrir um atendimento para quem chegou hoje"
            tone="warning"
          />
        </div>

        <div className="card tone-primary">
          <h2 className="mb-2 text-base font-semibold text-foreground">Rotina da Recepção</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Use os atalhos abaixo para puxar fila, localizar clientes e fechar pendências do dia.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { href: '/clientes', Icon: Search, label: 'Buscar Cliente' },
              { href: '/atendimentos', Icon: ClipboardList, label: 'Ver Atendimentos' },
              { href: '/pagamentos', Icon: CreditCard, label: 'Pagamentos' },
              { href: '/minhas-comissoes', Icon: Banknote, label: 'Minhas Comissões' },
            ].map(({ href, Icon, label }) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/75 p-4 transition-all hover:bg-primary/10">
                <Icon className="w-6 h-6 text-primary-500" aria-hidden="true" />
                <span className="text-sm text-foreground">{label}</span>
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
    const totalFilaAvaliacao = (stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Search className="w-8 h-8 text-primary-500" aria-hidden="true" />
            Área do Avaliador
          </h1>
          <p className="mt-2 text-muted-foreground">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! O que precisa da sua avaliação agora.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="Na Minha Fila"
            value={stats?.meusAtendimentosAvaliacao || 0}
            icon={<User className="w-5 h-5" />}
            color="border-evaluation-500"
            href="/avaliacao"
            description="Já atribuídos para você"
          />
          <StatCard
            label="Comissões (Este Mês)"
            value={formatarMoeda(stats?.minhasComissoes || 0)}
            icon={<Banknote className="w-5 h-5" />}
            color="border-evaluation-500"
            href="/minhas-comissoes"
            description="Venda acumulada no mês"
          />
          <StatCard
            label="Vendas do Mês"
            value={formatarMoeda(stats?.minhasComissoes || 0)}
            icon={<ClipboardList className="w-5 h-5" />}
            color="border-primary-400"
            href="/minhas-comissoes"
            description="Base total usada na sua comissão"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <QuickLinkCard
            href="/avaliacao"
            Icon={Search}
            label="Acessar Fila de Avaliação"
            description={`${totalFilaAvaliacao} atendimento(s) aguardando passagem pela avaliação`}
            tone="evaluation"
          />
          <QuickLinkCard
            href="/minhas-comissoes"
            Icon={Banknote}
            label="Acompanhar Minhas Comissões"
            description="Veja vendas do período e base usada no cálculo"
            tone="success"
          />
        </div>

        <div className="card tone-primary">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <ClipboardList className="w-4 h-4" aria-hidden="true" />
                Leitura Rápida da Fila
              </h3>
              <p className="text-sm text-muted-foreground">
                {stats?.meusAtendimentosAvaliacao || 0} com você e {stats?.atendimentosDisponiveisAvaliacao || 0} sem avaliador.
              </p>
            </div>
            <Link href="/meus-procedimentos" className="btn bg-primary-600 text-primary-50 hover:bg-primary-700">
              Meu Histórico
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
          <p className="mt-2 text-muted-foreground">
            Olá, Dr(a). {user?.nome?.split(' ')[0]}! Foque no que já está com você e no que ainda pode assumir.
          </p>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 ${isDentista ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>
          {isDentista && (
            <StatCard
              label="Fila Avaliação"
              value={(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)}
              icon={<Search className="w-5 h-5" />}
              color="border-evaluation-500"
              href="/avaliacao"
              description="Avaliações disponíveis + atribuídas"
            />
          )}
          <StatCard
            label="Meus Procedimentos"
            value={stats?.meusProcedimentos || 0}
            icon={<User className="w-5 h-5" />}
            color="border-dentist-500"
            href="/execucao"
            description="Em andamento com você"
          />
          <StatCard
            label="Disponíveis para Pegar"
            value={stats?.procedimentosDisponiveis || 0}
            icon={<ClipboardList className="w-5 h-5" />}
            color="border-dentist-500"
            href="/execucao"
            description="Sem executor definido"
          />
          {/* Comissões: feature oculta temporariamente, lógica mantida */}
        </div>

        <div className={`grid grid-cols-1 ${isDentista ? 'md:grid-cols-2' : ''} gap-4`}>
          {isDentista && (
            <QuickLinkCard
              href="/avaliacao"
              Icon={Search}
              label="Fila de Avaliação"
              description={`${(stats?.meusAtendimentosAvaliacao || 0) + (stats?.atendimentosDisponiveisAvaliacao || 0)} atendimento(s) aguardando avaliação`}
              tone="evaluation"
            />
          )}

          <QuickLinkCard
            href="/execucao"
            Icon={Activity}
            label="Fila de Execução"
            description={`${(stats?.meusProcedimentos || 0) + (stats?.procedimentosDisponiveis || 0)} procedimento(s) na fila agora`}
            tone="primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/meus-procedimentos" className="block">
            <div className="card tone-success hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <ClipboardList className="w-4 h-4" aria-hidden="true" />
                    Meus Procedimentos
                  </h3>
                  <p className="text-sm text-muted-foreground">Histórico completo de avaliações e execuções</p>
                </div>
                <span className="btn bg-success-600 text-success-50 hover:bg-success-700">
                  Ver Histórico
                </span>
              </div>
            </div>
          </Link>

          <Link href="/agenda" className="block">
            <div className="card tone-primary hover:shadow-lg transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    Minha Agenda
                  </h3>
                  <p className="text-sm text-muted-foreground">Veja seus retornos e sessões já marcadas</p>
                </div>
                <span className="btn bg-primary-600 text-primary-50 hover:bg-primary-700">
                  Abrir Agenda
                </span>
              </div>
            </div>
          </Link>
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
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Stethoscope className="w-8 h-8 text-primary-500" aria-hidden="true" />
          Bem-vindo ao Sorria Leste!
        </h1>
        <p className="mt-2 text-muted-foreground">
          Sistema de Gestão Odontológica
        </p>
      </div>

      <div className="card tone-warning">
        <div className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <p>Seu perfil não está configurado corretamente. Entre em contato com o administrador.</p>
        </div>
      </div>
    </div>
  );
}
