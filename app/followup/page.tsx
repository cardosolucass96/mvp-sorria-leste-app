'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  type BadgeProps,
  Button,
  ConfirmDialog,
  Divider,
  EmptyState,
  FilterBar,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { FollowupCalendario } from '@/components/domain';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  FOLLOWUP_STATUS_LABELS,
  FOLLOWUP_TIPO_CONFIG,
  FOLLOWUP_TIPO_OPTIONS,
  FOLLOWUP_URGENCIA_CONFIG,
} from '@/lib/constants/followup';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import type { FollowupTarefaCompleta } from '@/lib/types';
import { formatarData, formatarDataHora, formatarTelefone, toDateTimeLocal } from '@/lib/utils/formatters';
import {
  formatLocalDateKey,
  getFollowupDateKey,
  getFollowupBucket,
  getFollowupUrgencia,
  parseFollowupDateTime,
} from '@/lib/utils/followup';
import { addDaysToClinicDateKey, getClinicDateKey } from '@/lib/time';
import { cn } from '@/lib/utils';
import usePageTitle from '@/lib/utils/usePageTitle';

type FollowupMetricKey = 'abertas' | 'criadas' | 'atrasadas' | 'vencem' | 'concluidas';

interface FollowupResponsavelSummary {
  responsavel_usuario_id: number;
  responsavel_usuario_nome: string;
  abertas: number;
  criadas: number;
  atrasadas: number;
  vencem: number;
  concluidas: number;
  abertas_hoje: number;
  criadas_hoje: number;
  vencem_hoje: number;
  concluidas_hoje: number;
}

interface FollowupSummary {
  abertas: number;
  criadas: number;
  atrasadas: number;
  vencem: number;
  concluidas: number;
  abertas_hoje: number;
  criadas_hoje: number;
  vencem_hoje: number;
  concluidas_hoje: number;
  por_responsavel: FollowupResponsavelSummary[];
}

type FollowupResponsavelSummaryPayload = Partial<FollowupResponsavelSummary>;

type FollowupSummaryPayload = Partial<Omit<FollowupSummary, 'por_responsavel'>> & {
  por_responsavel?: FollowupResponsavelSummaryPayload[];
};

interface ClienteBusca {
  id: number;
  nome: string;
  telefone: string | null;
  cpf: string | null;
}

interface ResponsavelOption {
  id: number;
  nome: string;
}

interface UsuarioResponsavel {
  id: number;
  nome: string;
  ativo?: number | boolean;
  role?: string;
  roles?: string[];
}

interface FollowupFormState {
  cliente: ClienteBusca | null;
  clienteBusca: string;
  responsavelUsuarioId: string;
  tipo: string;
  titulo: string;
  descricao: string;
  vencimentoEm: string;
}

type FollowupPeriodoFiltro = 'hoje' | 'semana' | 'mes' | 'trimestre' | 'ano' | 'todos' | 'custom';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'aberta', label: FOLLOWUP_STATUS_LABELS.aberta },
  { value: 'concluida', label: FOLLOWUP_STATUS_LABELS.concluida },
];

const BUCKET_LABELS: Record<'atrasadas' | 'hoje' | 'proximos_7_dias' | 'depois', string> = {
  atrasadas: 'Atrasadas',
  hoje: 'Hoje',
  proximos_7_dias: 'Próximos 7 dias',
  depois: 'Depois',
};

const PERIODO_FOLLOWUP_OPTIONS: Array<{
  value: Exclude<FollowupPeriodoFiltro, 'custom'>;
  label: string;
}> = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: '7 dias' },
  { value: 'mes', label: '30 dias' },
  { value: 'trimestre', label: '3 meses' },
  { value: 'ano', label: '1 ano' },
  { value: 'todos', label: 'Todos' },
];

const initialFormState: FollowupFormState = {
  cliente: null,
  clienteBusca: '',
  responsavelUsuarioId: '',
  tipo: '',
  titulo: '',
  descricao: '',
  vencimentoEm: '',
};

const EMPTY_FOLLOWUP_SUMMARY: FollowupSummary = {
  abertas: 0,
  criadas: 0,
  abertas_hoje: 0,
  criadas_hoje: 0,
  atrasadas: 0,
  vencem: 0,
  vencem_hoje: 0,
  concluidas: 0,
  concluidas_hoje: 0,
  por_responsavel: [],
};

function toSummaryNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeResponsavelSummary(
  responsavel: FollowupResponsavelSummaryPayload
): FollowupResponsavelSummary | null {
  const responsavelId = toSummaryNumber(responsavel.responsavel_usuario_id);
  if (!responsavelId) return null;

  const abertas = toSummaryNumber(responsavel.abertas ?? responsavel.abertas_hoje);
  const criadas = toSummaryNumber(responsavel.criadas ?? responsavel.criadas_hoje);
  const vencem = toSummaryNumber(responsavel.vencem ?? responsavel.vencem_hoje);
  const concluidas = toSummaryNumber(responsavel.concluidas ?? responsavel.concluidas_hoje);

  return {
    responsavel_usuario_id: responsavelId,
    responsavel_usuario_nome: responsavel.responsavel_usuario_nome || 'Responsável',
    abertas,
    criadas,
    atrasadas: toSummaryNumber(responsavel.atrasadas),
    vencem,
    concluidas,
    abertas_hoje: toSummaryNumber(responsavel.abertas_hoje ?? abertas),
    criadas_hoje: toSummaryNumber(responsavel.criadas_hoje ?? criadas),
    vencem_hoje: toSummaryNumber(responsavel.vencem_hoje ?? vencem),
    concluidas_hoje: toSummaryNumber(responsavel.concluidas_hoje ?? concluidas),
  };
}

