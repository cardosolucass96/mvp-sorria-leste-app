'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Button,
  ConfirmDialog,
  EmptyState,
  FilterBar,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatCard,
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
  getFollowupBucket,
  getFollowupUrgencia,
  parseFollowupDateTime,
} from '@/lib/utils/followup';
import usePageTitle from '@/lib/utils/usePageTitle';

interface FollowupSummary {
  abertas: number;
  atrasadas: number;
  vencem_hoje: number;
  concluidas_hoje: number;
}

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

interface FollowupFormState {
  cliente: ClienteBusca | null;
  clienteBusca: string;
  responsavelUsuarioId: string;
  tipo: string;
  titulo: string;
  descricao: string;
  vencimentoEm: string;
}

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

const initialFormState: FollowupFormState = {
  cliente: null,
  clienteBusca: '',
  responsavelUsuarioId: '',
  tipo: '',
  titulo: '',
  descricao: '',
  vencimentoEm: '',
};

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sortByDueDate(a: FollowupTarefaCompleta, b: FollowupTarefaCompleta) {
  return a.vencimento_em.localeCompare(b.vencimento_em);
}

export default function FollowupPage() {
  usePageTitle('Followup');
  const router = useRouter();
  const searchParams = useSearchParams();
  const openFollowup = searchParams.get('open');
  const openFollowupClienteId = searchParams.get('cliente_id');
  const { toast } = useToast();
  const { user, isLoading, hasRole, currentUnidade } = useAuth();
  const unitFetch = useUnitFetch();

  const canAccess = hasRole(['admin', 'atendente']);
  const canCreate = canAccess;
  const isReadOnlyAdmin = hasRole('admin');
  const canMutate = hasRole('atendente') && !isReadOnlyAdmin;

  const [tarefas, setTarefas] = useState<FollowupTarefaCompleta[]>([]);
  const [summary, setSummary] = useState<FollowupSummary>({
    abertas: 0,
    atrasadas: 0,
    vencem_hoje: 0,
    concluidas_hoje: 0,
  });
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
  const [vencimentoAte, setVencimentoAte] = useState('');

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
      try {
        const res = await fetch(`/api/usuarios?role=atendente&unidade_id=${currentUnidade}`);
        if (!res.ok) return;
        const data: Array<{ id: number; nome: string }> = await res.json();
        if (!cancelled) {
          setResponsaveis(data.map((item) => ({ id: item.id, nome: item.nome })));
        }
      } catch {
        if (!cancelled) {
          setResponsaveis([]);
        }
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
  }, [canAccess, currentUnidade]);

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
      setSummary(
        data.summary ?? {
          abertas: 0,
          atrasadas: 0,
          vencem_hoje: 0,
          concluidas_hoje: 0,
        }
      );
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
    if (!isLoading && user && canAccess) {
      carregarTarefas();
    }
  }, [canAccess, carregarTarefas, isLoading, user]);

  const tarefasVisiveis = useMemo(() => {
    if (viewMode === 'calendario' && selectedDay) {
      const key = formatLocalDateKey(selectedDay);
      return tarefas.filter((tarefa) => tarefa.vencimento_em.slice(0, 10) === key);
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

  function limparFiltros() {
    setBusca('');
    setStatusFiltro('');
    setTipoFiltro('');
    setResponsavelFiltro('');
    setVencimentoDe('');
    setVencimentoAte('');
  }

  const abrirNovaTarefa = useCallback(async (clienteId?: number) => {
    setEditingTask(null);
    setTaskForm(initialFormState);
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
  }, []);

  useEffect(() => {
    if (!canCreate) return;
    if (openFollowup !== '1') return;

    const clienteId = Number(openFollowupClienteId);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      void abrirNovaTarefa();
    } else {
      void abrirNovaTarefa(clienteId);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('open');
    nextParams.delete('cliente_id');
    const nextSearch = nextParams.toString();
    router.replace(`/followup${nextSearch ? `?${nextSearch}` : ''}`);
  }, [canCreate, openFollowup, openFollowupClienteId, abrirNovaTarefa, router]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="Abertas"
          value={summary.abertas}
          color="border-primary/40"
        />
        <StatCard
          icon={<Clock3 className="w-5 h-5" />}
          label="Atrasadas"
          value={summary.atrasadas}
          color="border-error-500/40"
          iconColor="text-error-600"
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Vencem hoje"
          value={summary.vencem_hoje}
          color="border-warning-500/40"
          iconColor="text-warning-600"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Concluídas hoje"
          value={summary.concluidas_hoje}
          color="border-success-500/40"
          iconColor="text-success-600"
        />
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
          if (name === 'vencimentoDe') setVencimentoDe(value);
          if (name === 'vencimentoAte') setVencimentoAte(value);
        }}
        onClear={limparFiltros}
      />

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
  loading,
  onOpenClient,
  onEdit,
  onConclude,
  onDelete,
}: {
  task: FollowupTarefaCompleta;
  canMutate: boolean;
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

          {canMutate && task.status === 'aberta' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil className="w-4 h-4" />}
                onClick={onEdit}
                disabled={loading}
              >
                Editar
              </Button>
              <Button
                variant="success"
                size="sm"
                icon={<CheckCircle2 className="w-4 h-4" />}
                onClick={onConclude}
                disabled={loading}
              >
                Concluir
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={onDelete}
                disabled={loading}
              >
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