function normalizeFollowupSummary(summary: FollowupSummaryPayload | null | undefined): FollowupSummary {
  const abertas = toSummaryNumber(summary?.abertas ?? summary?.abertas_hoje);
  const criadas = toSummaryNumber(summary?.criadas ?? summary?.criadas_hoje);
  const vencem = toSummaryNumber(summary?.vencem ?? summary?.vencem_hoje);
  const concluidas = toSummaryNumber(summary?.concluidas ?? summary?.concluidas_hoje);

  return {
    abertas,
    criadas,
    atrasadas: toSummaryNumber(summary?.atrasadas),
    vencem,
    concluidas,
    abertas_hoje: toSummaryNumber(summary?.abertas_hoje ?? abertas),
    criadas_hoje: toSummaryNumber(summary?.criadas_hoje ?? criadas),
    vencem_hoje: toSummaryNumber(summary?.vencem_hoje ?? vencem),
    concluidas_hoje: toSummaryNumber(summary?.concluidas_hoje ?? concluidas),
    por_responsavel: Array.isArray(summary?.por_responsavel)
      ? summary.por_responsavel
        .map(normalizeResponsavelSummary)
        .filter((responsavel): responsavel is FollowupResponsavelSummary => responsavel !== null)
      : [],
  };
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
  adjustments: { months?: number; years?: number }
): string {
  const date = parseDateKeyAsUtcNoon(dateKey);

  if (adjustments.years) {
    date.setUTCFullYear(date.getUTCFullYear() + adjustments.years);
  }
  if (adjustments.months) {
    date.setUTCMonth(date.getUTCMonth() + adjustments.months);
  }

  return formatUtcDateKey(date);
}

function sortByDueDate(a: FollowupTarefaCompleta, b: FollowupTarefaCompleta) {
  return a.vencimento_em.localeCompare(b.vencimento_em);
}

interface FollowupResponsavelBreakdown {
  id: number;
  nome: string;
  total: number;
}

interface FollowupSummaryCardProps {
  metric: FollowupMetricKey;
  icon: ReactNode;
  label: string;
  value: number;
  color: string;
  iconColor?: string;
  badgeColor?: BadgeProps['color'];
  breakdown: FollowupResponsavelBreakdown[];
  showBreakdown: boolean;
}

function getResponsavelBreakdown(
  summary: FollowupSummary,
  metric: FollowupMetricKey
): FollowupResponsavelBreakdown[] {
  return summary.por_responsavel
    .map((responsavel) => ({
      id: responsavel.responsavel_usuario_id,
      nome: responsavel.responsavel_usuario_nome,
      total: responsavel[metric],
    }))
    .filter((responsavel) => responsavel.total > 0)
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.nome.localeCompare(b.nome);
    });
}

function FollowupSummaryCard({
  metric,
  icon,
  label,
  value,
  color,
  iconColor = 'text-muted-foreground',
  badgeColor = 'blue',
  breakdown,
  showBreakdown,
}: FollowupSummaryCardProps) {
  return (
    <div
      data-testid={`followup-summary-${metric}`}
      className={cn(
        'min-h-[116px] rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm',
        color
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0', iconColor)} aria-hidden="true">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>

      {showBreakdown && (
        <div className="mt-3 flex flex-col gap-2">
          <Divider className="my-0 bg-border/70" />
          <div className="flex flex-col gap-1.5">
            {breakdown.length > 0 ? (
              breakdown.map((responsavel) => (
                <div
                  key={`${metric}-${responsavel.id}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {responsavel.nome}
                  </span>
                  <Badge color={badgeColor} size="sm" className="shrink-0">
                    {responsavel.total}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-xs font-medium text-muted-foreground">Nenhum</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FollowupPage() {
  usePageTitle('Followup');
  const router = useRouter();
  const searchParams = useSearchParams();
  const openFollowup = searchParams.get('open');
  const openFollowupClienteId = searchParams.get('cliente_id');
  const openFollowupTipo = searchParams.get('tipo');
  const searchParamsString = searchParams.toString();
  const { toast } = useToast();
  const { user, isLoading, hasRole, currentUnidade } = useAuth();
  const unitFetch = useUnitFetch();
  const currentUserRoles = useMemo(
    () => (
      user
        ? (user.roles && user.roles.length > 0 ? user.roles : [user.role]).map((role) => role.toLowerCase())
        : []
    ),
    [user]
  );
  const canAccess = hasRole(['admin', 'atendente']);
  const canCreate = canAccess;
  const canMutate = currentUserRoles.includes('atendente') || currentUserRoles.includes('admin');
  const currentUserId = Number(user?.id);
  const isPrimaryAdmin = user?.role?.toLowerCase() === 'admin';
  const fallbackResponsaveis = useMemo<ResponsavelOption[]>(() => {
    const currentUserId = Number(user?.id);
    const canFallbackCurrentUser = !Number.isNaN(currentUserId)
      && user?.nome
      && (currentUserRoles.includes('atendente') || currentUserRoles.includes('admin'));
    return canFallbackCurrentUser ? [{ id: currentUserId, nome: user.nome }] : [];
  }, [currentUserRoles, user]);

  const [tarefas, setTarefas] = useState<FollowupTarefaCompleta[]>([]);
  const [summary, setSummary] = useState<FollowupSummary>(EMPTY_FOLLOWUP_SUMMARY);
  const [responsaveis, setResponsaveis] = useState<ResponsavelOption[]>([]);
  const [clienteResultados, setClienteResultados] = useState<ClienteBusca[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResponsaveis, setLoadingResponsaveis] = useState(false);
  const [error, setError] = useState('');

  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [responsavelFiltro, setResponsavelFiltro] = useState('');
  const [vencimentoDe, setVencimentoDe] = useState('');
  const [vencimentoAte, setVencimentoAte] = useState(() => getClinicDateKey());
  const [periodoVencimento, setPeriodoVencimento] = useState<FollowupPeriodoFiltro>('hoje');
  const [responsavelFiltroInicializado, setResponsavelFiltroInicializado] = useState(false);

  const [viewMode, setViewMode] = useState<'lista' | 'calendario'>('lista');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<FollowupTarefaCompleta | null>(null);
  const [taskForm, setTaskForm] = useState<FollowupFormState>(initialFormState);
  const [taskFormError, setTaskFormError] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);

  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [taskToConclude, setTaskToConclude] = useState<FollowupTarefaCompleta | null>(null);
  const [notaConclusao, setNotaConclusao] = useState('');
  const [concluirError, setConcluirError] = useState('');
  const [concluding, setConcluding] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    task: FollowupTarefaCompleta | null;
  }>({ isOpen: false, task: null });
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const handledOpenFollowupRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && user && !canAccess) {
      router.replace('/agenda');
    }
  }, [canAccess, isLoading, router, user]);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('followup-view-mode') : null;
    if (saved === 'lista' || saved === 'calendario') {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('followup-view-mode', viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!currentUnidade || !canAccess) return;
    let cancelled = false;

    async function carregarResponsaveis() {
      setLoadingResponsaveis(true);

      const aplicarResponsaveis = (options: ResponsavelOption[]) => {
        const mergedOptions = options.some((responsavel) => responsavel.id === fallbackResponsaveis[0]?.id)
          ? options
          : [...options, ...fallbackResponsaveis];

        if (!cancelled) {
          setResponsaveis(mergedOptions);
        }
      };

      try {
        const params = new URLSearchParams({
          unidade_id: String(currentUnidade),
          roles: 'admin,atendente',
        });
        const res = await fetch(`/api/usuarios?${params.toString()}`);
        if (!res.ok) {
          aplicarResponsaveis(fallbackResponsaveis);
          return;
        }
        const data: UsuarioResponsavel[] = await res.json();
        const options = data
          .filter((usuario) => {
            if (Number(usuario.ativo) === 0) return false;
            const roles = (usuario.roles && usuario.roles.length > 0
              ? usuario.roles
              : [usuario.role || '']
            ).map((role) => role.toLowerCase());
            return roles.includes('atendente') || roles.includes('admin');
          })
          .map((item) => ({ id: item.id, nome: item.nome }));
        aplicarResponsaveis(options);
      } catch {
        aplicarResponsaveis(fallbackResponsaveis);
      } finally {
        if (!cancelled) {
          setLoadingResponsaveis(false);
        }
      }
    }

    carregarResponsaveis();
    return () => {
      cancelled = true;
    };
  }, [canAccess, currentUnidade, fallbackResponsaveis]);

  useEffect(() => {
    if (!taskModalOpen || editingTask || taskForm.responsavelUsuarioId || responsaveis.length !== 1) return;
    setTaskForm((prev) => ({ ...prev, responsavelUsuarioId: String(responsaveis[0].id) }));
  }, [editingTask, responsaveis, taskForm.responsavelUsuarioId, taskModalOpen]);

  useEffect(() => {
    if (responsavelFiltroInicializado) return;
    if (isLoading || !user || !canAccess) return;

    if (!isPrimaryAdmin && !Number.isNaN(currentUserId)) {
      setResponsavelFiltro(String(currentUserId));
    }

    setResponsavelFiltroInicializado(true);
  }, [canAccess, currentUserId, isLoading, isPrimaryAdmin, responsavelFiltroInicializado, user]);

  useEffect(() => {
    if (!taskModalOpen) return;
    const query = taskForm.clienteBusca.trim();
    if (query.length < 2) {
      setClienteResultados([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?busca=${encodeURIComponent(query)}&limit=8`);
        const data = await res.json();
        if (!cancelled) {
          setClienteResultados(data.clientes ?? []);
        }
      } catch {
        if (!cancelled) {
          setClienteResultados([]);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [taskForm.clienteBusca, taskModalOpen]);

  useEffect(() => {
    if (viewMode === 'calendario' && !selectedDay) {
      setSelectedDay(new Date());
    }
  }, [selectedDay, viewMode]);

  const carregarTarefas = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFiltro) params.append('status', statusFiltro);
      if (tipoFiltro) params.append('tipo', tipoFiltro);
      if (responsavelFiltro) params.append('responsavel_usuario_id', responsavelFiltro);
      if (busca) params.append('busca', busca);
      if (vencimentoDe) params.append('vencimento_de', vencimentoDe);
      if (vencimentoAte) params.append('vencimento_ate', vencimentoAte);
      if (viewMode === 'calendario') {
        params.append('mes', formatMonthKey(calendarMonth));
      }

      const res = await unitFetch(`/api/followup?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao carregar followups');
        return;
      }
      setTarefas(data.items ?? []);
      setSummary(normalizeFollowupSummary(data.summary));
    } catch {
      setError('Erro ao carregar followups');
    } finally {
      setLoading(false);
    }
  }, [
    busca,
    calendarMonth,
    canAccess,
    responsavelFiltro,
    statusFiltro,
    tipoFiltro,
    unitFetch,
    vencimentoAte,
    vencimentoDe,
    viewMode,
  ]);

  useEffect(() => {
    if (!isLoading && user && canAccess && responsavelFiltroInicializado) {
      carregarTarefas();
    }
  }, [canAccess, carregarTarefas, isLoading, responsavelFiltroInicializado, user]);

  const tarefasVisiveis = useMemo(() => {
    if (viewMode === 'calendario' && selectedDay) {
      const key = formatLocalDateKey(selectedDay);
      return tarefas.filter((tarefa) => getFollowupDateKey(tarefa.vencimento_em) === key);
    }
    return tarefas;
  }, [selectedDay, tarefas, viewMode]);

  const tarefasAbertas = useMemo(
    () => tarefasVisiveis.filter((tarefa) => tarefa.status === 'aberta'),
    [tarefasVisiveis]
  );
  const tarefasConcluidas = useMemo(
    () => tarefasVisiveis
      .filter((tarefa) => tarefa.status === 'concluida')
      .sort((a, b) => (b.concluida_em || '').localeCompare(a.concluida_em || '')),
    [tarefasVisiveis]
  );

  const gruposAbertos = useMemo(() => {
    const grupos = {
      atrasadas: [] as FollowupTarefaCompleta[],
      hoje: [] as FollowupTarefaCompleta[],
      proximos_7_dias: [] as FollowupTarefaCompleta[],
      depois: [] as FollowupTarefaCompleta[],
    };

    for (const tarefa of tarefasAbertas) {
      const bucket = getFollowupBucket(tarefa);
      if (bucket !== 'concluidas') {
        grupos[bucket].push(tarefa);
      }
    }

    grupos.atrasadas.sort(sortByDueDate);
    grupos.hoje.sort(sortByDueDate);
    grupos.proximos_7_dias.sort(sortByDueDate);
    grupos.depois.sort(sortByDueDate);
    return grupos;
  }, [tarefasAbertas]);

  const totalVisivel = tarefasVisiveis.length;
  const diaSelecionadoLabel = selectedDay ? formatarData(formatLocalDateKey(selectedDay)) : '';
  const showResponsavelBreakdown = currentUserRoles.includes('admin');
  const summaryCards: Array<Omit<FollowupSummaryCardProps, 'breakdown' | 'showBreakdown'>> = [
    {
      metric: 'abertas',
      icon: <ClipboardList className="size-5" />,
      label: 'Abertas',
      value: summary.abertas,
      color: 'border-primary/40',
      badgeColor: 'orange',
    },
    {
      metric: 'criadas',
      icon: <Plus className="size-5" />,
      label: 'Criadas',
      value: summary.criadas,
      color: 'border-info-500/40',
      iconColor: 'text-info-600',
      badgeColor: 'blue',
    },
    {
      metric: 'atrasadas',
      icon: <Clock3 className="size-5" />,
      label: 'Atrasadas',
      value: summary.atrasadas,
      color: 'border-error-500/40',
      iconColor: 'text-error-600',
      badgeColor: 'red',
    },
    {
      metric: 'vencem',
      icon: <CalendarDays className="size-5" />,
      label: 'Vencem',
      value: summary.vencem,
      color: 'border-warning-500/40',
      iconColor: 'text-warning-600',
      badgeColor: 'yellow',
    },
    {
      metric: 'concluidas',
      icon: <CheckCircle2 className="size-5" />,
      label: 'Concluídas',
      value: summary.concluidas,
      color: 'border-success-500/40',
      iconColor: 'text-success-600',
      badgeColor: 'green',
    },
  ];

  function canConcludeTask(task: FollowupTarefaCompleta) {
    if (task.status !== 'aberta') return false;
    return canMutate;
  }

  function limparFiltros() {
    setBusca('');
    setStatusFiltro('');
    setTipoFiltro('');
    setResponsavelFiltro('');
    setVencimentoDe('');
    setVencimentoAte('');
    setPeriodoVencimento('todos');
  }

  function aplicarPeriodoVencimento(periodo: Exclude<FollowupPeriodoFiltro, 'custom'>) {
    const hoje = getClinicDateKey();
    let vencimentoAteValue = '';

    switch (periodo) {
      case 'hoje':
        vencimentoAteValue = hoje;
        break;
      case 'semana':
        vencimentoAteValue = addDaysToClinicDateKey(hoje, 7);
        break;
      case 'mes':
        vencimentoAteValue = addDaysToClinicDateKey(hoje, 30);
        break;
      case 'trimestre':
        vencimentoAteValue = shiftDateKey(hoje, { months: 3 });
        break;
      case 'ano':
        vencimentoAteValue = shiftDateKey(hoje, { years: 1 });
        break;
      case 'todos':
        vencimentoAteValue = '';
        break;
    }

    setPeriodoVencimento(periodo);
    setVencimentoDe('');
    setVencimentoAte(vencimentoAteValue);
  }

  const abrirNovaTarefa = useCallback(async (clienteId?: number, tipo?: string | null) => {
    const responsavelInicialId = responsaveis[0]?.id ?? fallbackResponsaveis[0]?.id ?? null;
    setEditingTask(null);
    setTaskForm({
      ...initialFormState,
      responsavelUsuarioId: responsavelInicialId ? String(responsavelInicialId) : '',
      tipo: tipo === 'orcamento' ? 'orcamento' : '',
    });
    setTaskFormError('');
    setClienteResultados([]);
    setTaskModalOpen(true);

    if (!clienteId) return;

    try {
      const res = await fetch(`/api/clientes/${clienteId}`);
      if (!res.ok) {
        setTaskFormError('Cliente não encontrado para pré-seleção.');
        return;
      }

      const cliente = await res.json();
      setTaskForm((prev) => ({
        ...prev,
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          telefone: cliente.telefone || null,
          cpf: cliente.cpf || null,
        },
        clienteBusca: cliente.nome,
      }));
    } catch {
      setTaskFormError('Não foi possível carregar o cliente para pré-seleção.');
    }
  }, [fallbackResponsaveis, responsaveis]);

  useEffect(() => {
    if (!canCreate) return;
    if (openFollowup !== '1') {
      handledOpenFollowupRef.current = null;
      return;
    }

    const openFollowupKey = [
      openFollowup,
      openFollowupClienteId ?? '',
      openFollowupTipo ?? '',
    ].join('|');

    if (handledOpenFollowupRef.current === openFollowupKey) {
      return;
    }

    handledOpenFollowupRef.current = openFollowupKey;

    const clienteId = Number(openFollowupClienteId);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      void abrirNovaTarefa(undefined, openFollowupTipo);
    } else {
      void abrirNovaTarefa(clienteId, openFollowupTipo);
    }

    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete('open');
    nextParams.delete('cliente_id');
    nextParams.delete('tipo');
    const nextSearch = nextParams.toString();
    router.replace(`/followup${nextSearch ? `?${nextSearch}` : ''}`);
  }, [abrirNovaTarefa, canCreate, openFollowup, openFollowupClienteId, openFollowupTipo, router, searchParamsString]);

  function abrirEdicao(task: FollowupTarefaCompleta) {
    setEditingTask(task);
    setTaskForm({
      cliente: {
        id: task.cliente_id,
        nome: task.cliente_nome,
        telefone: task.cliente_telefone,
        cpf: null,
      },
      clienteBusca: task.cliente_nome,
      responsavelUsuarioId: String(task.responsavel_usuario_id),
      tipo: task.tipo,
      titulo: task.titulo,
      descricao: task.descricao || '',
      vencimentoEm: toDateTimeLocal(task.vencimento_em),
    });
    setTaskFormError('');
    setClienteResultados([]);
    setTaskModalOpen(true);
  }

  function fecharTaskModal() {
    setTaskModalOpen(false);
    setEditingTask(null);
    setTaskForm(initialFormState);
    setTaskFormError('');
    setClienteResultados([]);
  }

  function selecionarCliente(cliente: ClienteBusca) {
    setTaskForm((prev) => ({
      ...prev,
      cliente,
      clienteBusca: cliente.nome,
    }));
    setClienteResultados([]);
  }

  async function salvarTarefa() {
    if (!taskForm.cliente) {
      setTaskFormError('Selecione um cliente');
      return;
    }
    if (!taskForm.responsavelUsuarioId) {
      setTaskFormError('Selecione um responsável');
      return;
    }
    if (!taskForm.tipo) {
      setTaskFormError('Selecione um tipo');
      return;
    }
    if (!taskForm.titulo.trim()) {
      setTaskFormError('Informe um título');
      return;
    }
    if (!taskForm.vencimentoEm) {
      setTaskFormError('Informe o vencimento');
      return;
    }

    setTaskSaving(true);
    setTaskFormError('');
    try {
      const payload = {
        cliente_id: taskForm.cliente.id,
        responsavel_usuario_id: parseInt(taskForm.responsavelUsuarioId),
        tipo: taskForm.tipo,
        titulo: taskForm.titulo.trim(),
        descricao: taskForm.descricao.trim() || null,
        vencimento_em: taskForm.vencimentoEm,
      };

      const url = editingTask ? `/api/followup/${editingTask.id}` : '/api/followup';
      const method = editingTask ? 'PUT' : 'POST';

      const res = await unitFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setTaskFormError(data.error || 'Erro ao salvar tarefa');
        return;
      }

      toast.success(editingTask ? 'Tarefa atualizada com sucesso' : 'Tarefa criada com sucesso');
      fecharTaskModal();
      carregarTarefas();
    } catch {
      setTaskFormError('Erro ao salvar tarefa');
    } finally {
      setTaskSaving(false);
    }
  }

  function abrirConcluir(task: FollowupTarefaCompleta) {
    setTaskToConclude(task);
    setNotaConclusao('');
    setConcluirError('');
    setConcluirModalOpen(true);
  }

  async function concluirTarefa() {
    if (!taskToConclude) return;
    if (!notaConclusao.trim()) {
      setConcluirError('Descreva o que foi feito');
      return;
    }

    setConcluding(true);
    setConcluirError('');
    try {
      const res = await unitFetch(`/api/followup/${taskToConclude.id}/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota_conclusao: notaConclusao.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConcluirError(data.error || 'Erro ao concluir tarefa');
        return;
      }

      toast.success('Tarefa concluída com sucesso');
      setConcluirModalOpen(false);
      setTaskToConclude(null);
      setNotaConclusao('');
      carregarTarefas();
    } catch {
      setConcluirError('Erro ao concluir tarefa');
    } finally {
      setConcluding(false);
    }
  }

  async function excluirTarefa() {
    if (!deleteDialog.task) return;
    const task = deleteDialog.task;

    setDeletingTaskId(task.id);
    try {
      const res = await unitFetch(`/api/followup/${task.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao excluir tarefa');
        return;
      }

      toast.success('Tarefa excluída com sucesso');
      setDeleteDialog({ isOpen: false, task: null });
      carregarTarefas();
    } catch {
      toast.error('Erro ao excluir tarefa');
    } finally {
      setDeletingTaskId(null);
    }
  }

  if (isLoading || (loading && tarefas.length === 0 && !error)) {
    return <LoadingState text="Carregando followup..." />;
  }

  if (!user || !canAccess) {
    return <LoadingState text="Redirecionando..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <PageHeader
        title="Followup"
        description="Acompanhamento manual de clientes e tarefas da recepção."
        icon={<MessageCircle className="w-7 h-7" />}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('lista')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'lista'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4" />
                  Lista
                </span>
              </button>
              <button
                onClick={() => setViewMode('calendario')}
                className={`px-3 py-2 text-sm font-medium transition-colors border-l border-border ${
                  viewMode === 'calendario'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4" />
                  Calendário
                </span>
              </button>
            </div>
            {canCreate && (
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => { void abrirNovaTarefa(); }}>
                Nova tarefa
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {PERIODO_FOLLOWUP_OPTIONS.map((periodo) => (
          <Button
            key={periodo.value}
            size="sm"
            variant={periodoVencimento === periodo.value ? 'primary' : 'secondary'}
            aria-pressed={periodoVencimento === periodo.value}
            onClick={() => aplicarPeriodoVencimento(periodo.value)}
          >
            {periodo.label}
          </Button>
        ))}
      </div>

      <FilterBar
        fields={[
          { type: 'text', name: 'busca', label: 'Busca', placeholder: 'Cliente, título ou descrição' },
          { type: 'select', name: 'status', label: 'Status', placeholder: 'Todos', options: STATUS_OPTIONS },
          { type: 'select', name: 'tipo', label: 'Tipo', placeholder: 'Todos', options: FOLLOWUP_TIPO_OPTIONS },
          {
            type: 'select',
            name: 'responsavel',
            label: 'Responsável',
            placeholder: loadingResponsaveis ? 'Carregando...' : 'Todos',
            options: responsaveis.map((responsavel) => ({
              value: String(responsavel.id),
              label: responsavel.nome,
            })),
          },
          { type: 'date', name: 'vencimentoDe', label: 'Vencimento de' },
          { type: 'date', name: 'vencimentoAte', label: 'Vencimento até' },
        ]}
        values={{
          busca,
          status: statusFiltro,
          tipo: tipoFiltro,
          responsavel: responsavelFiltro,
          vencimentoDe,
          vencimentoAte,
        }}
        onChange={(name, value) => {
          if (name === 'busca') setBusca(value);
          if (name === 'status') setStatusFiltro(value);
          if (name === 'tipo') setTipoFiltro(value);
          if (name === 'responsavel') setResponsavelFiltro(value);
          if (name === 'vencimentoDe') {
            setVencimentoDe(value);
            setPeriodoVencimento('custom');
          }
          if (name === 'vencimentoAte') {
            setVencimentoAte(value);
            setPeriodoVencimento('custom');
          }
        }}
        onClear={limparFiltros}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <FollowupSummaryCard
            key={card.metric}
            {...card}
            breakdown={getResponsavelBreakdown(summary, card.metric)}
            showBreakdown={showResponsavelBreakdown}
          />
        ))}
      </div>

      {viewMode === 'calendario' && (
        <div className="space-y-4">
          <FollowupCalendario
            tarefas={tarefas}
            month={calendarMonth}
            onMonthChange={(nextMonth) => {
              setCalendarMonth(nextMonth);
              if (
                !selectedDay ||
                selectedDay.getMonth() !== nextMonth.getMonth() ||
                selectedDay.getFullYear() !== nextMonth.getFullYear()
              ) {
                setSelectedDay(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
              }
            }}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm text-muted-foreground">
              {selectedDay
                ? `Mostrando tarefas com vencimento em ${diaSelecionadoLabel}.`
                : 'Selecione um dia para ver as tarefas.'}
            </p>
          </div>
        </div>
      )}

      {totalVisivel === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-10 h-10 text-muted-foreground/50" />}
          title={viewMode === 'calendario' ? 'Nenhuma tarefa nesse recorte' : 'Nenhuma tarefa encontrada'}
          description={
            viewMode === 'calendario'
              ? 'Selecione outro dia ou ajuste os filtros para ver tarefas.'
              : 'Crie a primeira tarefa de followup para começar a acompanhar a recepção.'
          }
          actionLabel={canCreate ? 'Nova tarefa' : undefined}
          onAction={canCreate ? abrirNovaTarefa : undefined}
        />
      ) : (
        <div className="space-y-8">
          {(['atrasadas', 'hoje', 'proximos_7_dias', 'depois'] as const).map((bucket) => {
            const data = gruposAbertos[bucket];
            if (data.length === 0) return null;
            return (
              <section key={bucket} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">{BUCKET_LABELS[bucket]}</h2>
                  <Badge color={bucket === 'atrasadas' ? 'red' : bucket === 'hoje' ? 'yellow' : 'blue'}>
                    {data.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {data.map((task) => (
                    <FollowupTaskCard
                      key={task.id}
                      task={task}
                      canMutate={canMutate}
                      canConclude={canConcludeTask(task)}
                      loading={deletingTaskId === task.id}
                      onOpenClient={() => router.push(`/clientes/${task.cliente_id}`)}
                      onEdit={() => abrirEdicao(task)}
                      onConclude={() => abrirConcluir(task)}
                      onDelete={() => setDeleteDialog({ isOpen: true, task })}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {tarefasConcluidas.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">Concluídas</h2>
                <Badge color="green">{tarefasConcluidas.length}</Badge>
              </div>
              <div className="space-y-3">
                {tarefasConcluidas.map((task) => (
                  <FollowupTaskCard
                    key={task.id}
                    task={task}
                    canMutate={false}
                    canConclude={false}
                    loading={false}
                    onOpenClient={() => router.push(`/clientes/${task.cliente_id}`)}
                    onEdit={() => {}}
                    onConclude={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        isOpen={taskModalOpen}
        onClose={fecharTaskModal}
        title={editingTask ? 'Editar tarefa' : 'Nova tarefa de followup'}
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={fecharTaskModal} disabled={taskSaving}>
              Cancelar
            </Button>
            <Button onClick={salvarTarefa} loading={taskSaving}>
              {editingTask ? 'Salvar alterações' : 'Criar tarefa'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {taskFormError && <Alert type="error">{taskFormError}</Alert>}

          <div className="space-y-3">
            <Input
              label="Buscar cliente"
              name="clienteBusca"
              type="search"
              value={taskForm.clienteBusca}
              onChange={(value) => {
                setTaskForm((prev) => ({
                  ...prev,
                  clienteBusca: value,
                  cliente: prev.cliente && prev.cliente.nome === value ? prev.cliente : null,
                }));
              }}
              placeholder="Digite nome, CPF ou telefone"
            />

            {taskForm.cliente && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{taskForm.cliente.nome}</p>
                <p className="text-muted-foreground">
                  {formatarTelefone(taskForm.cliente.telefone)}
                </p>
              </div>
            )}

            {!taskForm.cliente && clienteResultados.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                {clienteResultados.map((cliente) => (
                  <button
                    key={cliente.id}
                    onClick={() => selecionarCliente(cliente)}
                    className="w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                  >
                    <p className="font-medium text-foreground">{cliente.nome}</p>
                    <p className="text-sm text-muted-foreground">{formatarTelefone(cliente.telefone)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Responsável"
              name="responsavel"
              value={taskForm.responsavelUsuarioId}
              onChange={(value) => setTaskForm((prev) => ({ ...prev, responsavelUsuarioId: value }))}
              options={responsaveis.map((responsavel) => ({
                value: String(responsavel.id),
                label: responsavel.nome,
              }))}
              placeholder={loadingResponsaveis ? 'Carregando...' : 'Selecione o responsável'}
              required
            />

            <Select
              label="Tipo"
              name="tipo"
              value={taskForm.tipo}
              onChange={(value) => setTaskForm((prev) => ({ ...prev, tipo: value }))}
              options={FOLLOWUP_TIPO_OPTIONS}
              placeholder="Selecione o tipo"
              required
            />
          </div>

          <Input
            label="Título"
            name="titulo"
            value={taskForm.titulo}
            onChange={(value) => setTaskForm((prev) => ({ ...prev, titulo: value }))}
            placeholder="Ex: Ligar para confirmar orçamento"
            required
          />

          <Textarea
            label="Descrição"
            name="descricao"
            value={taskForm.descricao}
            onChange={(value) => setTaskForm((prev) => ({ ...prev, descricao: value }))}
            placeholder="Detalhes do contato, contexto ou observações"
            rows={4}
          />

          <Input
            label="Vencimento"
            name="vencimento"
            type="datetime-local"
            value={taskForm.vencimentoEm}
            onChange={(value) => setTaskForm((prev) => ({ ...prev, vencimentoEm: value }))}
            required
          />
        </div>
      </Modal>

      <Modal
        isOpen={concluirModalOpen}
        onClose={() => {
          setConcluirModalOpen(false);
          setTaskToConclude(null);
          setNotaConclusao('');
          setConcluirError('');
        }}
        title="Concluir tarefa"
        size="md"
        footer={(
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConcluirModalOpen(false);
                setTaskToConclude(null);
                setNotaConclusao('');
                setConcluirError('');
              }}
              disabled={concluding}
            >
              Cancelar
            </Button>
            <Button onClick={concluirTarefa} loading={concluding}>
              Concluir tarefa
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {concluirError && <Alert type="error">{concluirError}</Alert>}

          {taskToConclude && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm space-y-1">
              <p className="font-medium text-foreground">{taskToConclude.titulo}</p>
              <p className="text-muted-foreground">{taskToConclude.cliente_nome}</p>
              <p className="text-muted-foreground">
                Vencimento: {formatarDataHora(taskToConclude.vencimento_em)}
              </p>
            </div>
          )}

          <Textarea
            label="O que foi feito"
            name="notaConclusao"
            value={notaConclusao}
            onChange={setNotaConclusao}
            placeholder="Descreva o contato, retorno ou encaminhamento realizado"
            required
            rows={5}
            minLength={3}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, task: null })}
        onConfirm={excluirTarefa}
        title="Excluir tarefa"
        message={
          deleteDialog.task
            ? `Deseja excluir a tarefa "${deleteDialog.task.titulo}"? Ela sairá da rotina do followup.`
            : ''
        }
        confirmLabel="Excluir"
        type="danger"
        loading={deletingTaskId !== null}
      />
    </div>
  );
}

function FollowupTaskCard({
  task,
  canMutate,
  canConclude,
  loading,
  onOpenClient,
  onEdit,
  onConclude,
  onDelete,
}: {
  task: FollowupTarefaCompleta;
  canMutate: boolean;
  canConclude: boolean;
  loading: boolean;
  onOpenClient: () => void;
  onEdit: () => void;
  onConclude: () => void;
  onDelete: () => void;
}) {
  const tipoConfig = FOLLOWUP_TIPO_CONFIG[task.tipo];
  const urgencia = getFollowupUrgencia(task);
  const urgenciaConfig = FOLLOWUP_URGENCIA_CONFIG[urgencia];
  const vencimento = parseFollowupDateTime(task.vencimento_em);
  const notaConclusao = task.nota_conclusao?.trim();

  return (
    <div className={`rounded-xl border border-border border-l-4 bg-background p-4 shadow-sm ${tipoConfig.borderColor}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={tipoConfig.badgeColor}>{tipoConfig.label}</Badge>
            <Badge color={urgenciaConfig.badgeColor}>
              {task.status === 'concluida' ? FOLLOWUP_STATUS_LABELS.concluida : urgenciaConfig.label}
            </Badge>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-foreground">{task.titulo}</h3>
            {task.descricao && (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{task.descricao}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <p className="text-muted-foreground">
              Cliente:{' '}
              <span className="font-medium text-foreground">{task.cliente_nome}</span>
            </p>
            <p className="text-muted-foreground">
              Telefone:{' '}
              <span className="font-medium text-foreground">{formatarTelefone(task.cliente_telefone)}</span>
            </p>
            <p className="text-muted-foreground">
              Responsável:{' '}
              <span className="font-medium text-foreground">{task.responsavel_usuario_nome}</span>
            </p>
            <p className="text-muted-foreground">
              Criado por:{' '}
              <span className="font-medium text-foreground">{task.criado_por_nome}</span>
            </p>
            <p className="text-muted-foreground">
              Vencimento:{' '}
              <span className="font-medium text-foreground">
                {vencimento ? formatarDataHora(task.vencimento_em) : '—'}
              </span>
            </p>
            {task.concluida_em && (
              <p className="text-muted-foreground">
                Concluída em:{' '}
                <span className="font-medium text-foreground">{formatarDataHora(task.concluida_em)}</span>
              </p>
            )}
          </div>

          {notaConclusao && (
            <div className="rounded-lg border border-success-500/20 bg-success-500/5 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-success-700 mb-1">
                O que foi feito
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{notaConclusao}</p>
              {task.concluida_por_nome && (
                <p className="text-xs text-muted-foreground mt-2">
                  Por {task.concluida_por_nome} em {formatarDataHora(task.concluida_em)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" icon={<Eye className="w-4 h-4" />} onClick={onOpenClient}>
            Abrir cliente
          </Button>

          {task.status === 'aberta' && (
            <>
              {canMutate && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="w-4 h-4" />}
                  onClick={onEdit}
                  disabled={loading}
                >
                  Editar
                </Button>
              )}
              {canConclude && (
                <Button
                  variant="success"
                  size="sm"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={onConclude}
                  disabled={loading}
                >
                  Concluir
                </Button>
              )}
              {canMutate && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={onDelete}
                  disabled={loading}
                >
                  Excluir
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
