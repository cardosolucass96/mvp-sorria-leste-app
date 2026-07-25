'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, UserCheck, UserX, MessageCircle, CalendarClock, X, Plus, FileText, List, CalendarDays, Pencil } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LoadingState from '@/components/ui/LoadingState';
import Spinner from '@/components/ui/Spinner';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/_shadcn/skeleton';
import { StatusBadge, ProntuarioDrawer, AgendaCalendario, ViewModeToggle } from '@/components/domain';
import { useToast } from '@/components/ui/Toast';
import {
  formatarData,
  formatarDataAgendada,
  formatarMoeda,
  formatarTelefone,
  getCurrentDateTimeLocalValue,
  toDateTimeLocal,
} from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
import { apiFetch } from '@/lib/utils/apiFetch';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useAuth } from '@/contexts/AuthContext';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { isProfissionalAgenda } from '@/lib/utils/usuariosProfissionais';
import {
  type AgendaCalendarView,
  endOfAgendaMonth,
  endOfAgendaWeek,
  formatAgendaDateKey,
  formatAgendaRangeEnd,
  formatAgendaRangeStart,
  getAgendaDateKey,
  isAgendaDateInRange,
  parseAgendaDateKey,
  startOfAgendaMonth,
  startOfAgendaWeek,
} from '@/lib/utils/agendaCalendar';
import { addDaysToClinicDateKey, getClinicDateKey } from '@/lib/time';

interface Agendamento {
  id: number;
  cliente_id: number;
  procedimento_id: number;
  executor_id: number | null;
  executor_nome: string | null;
  data_agendada: string | null;
  status: string;
  tipo: string;
  created_at: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  procedimento_nome: string;
  etapa_modelo_nome: string | null;
  observacoes?: string | null;
  pago: number;
  atendimento_status: string | null;
  atendimento_id: number | null;
}

const ATENDIMENTO_STATUS_LABEL: Record<string, string> = {
  triagem: 'Triagem',
  avaliacao: 'Em Avaliação',
  aguardando_pagamento: 'Aguardando Pagamento',
  em_execucao: 'Em Execução',
  finalizado: 'Finalizado',
  encerrado: 'Encerrado',
};

interface Usuario {
  id: number;
  nome: string;
  role: string;
  roles?: string[];
  ativo?: number;
}

interface ClienteBusca {
  id: number;
  nome: string;
  telefone: string | null;
  cpf: string | null;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
}

interface ProcedimentoPendente {
  item_id: number;
  atendimento_id: number;
  procedimento_id: number;
  procedimento_nome: string;
  status: string;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  valor_pendente: number;
  etapa_label: string | null;
  atendimento_status: string;
  motivo_saida: string | null;
  atendimento_created_at: string;
  item_created_at: string;
}

interface AbrirNovoAgendamentoOptions {
  clienteId?: number;
  tipo?: 'avaliacao' | 'procedimento';
  procedimentoId?: number | null;
  itemOrigemId?: number | null;
  atendimentoOrigemId?: number | null;
  etapaModeloId?: number | null;
  etapaLabel?: string | null;
}

interface GrupoCliente {
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  data_key: string;
  agendamentos: Agendamento[];
}

interface AgendamentosPaginadosResponse {
  items: Agendamento[];
  total?: number;
  pages?: number;
}

const STATUS_OPTIONS = [
  { value: 'pendente,agendado,faltou,realizado', label: 'Ativos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'faltou', label: 'Faltou' },
  { value: 'realizado', label: 'Realizado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: '', label: 'Todos' },
];

const FILTROS_RAPIDOS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'amanha', label: 'Amanhã' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'todos', label: 'Todos' },
] as const;
const AGENDA_VIEW_MODE_STORAGE_KEY = 'agenda-view-mode';
const AGENDA_CALENDAR_SUBVIEW_STORAGE_KEY = 'agenda-calendar-subview';
const GROUP_EXECUTOR_CLEAR_VALUE = '__clear__';

function isAgendamentoAtivo(status: string) {
  return status === 'pendente' || status === 'agendado';
}

function getDateTimeLocalMinValue() {
  return getCurrentDateTimeLocalValue();
}

function normalizarAgendamentosResponse(
  response: Agendamento[] | AgendamentosPaginadosResponse
) {
  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      pages: 1,
    };
  }

  return {
    items: response.items ?? [],
    total: response.total ?? 0,
    pages: response.pages ?? 1,
  };
}

function getHojeAgendaDate(): Date {
  return parseAgendaDateKey(getClinicDateKey());
}

function AgendaListSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando lista de agendamentos">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="card p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-5 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaDayPanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando agendamentos do dia">
      <Skeleton className="h-5 w-44" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AgendaPage() {
  usePageTitle('Agenda');
  const router = useRouter();
  const routerReplace = router.replace;
  const searchParams = useSearchParams();
  const openAgenda = searchParams.get('open');
  const openAgendaClienteId = searchParams.get('cliente_id');
  const openAgendaTipo = searchParams.get('tipo');
  const openAgendaProcedimentoId = searchParams.get('procedimento_id');
  const openAgendaItemOrigemId = searchParams.get('item_origem_id');
  const openAgendaAtendimentoOrigemId = searchParams.get('atendimento_origem_id');
  const openAgendaEtapaModeloId = searchParams.get('etapa_modelo_id');
  const openAgendaEtapaLabel = searchParams.get('etapa_label');
  const editAgendamentoId = searchParams.get('edit');
  const searchParamsString = searchParams.toString();
  const { toast } = useToast();
  const { user, hasRole, currentUnidade } = useAuth();
  const unitFetch = useUnitFetch();

  const isAdminOrAtendente = hasRole(['admin', 'atendente']);
  // Dentistas veem apenas os próprios agendamentos. Admin/atendente com role extra mantém visão completa.
  const isDentista = hasRole(['avaliador', 'executor', 'ortodontista']) && !isAdminOrAtendente;
  const canManageAgenda = isAdminOrAtendente;

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasLoadedAgendamentos, setHasLoadedAgendamentos] = useState(false);
  const [error, setError] = useState('');

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('pendente,agendado,faltou,realizado');
  const [filtroDentista, setFiltroDentista] = useState('');
  const [dataInicio, setDataInicio] = useState(() => getClinicDateKey());
  const [dataFim, setDataFim] = useState(() => getClinicDateKey());
  const [filtroRapido, setFiltroRapido] = useState<string | null>('hoje');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Loading por grupo (clienteId_dataKey)
  const [grupoLoading, setGrupoLoading] = useState<string | null>(null);
  const [drawerClienteId, setDrawerClienteId] = useState<number | null>(null);

  // View mode + calendar state
  const [viewMode, setViewMode] = useState<'lista' | 'calendario'>('lista');
  const [calendarSubview, setCalendarSubview] = useState<AgendaCalendarView>('mes');
  const [focusedDate, setFocusedDate] = useState<Date>(() => getHojeAgendaDate());
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => getHojeAgendaDate());
  const [viewPreferencesLoaded, setViewPreferencesLoaded] = useState(false);
  const agendamentosRequestIdRef = useRef(0);
  const previousCalendarRangeKeyRef = useRef<string | null>(null);
  const handledOpenAgendaRef = useRef<string | null>(null);
  const handledEditAgendaRef = useRef<string | null>(null);
  const hojeAgendaKey = useMemo(() => getClinicDateKey(), []);
  const hojeAgendaDate = useMemo(() => parseAgendaDateKey(hojeAgendaKey), [hojeAgendaKey]);

  // Persistir viewMode no localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedViewMode = localStorage.getItem(AGENDA_VIEW_MODE_STORAGE_KEY);
      if (savedViewMode === 'calendario' || savedViewMode === 'lista') {
        setViewMode(savedViewMode);
      }

      const savedCalendarSubview = localStorage.getItem(AGENDA_CALENDAR_SUBVIEW_STORAGE_KEY);
      if (savedCalendarSubview === 'mes' || savedCalendarSubview === 'semana') {
        setCalendarSubview(savedCalendarSubview);
      }
    }

    setViewPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (viewPreferencesLoaded && typeof window !== 'undefined') {
      localStorage.setItem(AGENDA_VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode, viewPreferencesLoaded]);

  useEffect(() => {
    if (viewPreferencesLoaded && typeof window !== 'undefined') {
      localStorage.setItem(AGENDA_CALENDAR_SUBVIEW_STORAGE_KEY, calendarSubview);
    }
  }, [calendarSubview, viewPreferencesLoaded]);

  // Profissionais da agenda (avaliadores/executores/ortodontistas)
  const [profissionaisAgenda, setProfissionaisAgenda] = useState<Usuario[]>([]);

  // Confirm dialog para "Faltou"
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Dialog de reagendamento com faltou
  const [reagendarDialog, setReagendarDialog] = useState<{
    isOpen: boolean;
    grupo: GrupoCliente | null;
    novaData: string;
  }>({ isOpen: false, grupo: null, novaData: '' });

  // Dialog de edição em lote do grupo
  const [reagendarDiretoDialog, setReagendarDiretoDialog] = useState<{
    isOpen: boolean;
    grupo: GrupoCliente | null;
    novaData: string;
    executorId: string;
    error: string;
  }>({ isOpen: false, grupo: null, novaData: '', executorId: '', error: '' });

  // Dialog de cancelar
  const [cancelarDialog, setCancelarDialog] = useState<{
    isOpen: boolean;
    grupo: GrupoCliente | null;
    motivo: string;
  }>({ isOpen: false, grupo: null, motivo: '' });

  // Dialog de trocar executor
  const [executorDialog, setExecutorDialog] = useState<{
    isOpen: boolean;
    agendamento: Agendamento | null;
    executorId: string;
  }>({ isOpen: false, agendamento: null, executorId: '' });

  const [editarAgendamentoDialog, setEditarAgendamentoDialog] = useState<{
    isOpen: boolean;
    agendamento: Agendamento | null;
    executorId: string;
    data: string;
    observacoes: string;
    salvando: boolean;
    error: string;
  }>({
    isOpen: false,
    agendamento: null,
    executorId: '',
    data: '',
    observacoes: '',
    salvando: false,
    error: '',
  });

  // Modal novo agendamento
  const [novoDialog, setNovoDialog] = useState(false);
  const [novoBuscaCliente, setNovoBuscaCliente] = useState('');
  const [novoClientes, setNovoClientes] = useState<ClienteBusca[]>([]);
  const [novoClienteSelecionado, setNovoClienteSelecionado] = useState<ClienteBusca | null>(null);
  const [novoTipo, setNovoTipo] = useState<'avaliacao' | 'procedimento'>('avaliacao');
  const [novoProcedimentos, setNovoProcedimentos] = useState<Procedimento[]>([]);
  const [novoProcedimentosPendentes, setNovoProcedimentosPendentes] = useState<ProcedimentoPendente[]>([]);
  const [novoPendentesLoading, setNovoPendentesLoading] = useState(false);
  const [novoProcId, setNovoProcId] = useState('');
  const [novoItemOrigemId, setNovoItemOrigemId] = useState<number | null>(null);
  const [novoAtendimentoOrigemId, setNovoAtendimentoOrigemId] = useState<number | null>(null);
  const [novoEtapaModeloId, setNovoEtapaModeloId] = useState<number | null>(null);
  const [novoEtapaLabel, setNovoEtapaLabel] = useState('');
  const [novoExecId, setNovoExecId] = useState('');
  const [novoData, setNovoData] = useState('');
  const [novoObs, setNovoObs] = useState('');
  const [novoSalvando, setNovoSalvando] = useState(false);
  const [novoError, setNovoError] = useState('');

  const calendarRange = useMemo(() => {
    if (calendarSubview === 'semana') {
      return {
        start: startOfAgendaWeek(focusedDate),
        end: endOfAgendaWeek(focusedDate),
      };
    }

    return {
      start: startOfAgendaMonth(focusedDate),
      end: endOfAgendaMonth(focusedDate),
    };
  }, [calendarSubview, focusedDate]);

  const calendarRangeKey = useMemo(
    () => `${calendarSubview}_${formatAgendaDateKey(calendarRange.start)}_${formatAgendaDateKey(calendarRange.end)}`,
    [calendarRange.end, calendarRange.start, calendarSubview]
  );

  const carregarAgendamentos = useCallback(async () => {
    const requestId = agendamentosRequestIdRef.current + 1;
    agendamentosRequestIdRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.append('status', filtroStatus);
      if (busca) params.append('busca', busca);

      if (viewMode === 'calendario') {
        params.append('data_inicio', formatAgendaRangeStart(calendarRange.start));
        params.append('data_fim', formatAgendaRangeEnd(calendarRange.end));
      } else {
        if (dataInicio) params.append('data_inicio', dataInicio);
        if (dataFim) params.append('data_fim', dataFim);
        params.append('page', String(page));
        params.append('limit', String(LIMIT));
      }
      params.append('order_by', viewMode === 'calendario' ? 'data_agendada' : 'cliente_nome');
      params.append('order_dir', 'asc');

      // Avaliador/executor: filtrar só seus agendamentos
      if (isDentista && user) {
        params.append('executor_id', String(user.id));
      } else if (filtroDentista) {
        params.append('executor_id', filtroDentista);
      }

      const res = await unitFetch(`/api/agendamentos?${params}`);
      const data: Agendamento[] | AgendamentosPaginadosResponse = await res.json();
      if (agendamentosRequestIdRef.current !== requestId) return;

      if (!res.ok) {
        const errorMessage = (
          !Array.isArray(data)
          && typeof data === 'object'
          && data !== null
          && 'error' in data
          && typeof data.error === 'string'
        )
          ? data.error
          : null;
        setError(errorMessage || 'Erro ao carregar agendamentos');
        return;
      }
      const normalized = normalizarAgendamentosResponse(data);
      setAgendamentos(normalized.items);
      setTotal(normalized.total);
      setPages(normalized.pages);
    } catch {
      if (agendamentosRequestIdRef.current === requestId) {
        setError('Erro ao carregar agendamentos');
      }
    } finally {
      if (agendamentosRequestIdRef.current === requestId) {
        setHasLoadedAgendamentos(true);
        setLoading(false);
      }
    }
  }, [
    filtroStatus,
    busca,
    filtroDentista,
    dataInicio,
    dataFim,
    page,
    isDentista,
    user,
    unitFetch,
    viewMode,
    calendarRange.end,
    calendarRange.start,
  ]);

  useEffect(() => {
    if (!viewPreferencesLoaded) return;
    carregarAgendamentos();
  }, [carregarAgendamentos, viewPreferencesLoaded]);

  const carregarProfissionaisAgenda = useCallback(async () => {
    if (!isAdminOrAtendente) return;
    try {
      const params = new URLSearchParams();
      if (currentUnidade) {
        params.append('unidade_id', String(currentUnidade));
      }
      const res = await apiFetch(`/api/usuarios${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) return;
      const data: Usuario[] = await res.json();
      setProfissionaisAgenda(data.filter(isProfissionalAgenda));
    } catch {}
  }, [currentUnidade, isAdminOrAtendente]);

  useEffect(() => {
    if (!isAdminOrAtendente) {
      setProfissionaisAgenda([]);
      setFiltroDentista('');
      return;
    }
    void carregarProfissionaisAgenda();
  }, [isAdminOrAtendente, carregarProfissionaisAgenda]);

  useEffect(() => {
    setFiltroDentista('');
  }, [currentUnidade]);

  // ─── Novo agendamento ─────────────────────────────────────────

  const limparVinculoProcedimentoPendente = useCallback(() => {
    setNovoItemOrigemId(null);
    setNovoAtendimentoOrigemId(null);
    setNovoEtapaModeloId(null);
    setNovoEtapaLabel('');
  }, []);

  const handleSelecionarProcedimentoCatalogo = useCallback((value: string) => {
    setNovoProcId(value);
    limparVinculoProcedimentoPendente();
  }, [limparVinculoProcedimentoPendente]);

  const handleSelecionarProcedimentoPendente = useCallback((procedimento: ProcedimentoPendente) => {
    setNovoProcId(String(procedimento.procedimento_id));
    setNovoItemOrigemId(procedimento.item_id);
    setNovoAtendimentoOrigemId(procedimento.atendimento_id);
    setNovoEtapaModeloId(null);
    setNovoEtapaLabel(procedimento.etapa_label ?? '');
  }, []);

  const abrirNovoAgendamento = useCallback(async (options: AbrirNovoAgendamentoOptions = {}) => {
    if (!canManageAgenda) return;
    const tipoInicial = options.tipo === 'procedimento' || options.procedimentoId || options.itemOrigemId
      ? 'procedimento'
      : 'avaliacao';
    setNovoDialog(true);
    setNovoError('');
    setNovoClienteSelecionado(null);
    setNovoBuscaCliente('');
    setNovoClientes([]);
    setNovoTipo(tipoInicial);
    setNovoProcedimentosPendentes([]);
    setNovoPendentesLoading(false);
    setNovoProcId(options.procedimentoId ? String(options.procedimentoId) : '');
    setNovoItemOrigemId(options.itemOrigemId ?? null);
    setNovoAtendimentoOrigemId(options.atendimentoOrigemId ?? null);
    setNovoEtapaModeloId(options.etapaModeloId ?? null);
    setNovoEtapaLabel(options.etapaLabel ?? '');
    setNovoExecId('');
    setNovoData('');
    setNovoObs('');
    // Carrega procedimentos e profissionais da agenda
    if (novoProcedimentos.length === 0) {
      try {
        const res = await apiFetch('/api/procedimentos');
        setNovoProcedimentos(await res.json() as Procedimento[]);
      } catch {}
    }

    if (options.clienteId) {
      try {
        const res = await apiFetch(`/api/clientes/${options.clienteId}`);
        if (res.ok) {
          const cliente = await res.json() as ClienteBusca;
          setNovoClienteSelecionado({
            id: cliente.id,
            nome: cliente.nome,
            telefone: cliente.telefone || null,
            cpf: cliente.cpf || null,
          });
          setNovoBuscaCliente('');
          setNovoClientes([]);
        } else {
          setNovoError('Cliente não encontrado para pré-seleção.');
        }
      } catch {
        setNovoError('Não foi possível carregar o cliente para pré-seleção.');
      }
    }
    void carregarProfissionaisAgenda();
  }, [canManageAgenda, novoProcedimentos.length, carregarProfissionaisAgenda]);

  useEffect(() => {
    if (openAgenda !== '1') {
      handledOpenAgendaRef.current = null;
      return;
    }

    const openAgendaKey = [
      openAgenda,
      openAgendaClienteId ?? '',
      openAgendaTipo ?? '',
      openAgendaProcedimentoId ?? '',
      openAgendaItemOrigemId ?? '',
      openAgendaAtendimentoOrigemId ?? '',
      openAgendaEtapaModeloId ?? '',
      openAgendaEtapaLabel ?? '',
    ].join('|');

    if (handledOpenAgendaRef.current === openAgendaKey) {
      return;
    }

    handledOpenAgendaRef.current = openAgendaKey;

    const clienteId = Number(openAgendaClienteId);
    const procedimentoId = Number(openAgendaProcedimentoId);
    const itemOrigemId = Number(openAgendaItemOrigemId);
    const atendimentoOrigemId = Number(openAgendaAtendimentoOrigemId);
    const etapaModeloId = Number(openAgendaEtapaModeloId);

    void abrirNovoAgendamento({
      clienteId: Number.isInteger(clienteId) && clienteId > 0 ? clienteId : undefined,
      tipo: openAgendaTipo === 'procedimento' ? 'procedimento' : 'avaliacao',
      procedimentoId: Number.isInteger(procedimentoId) && procedimentoId > 0 ? procedimentoId : null,
      itemOrigemId: Number.isInteger(itemOrigemId) && itemOrigemId > 0 ? itemOrigemId : null,
      atendimentoOrigemId: Number.isInteger(atendimentoOrigemId) && atendimentoOrigemId > 0 ? atendimentoOrigemId : null,
      etapaModeloId: Number.isInteger(etapaModeloId) && etapaModeloId > 0 ? etapaModeloId : null,
      etapaLabel: openAgendaEtapaLabel,
    });

    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete('open');
    nextParams.delete('cliente_id');
    nextParams.delete('tipo');
    nextParams.delete('procedimento_id');
    nextParams.delete('item_origem_id');
    nextParams.delete('atendimento_origem_id');
    nextParams.delete('etapa_modelo_id');
    nextParams.delete('etapa_label');
    const nextSearch = nextParams.toString();
    routerReplace(`/agenda${nextSearch ? `?${nextSearch}` : ''}`);
  }, [
    abrirNovoAgendamento,
    openAgenda,
    openAgendaAtendimentoOrigemId,
    openAgendaClienteId,
    openAgendaEtapaLabel,
    openAgendaEtapaModeloId,
    openAgendaItemOrigemId,
    openAgendaProcedimentoId,
    openAgendaTipo,
    routerReplace,
    searchParamsString,
  ]);

  const buscarClientes = async (termo: string) => {
    setNovoBuscaCliente(termo);
    if (termo.length < 2) { setNovoClientes([]); return; }
    try {
      const res = await apiFetch(`/api/clientes?busca=${encodeURIComponent(termo)}&limit=8`);
      const data = await res.json() as { clientes?: ClienteBusca[] };
      setNovoClientes(data.clientes ?? []);
    } catch {}
  };

  useEffect(() => {
    if (!novoDialog || !novoClienteSelecionado || novoTipo !== 'procedimento') {
      setNovoProcedimentosPendentes([]);
      setNovoPendentesLoading(false);
      return;
    }

    const clienteSelecionadoId = novoClienteSelecionado.id;
    let cancelled = false;

    async function carregarProcedimentosPendentes() {
      setNovoPendentesLoading(true);
      try {
        const res = await unitFetch(`/api/clientes/${clienteSelecionadoId}/procedimentos-pendentes`);
        const data = await res.json() as ProcedimentoPendente[] | { error?: string };
        if (!res.ok) {
          throw new Error(
            !Array.isArray(data) && typeof data === 'object' && data !== null && 'error' in data
              ? data.error || 'Erro ao carregar procedimentos pendentes'
              : 'Erro ao carregar procedimentos pendentes'
          );
        }

        if (!cancelled) {
          setNovoProcedimentosPendentes(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setNovoProcedimentosPendentes([]);
        }
      } finally {
        if (!cancelled) {
          setNovoPendentesLoading(false);
        }
      }
    }

    void carregarProcedimentosPendentes();

    return () => {
      cancelled = true;
    };
  }, [novoClienteSelecionado, novoDialog, novoTipo, unitFetch]);

  const abrirEditarAgendamento = useCallback(async (agendamento: Agendamento) => {
    if (!canManageAgenda || !isAgendamentoAtivo(agendamento.status)) return;
    await carregarProfissionaisAgenda();
    setEditarAgendamentoDialog({
      isOpen: true,
      agendamento,
      executorId: agendamento.executor_id ? String(agendamento.executor_id) : '',
      data: toDateTimeLocal(agendamento.data_agendada),
      observacoes: agendamento.observacoes ?? '',
      salvando: false,
      error: '',
    });
  }, [canManageAgenda, carregarProfissionaisAgenda]);

  useEffect(() => {
    if (!isAdminOrAtendente || !editAgendamentoId) {
      if (!editAgendamentoId) {
        handledEditAgendaRef.current = null;
      }
      return;
    }

    const editAgendaKey = `edit:${editAgendamentoId}`;
    if (handledEditAgendaRef.current === editAgendaKey) {
      return;
    }

    handledEditAgendaRef.current = editAgendaKey;

    const agendamentoId = Number(editAgendamentoId);
    if (!Number.isInteger(agendamentoId) || agendamentoId <= 0) return;

    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.delete('edit');
    const nextSearch = nextParams.toString();
    routerReplace(`/agenda${nextSearch ? `?${nextSearch}` : ''}`);

    async function abrirEdicaoPorParametro() {
      try {
        const res = await unitFetch(`/api/agendamentos/${agendamentoId}`);
        const data = await res.json() as Agendamento | { error?: string };
        if (!res.ok) {
          toast.error(
            !Array.isArray(data) && typeof data === 'object' && data !== null && 'error' in data
              ? data.error || 'Agendamento não encontrado'
              : 'Agendamento não encontrado'
          );
          return;
        }

        await abrirEditarAgendamento(data as Agendamento);
      } catch {
        toast.error('Erro ao abrir o agendamento solicitado');
      }
    }

    void abrirEdicaoPorParametro();
  }, [abrirEditarAgendamento, editAgendamentoId, isAdminOrAtendente, routerReplace, searchParamsString, toast, unitFetch]);

  const abrirEditarGrupo = async (grupo: GrupoCliente) => {
    if (!isAdminOrAtendente) return;
    await carregarProfissionaisAgenda();
    setReagendarDiretoDialog({
      isOpen: true,
      grupo,
      novaData: '',
      executorId: '',
      error: '',
    });
  };

  const handleCriarAgendamento = async () => {
    if (!canManageAgenda) {
      setNovoError('Seu perfil pode apenas visualizar a própria agenda');
      return;
    }
    if (!novoClienteSelecionado) {
      setNovoError('Selecione um cliente');
      return;
    }
    if (novoTipo === 'procedimento' && !novoProcId) {
      setNovoError('Selecione um procedimento');
      return;
    }
    setNovoSalvando(true);
    setNovoError('');
    try {
      const body: Record<string, unknown> = {
        cliente_id: novoClienteSelecionado.id,
        data_agendada: novoData || null,
        observacoes: novoObs || null,
      };
      if (novoTipo === 'avaliacao') {
        body.tipo = 'avaliacao';
      } else {
        body.procedimento_id = parseInt(novoProcId);
        if (novoItemOrigemId) {
          body.item_atendimento_origem_id = novoItemOrigemId;
        }
        if (novoAtendimentoOrigemId) {
          body.atendimento_origem_id = novoAtendimentoOrigemId;
        }
        if (novoEtapaModeloId) {
          body.etapa_modelo_id = novoEtapaModeloId;
        }
      }
      body.executor_id = novoExecId ? parseInt(novoExecId) : null;
      const res = await unitFetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Erro ao criar agendamento');
      }
      toast.success('Agendamento criado com sucesso');
      setNovoDialog(false);
      carregarAgendamentos();
    } catch (err) {
      setNovoError(err instanceof Error ? err.message : 'Erro ao criar agendamento');
    } finally {
      setNovoSalvando(false);
    }
  };

  const handleSalvarEdicaoAgendamento = async () => {
    if (!canManageAgenda) return;
    const { agendamento, executorId, data, observacoes } = editarAgendamentoDialog;
    if (!agendamento) return;

    const body: Record<string, unknown> = {};
    const executorAtual = agendamento.executor_id ? String(agendamento.executor_id) : '';
    const dataAtual = toDateTimeLocal(agendamento.data_agendada);
    const observacoesAtuais = agendamento.observacoes ?? '';

    if (executorId !== executorAtual) {
      body.executor_id = executorId ? parseInt(executorId, 10) : null;
    }
    if (data !== dataAtual) {
      body.data_agendada = data || null;
    }
    if (observacoes !== observacoesAtuais) {
      body.observacoes = observacoes || null;
    }

    if (Object.keys(body).length === 0) {
      setEditarAgendamentoDialog((prev) => ({ ...prev, error: 'Nenhuma alteração para salvar.' }));
      return;
    }

    setEditarAgendamentoDialog((prev) => ({ ...prev, salvando: true, error: '' }));
    try {
      const res = await unitFetch(`/api/agendamentos/${agendamento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseData = await res.json() as { error?: string };
      if (!res.ok) {
        throw new Error(responseData.error || 'Erro ao atualizar agendamento');
      }
      toast.success('Agendamento atualizado com sucesso');
      setEditarAgendamentoDialog({
        isOpen: false,
        agendamento: null,
        executorId: '',
        data: '',
        observacoes: '',
        salvando: false,
        error: '',
      });
      await carregarAgendamentos();
    } catch (err) {
      setEditarAgendamentoDialog((prev) => ({
        ...prev,
        salvando: false,
        error: err instanceof Error ? err.message : 'Erro ao atualizar agendamento',
      }));
    }
  };

  const handleBuscar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const buscaNormalizada = String(formData.get('busca') ?? '').trim();

    if (busca !== buscaNormalizada) {
      setBusca(buscaNormalizada);
      setPage(1);
      return;
    }

    if (page !== 1) setPage(1);
    else carregarAgendamentos();
  };

  // ─── Filtros rápidos ─────────────────────────────────────────

  const aplicarFiltroRapido = (tipo: string) => {
    const hoje = getClinicDateKey();
    switch (tipo) {
      case 'hoje':
        setDataInicio(hoje);
        setDataFim(hoje);
        break;
      case 'amanha': {
        const amanha = addDaysToClinicDateKey(hoje, 1);
        setDataInicio(amanha);
        setDataFim(amanha);
        break;
      }
      case 'semana': {
        const fimSemana = formatAgendaDateKey(endOfAgendaWeek(parseAgendaDateKey(hoje)));
        setDataInicio(hoje);
        setDataFim(fimSemana);
        break;
      }
      case 'todos':
        setDataInicio('');
        setDataFim('');
        break;
    }
    setFiltroRapido(tipo);
    setPage(1);
  };

  // Agrupamento por cliente + data
  const agrupados = useMemo<GrupoCliente[]>(() => {
    const map = new Map<string, GrupoCliente>();
    for (const ag of agendamentos) {
      const dataKey = getAgendaDateKey(ag.data_agendada) ?? 'sem-data';
      const key = `${ag.cliente_id}_${dataKey}`;
      if (!map.has(key)) {
        map.set(key, {
          cliente_id: ag.cliente_id,
          cliente_nome: ag.cliente_nome,
          cliente_telefone: ag.cliente_telefone,
          data_key: dataKey,
          agendamentos: [],
        });
      }
      map.get(key)!.agendamentos.push(ag);
    }
    return Array.from(map.values()).sort((a, b) => {
      const n = a.cliente_nome.localeCompare(b.cliente_nome);
      if (n !== 0) return n;
      return a.data_key.localeCompare(b.data_key);
    });
  }, [agendamentos]);

  // Separar agendamentos com data e sem data
  const agrupadosComData = agrupados.filter(g => g.data_key !== 'sem-data');
  const agrupadosSemData = agrupados.filter(g => g.data_key === 'sem-data');

  const visibleCalendarDayKeys = useMemo(() => {
    if (viewMode !== 'calendario') return [];

    const keys = new Set<string>();
    for (const agendamento of agendamentos) {
      const dateKey = getAgendaDateKey(agendamento.data_agendada);
      if (!dateKey) continue;

      const parsedDay = parseAgendaDateKey(dateKey);
      if (!isAgendaDateInRange(parsedDay, calendarRange.start, calendarRange.end)) continue;
      keys.add(dateKey);
    }

    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [agendamentos, calendarRange.end, calendarRange.start, viewMode]);

  useEffect(() => {
    if (viewMode !== 'calendario') {
      previousCalendarRangeKeyRef.current = null;
      return;
    }

    const rangeChanged = previousCalendarRangeKeyRef.current !== calendarRangeKey;
    previousCalendarRangeKeyRef.current = calendarRangeKey;

    if (selectedDay && isAgendaDateInRange(selectedDay, calendarRange.start, calendarRange.end)) {
      return;
    }

    if (!rangeChanged && selectedDay) {
      return;
    }

    if (isAgendaDateInRange(hojeAgendaDate, calendarRange.start, calendarRange.end)) {
      setSelectedDay(hojeAgendaDate);
      return;
    }

    const nextDayKey = visibleCalendarDayKeys[0];
    setSelectedDay(nextDayKey ? parseAgendaDateKey(nextDayKey) : null);
  }, [
    calendarRange.end,
    calendarRange.start,
    calendarRangeKey,
    hojeAgendaDate,
    selectedDay,
    viewMode,
    visibleCalendarDayKeys,
  ]);

  // ─── Chegou ───────────────────────────────────────────────────

  const handleChegou = async (grupo: GrupoCliente) => {
    const gatilho = grupo.agendamentos.find(
      ag => ag.status === 'pendente' || ag.status === 'agendado'
    );
    if (!gatilho) return;

    const key = `${grupo.cliente_id}_${grupo.data_key}`;
    setGrupoLoading(key);
    try {
      const res = await unitFetch(`/api/agendamentos/${gatilho.id}/chegou`, { method: 'POST' });
      const data = await res.json() as {
        id?: number;
        agendamentos_agrupados?: number;
        atendimento_existente_id?: number;
        error?: string;
      };

      if (res.status === 201) {
        const agendamentosAgrupados = data.agendamentos_agrupados ?? 0;
        if (agendamentosAgrupados > 1) {
          toast.success(`${agendamentosAgrupados} procedimentos agrupados em 1 atendimento`);
        }
        if (isAdminOrAtendente) {
          if (typeof data.id !== 'number') {
            throw new Error('Resposta inválida ao registrar chegada.');
          }
          router.push(`/atendimentos/${data.id}`);
        } else {
          toast.success('Chegada registrada');
          carregarAgendamentos();
        }
        return;
      }
      if (res.status === 409) {
        toast.warning(
          `Cliente já tem atendimento aberto hoje. Ver atendimento #${data.atendimento_existente_id}`,
          8000
        );
        return;
      }
      toast.error(data.error || 'Erro ao registrar chegada');
    } catch {
      toast.error('Erro ao registrar chegada');
    } finally {
      setGrupoLoading(null);
    }
  };

  // ─── Faltou (todos os ativos do grupo) ───────────────────────

  const marcarFaltouGrupo = async (grupo: GrupoCliente, novaData?: string) => {
    const key = `${grupo.cliente_id}_${grupo.data_key}`;
    setGrupoLoading(key);
    try {
      const ativos = grupo.agendamentos.filter(
        ag => ag.status === 'pendente' || ag.status === 'agendado'
      );
      await Promise.all(
        ativos.map(ag =>
          unitFetch(`/api/agendamentos/${ag.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'faltou' }),
          })
        )
      );
      if (novaData) {
        await Promise.all(
          ativos.map(ag =>
            unitFetch('/api/agendamentos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cliente_id: ag.cliente_id,
                procedimento_id: ag.procedimento_id,
                atendimento_origem_id: null,
                reagendado_de_id: ag.id,
                pago: ag.pago,
                data_agendada: novaData,
              }),
            })
          )
        );
        toast.success('Falta registrada — reagendado para a nova data');
      } else {
        toast.success('Falta registrada');
      }
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao registrar falta');
    } finally {
      setGrupoLoading(null);
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      setReagendarDialog({ isOpen: false, grupo: null, novaData: '' });
    }
  };

  const handleFaltou = (grupo: GrupoCliente) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Registrar falta',
      message: `${grupo.cliente_nome} não compareceu?`,
      type: 'warning',
      confirmLabel: 'Confirmar',
      onConfirm: () => marcarFaltouGrupo(grupo),
    });
  };

  const handleFaltouReagendar = (grupo: GrupoCliente) => {
    setReagendarDialog({ isOpen: true, grupo, novaData: '' });
  };

  // ─── Reagendar direto (sem faltou) ───────────────────────────

  const handleEditarGrupo = async () => {
    const { grupo, novaData, executorId } = reagendarDiretoDialog;
    if (!grupo) return;

    const bodyBase: Record<string, unknown> = {};
    if (novaData) {
      bodyBase.data_agendada = novaData;
    }
    if (executorId) {
      bodyBase.executor_id = executorId === GROUP_EXECUTOR_CLEAR_VALUE ? null : parseInt(executorId, 10);
    }

    if (Object.keys(bodyBase).length === 0) {
      setReagendarDiretoDialog((prev) => ({
        ...prev,
        error: 'Informe ao menos uma alteração para aplicar ao grupo.',
      }));
      return;
    }

    const key = `${grupo.cliente_id}_${grupo.data_key}`;
    setGrupoLoading(key);
    try {
      const ativos = grupo.agendamentos.filter(
        ag => isAgendamentoAtivo(ag.status)
      );
      await Promise.all(
        ativos.map(async (ag) => {
          const res = await unitFetch(`/api/agendamentos/${ag.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyBase),
          });
          if (!res.ok) {
            const responseData = await res.json() as { error?: string };
            throw new Error(responseData.error || 'Erro ao atualizar grupo');
          }
        })
      );
      toast.success('Grupo atualizado com sucesso');
      setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '', executorId: '', error: '' });
      await carregarAgendamentos();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar grupo';
      toast.error(message);
      setReagendarDiretoDialog((prev) => ({
        ...prev,
        error: message,
      }));
    } finally {
      setGrupoLoading(null);
    }
  };

  // ─── Cancelar ────────────────────────────────────────────────

  const handleCancelar = async () => {
    const { grupo, motivo } = cancelarDialog;
    if (!grupo) return;

    const key = `${grupo.cliente_id}_${grupo.data_key}`;
    setGrupoLoading(key);
    try {
      const ativos = grupo.agendamentos.filter(
        ag => ag.status === 'pendente' || ag.status === 'agendado'
      );
      await Promise.all(
        ativos.map(ag =>
          unitFetch(`/api/agendamentos/${ag.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'cancelado',
              motivo_cancelamento: motivo || 'Cancelado pela clínica',
            }),
          })
        )
      );
      toast.success('Agendamento(s) cancelado(s)');
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao cancelar');
    } finally {
      setGrupoLoading(null);
      setCancelarDialog({ isOpen: false, grupo: null, motivo: '' });
    }
  };

  // ─── Trocar executor ─────────────────────────────────────────

  const handleTrocarExecutor = async () => {
    const { agendamento, executorId } = executorDialog;
    if (!agendamento) return;
    try {
      const res = await unitFetch(`/api/agendamentos/${agendamento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executor_id: executorId ? parseInt(executorId) : null }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast.error(data.error || 'Erro ao atualizar executor');
        return;
      }
      toast.success('Executor atualizado');
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao atualizar executor');
    } finally {
      setExecutorDialog({ isOpen: false, agendamento: null, executorId: '' });
    }
  };

  // ─── WhatsApp ─────────────────────────────────────────────────

  const gerarLinkWhatsApp = (grupo: GrupoCliente): string => {
    const digitos = grupo.cliente_telefone?.replace(/\D/g, '') ?? '';
    const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
    const nomes = grupo.agendamentos.map(ag =>
      ag.procedimento_nome + (ag.etapa_modelo_nome ? ` — ${ag.etapa_modelo_nome}` : '')
    ).join(', ');
    const data = grupo.agendamentos[0]?.data_agendada;
    const dataFmt = data ? formatarDataAgendada(data) : null;
    const msg = `Olá ${grupo.cliente_nome}! Passamos para lembrar sobre seu(s) agendamento(s) de *${nomes}*${dataFmt ? ` para *${dataFmt}*` : ''}. Qualquer dúvida, estamos à disposição 😊\n\nSorria Leste`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
  };

  // ─── Render grupo card ────────────────────────────────────────

  const renderGrupoCard = (grupo: GrupoCliente) => {
    const key = `${grupo.cliente_id}_${grupo.data_key}`;
    const isLoading = grupoLoading === key;
    const temAtivo = grupo.agendamentos.some(
      ag => isAgendamentoAtivo(ag.status)
    );
    const dataGrupo = grupo.agendamentos[0]?.data_agendada;

    // Destino do card para dentistas
    const cardDestino = (() => {
      if (isAdminOrAtendente) return null;
      const atAtivo = grupo.agendamentos.find(
        a => a.atendimento_status && !['finalizado', 'encerrado'].includes(a.atendimento_status)
      );
      if (!atAtivo) return null;
      const st = atAtivo.atendimento_status!;
      if (['triagem', 'avaliacao'].includes(st) && hasRole(['avaliador'])) return '/avaliacao';
      if (st === 'em_execucao' && hasRole(['executor'])) return '/execucao';
      return null;
    })();

    return (
      <div
        key={key}
        className={`card overflow-hidden${cardDestino ? ' cursor-pointer hover:ring-2 hover:ring-primary-300 transition-shadow' : ''}`}
        onClick={cardDestino ? () => router.push(cardDestino) : undefined}
      >
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-secondary px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{grupo.cliente_nome}</span>
            {isAdminOrAtendente && grupo.cliente_telefone && (
              <span className="text-sm text-muted-foreground">{formatarTelefone(grupo.cliente_telefone)}</span>
            )}
            {dataGrupo
              ? <Badge color="blue" size="sm">{formatarDataAgendada(dataGrupo)}</Badge>
              : <Badge color="gray" size="sm">Sem data</Badge>
            }
            <Badge color="gray" size="sm">{grupo.agendamentos.length} sessão(ões)</Badge>
            {(() => {
              const atAtivo = grupo.agendamentos.find(
                a => a.atendimento_status && !['finalizado', 'encerrado'].includes(a.atendimento_status)
              );
              if (atAtivo) {
                const statusAt = atAtivo.atendimento_status!;
                const handleClick = () => {
                  if (isAdminOrAtendente) {
                    router.push(`/atendimentos/${atAtivo.atendimento_id}`);
                  } else if (['triagem', 'avaliacao'].includes(statusAt) && hasRole(['avaliador'])) {
                    router.push('/avaliacao');
                  } else if (statusAt === 'em_execucao' && hasRole(['executor'])) {
                    router.push('/execucao');
                  }
                };
                const isClickable = isAdminOrAtendente
                  || (['triagem', 'avaliacao'].includes(statusAt) && hasRole(['avaliador']))
                  || (statusAt === 'em_execucao' && hasRole(['executor']));
                return (
                  <button onClick={handleClick} disabled={!isClickable} className={isClickable ? 'cursor-pointer' : 'cursor-default'} title={isClickable ? 'Ir para fila' : undefined}>
                    <Badge color="green" size="sm">
                      🏥 Na clínica — {ATENDIMENTO_STATUS_LABEL[statusAt] || statusAt}
                    </Badge>
                  </button>
                );
              }
              const atFinalizado = grupo.agendamentos.find(
                a => a.atendimento_status && ['finalizado', 'encerrado'].includes(a.atendimento_status)
              );
              if (atFinalizado) {
                return isAdminOrAtendente ? (
                  <button onClick={() => router.push(`/atendimentos/${atFinalizado.atendimento_id}`)} title="Ver atendimento">
                    <Badge color="gray" size="sm">
                      ✓ {ATENDIMENTO_STATUS_LABEL[atFinalizado.atendimento_status!] || atFinalizado.atendimento_status}
                    </Badge>
                  </button>
                ) : (
                  <Badge color="gray" size="sm">
                    ✓ {ATENDIMENTO_STATUS_LABEL[atFinalizado.atendimento_status!] || atFinalizado.atendimento_status}
                  </Badge>
                );
              }
              return null;
            })()}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDrawerClienteId(grupo.cliente_id); }}
              title="Ver prontuário"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prontuário</span>
            </button>
            {isAdminOrAtendente && grupo.cliente_telefone && (
              <a
                href={gerarLinkWhatsApp(grupo)}
                target="_blank"
                rel="noopener noreferrer"
                title="Lembrete WhatsApp"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center p-1.5 rounded text-success-600 dark:text-success-300 hover:bg-success-600/10 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            {canManageAgenda && temAtivo && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelarDialog({ isOpen: true, grupo, motivo: '' })}
                  disabled={isLoading}
                  className="!text-error-600 dark:!text-error-300 hover:!bg-error-500/10"
                  title="Cancelar agendamento(s)"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { void abrirEditarGrupo(grupo); }}
                  disabled={isLoading}
                  title="Editar data e executor do grupo"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Editar grupo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFaltouReagendar(grupo)}
                  disabled={isLoading}
                  className="!border-warning-500/30 !text-warning-800 dark:!text-warning-200 hover:!bg-warning-500/10"
                  title="Faltou — cria novos agendamentos pendentes"
                >
                  <CalendarClock className="w-3.5 h-3.5 mr-1" />
                  Faltou/Reagendar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFaltou(grupo)}
                  disabled={isLoading}
                  className="!border-warning-500/30 !text-warning-800 dark:!text-warning-200 hover:!bg-warning-500/10"
                >
                  <UserX className="w-3.5 h-3.5 mr-1" />
                  Faltou
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleChegou(grupo)}
                  loading={isLoading}
                  className="!bg-success-600 hover:!bg-success-700 !text-success-50"
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                  Chegou
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Lista de procedimentos */}
        <div className="divide-y divide-border">
          {grupo.agendamentos.map((ag) => {
            const podTrocar = isAdminOrAtendente && isAgendamentoAtivo(ag.status);
            const podEditar = isAdminOrAtendente && isAgendamentoAtivo(ag.status);
            return (
              <div key={ag.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">
                    {ag.procedimento_nome}
                    {ag.etapa_modelo_nome && (
                      <span className="ml-1 text-muted-foreground">— {ag.etapa_modelo_nome}</span>
                    )}
                  </span>
                  {(() => {
                    const roleLabel = ag.tipo === 'avaliacao' ? 'Avaliador' : 'Executor';
                    if (ag.executor_nome) {
                      return podTrocar ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); void carregarProfissionaisAgenda(); setExecutorDialog({ isOpen: true, agendamento: ag, executorId: String(ag.executor_id ?? '') }); }}
                          className="block text-xs text-muted-foreground transition-colors hover:text-primary-600 hover:underline"
                          title={`Clique para trocar ${roleLabel.toLowerCase()}`}
                        >
                          {roleLabel}: {ag.executor_nome}
                        </button>
                      ) : (
                        <span className="block text-xs text-muted-foreground">{roleLabel}: {ag.executor_nome}</span>
                      );
                    }
                    return podTrocar ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); void carregarProfissionaisAgenda(); setExecutorDialog({ isOpen: true, agendamento: ag, executorId: '' }); }}
                        className="block text-xs italic text-muted-foreground transition-colors hover:text-primary-600 hover:underline"
                        title={`Clique para definir ${roleLabel.toLowerCase()}`}
                      >
                        Sem {roleLabel.toLowerCase()}
                      </button>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {ag.tipo !== 'avaliacao' && (
                    ag.pago ? <Badge color="green" size="sm">Pago</Badge> : <Badge color="gray" size="sm">A pagar</Badge>
                  )}
                  {canManageAgenda && podEditar && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void abrirEditarAgendamento(ag);
                      }}
                      title="Editar este agendamento"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Editar
                    </Button>
                  )}
                  {ag.status !== 'realizado' && (
                    <StatusBadge type="agendamento" status={ag.status} size="sm" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isRefreshingAgendamentos = loading && hasLoadedAgendamentos;

  if (loading && !hasLoadedAgendamentos) return <LoadingState text="Carregando agenda..." />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title={isDentista ? 'Minha Agenda' : 'Agenda'}
        icon={<Calendar className="w-7 h-7" />}
        description={isDentista ? `Seus agendamentos, ${user?.nome}` : 'Gestão de retornos agendados'}
        actions={
          <div className="flex items-center gap-2">
            <ViewModeToggle
              options={[
                { key: 'lista', label: 'Lista', icon: <List className="w-4 h-4" /> },
                { key: 'calendario', label: 'Calendário', icon: <CalendarDays className="w-4 h-4" /> },
              ]}
              active={viewMode}
              onChange={(key) => setViewMode(key as 'lista' | 'calendario')}
            />
            {canManageAgenda && (
              <Button onClick={() => { void abrirNovoAgendamento(); }}>
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Novo Agendamento</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Filtros */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="agenda-busca" className="block text-sm font-medium text-foreground mb-1">
              Buscar cliente
            </label>
            <input
              id="agenda-busca"
              name="busca"
              type="search"
              defaultValue={busca}
              placeholder="Nome do cliente..."
              className="field-control w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[220px]">
            <Select
              label="Status"
              name="filtroStatus"
              value={filtroStatus}
              onChange={(value) => {
                setFiltroStatus(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              placeholder="Todos"
            />
          </div>
          {isAdminOrAtendente && (
            <div className="min-w-[240px]">
              <Select
                label="Dentista"
                name="filtroDentista"
                value={filtroDentista}
                onChange={(value) => {
                  setFiltroDentista(value);
                  setPage(1);
                }}
                options={profissionaisAgenda.map((profissional) => ({
                  value: String(profissional.id),
                  label: profissional.nome,
                }))}
                placeholder="Todos os dentistas"
              />
            </div>
          )}
          {viewMode === 'lista' && (
            <>
              <div className="min-w-[160px]">
                <Input label="Data início" name="dataInicio" type="date" value={dataInicio} onChange={(v) => { setDataInicio(v); setFiltroRapido(null); setPage(1); }} />
              </div>
              <div className="min-w-[160px]">
                <Input label="Data fim" name="dataFim" type="date" value={dataFim} onChange={(v) => { setDataFim(v); setFiltroRapido(null); setPage(1); }} />
              </div>
            </>
          )}
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>

        {/* Filtros rápidos — só no modo lista */}
        {viewMode === 'lista' && (
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            {FILTROS_RAPIDOS.map(f => (
              <button
                key={f.id}
                onClick={() => aplicarFiltroRapido(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtroRapido === f.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{total > 0 ? `${agrupados.length} cliente(s) · ${total} agendamento(s)` : 'Nenhum resultado'}</span>
        {isRefreshingAgendamentos && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground" role="status" aria-live="polite">
            <Spinner size="sm" className="text-primary" />
            Atualizando agenda...
          </span>
        )}
      </div>

      {viewMode === 'calendario' ? (
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,420px)]">
          <AgendaCalendario
            agendamentos={agendamentos}
            view={calendarSubview}
            onViewChange={setCalendarSubview}
            focusedDate={focusedDate}
            onFocusedDateChange={setFocusedDate}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            loading={isRefreshingAgendamentos}
          />
          <div className="space-y-3">
            {isRefreshingAgendamentos ? (
              <AgendaDayPanelSkeleton />
            ) : (() => {
              if (!selectedDay) {
                return (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {visibleCalendarDayKeys.length > 0
                      ? 'Selecione um dia no calendário para ver os agendamentos.'
                      : 'Nenhum agendamento no período exibido.'}
                  </div>
                );
              }
              const dayKey = formatAgendaDateKey(selectedDay);
              const gruposDoDia = agrupadosComData.filter(g => g.data_key === dayKey);
              const label = selectedDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
              if (gruposDoDia.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum agendamento em {label}.
                  </div>
                );
              }
              return (
                <>
                  <h3 className="text-sm font-semibold text-foreground capitalize">{label}</h3>
                  {gruposDoDia.map(renderGrupoCard)}
                </>
              );
            })()}
          </div>
        </div>
      ) : isRefreshingAgendamentos ? (
        <AgendaListSkeleton />
      ) : agendamentos.length === 0 ? (
        <EmptyState
          title="Nenhum agendamento encontrado"
          description="Não há agendamentos que correspondam aos filtros selecionados."
        />
      ) : (
        <>
          {/* Agendamentos com data */}
          {agrupadosComData.length > 0 && (
            <div className="space-y-3">
              {agrupadosComData.map(renderGrupoCard)}
            </div>
          )}

          {/* Agendamentos sem data */}
          {agrupadosSemData.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Sem data agendada ({agrupadosSemData.reduce((s, g) => s + g.agendamentos.length, 0)})
              </h3>
              <div className="space-y-3">
                {agrupadosSemData.map(renderGrupoCard)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Paginação */}
      {viewMode === 'lista' && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {page} de {pages} · {total} registros</span>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => setPage(1)} disabled={page === 1}>«</Button>
            <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, pages - 4));
              const n = start + i;
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    n === page ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Próxima</Button>
            <Button variant="secondary" size="sm" onClick={() => setPage(pages)} disabled={page === pages}>»</Button>
          </div>
        </div>
      )}

      {/* ─── Dialogs ─────────────────────────────────────────────── */}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel={confirmDialog.confirmLabel}
      />

      {/* Faltou + Reagendar */}
      {reagendarDialog.isOpen && reagendarDialog.grupo && (
        <Modal isOpen onClose={() => setReagendarDialog({ isOpen: false, grupo: null, novaData: '' })} title="Faltou — Reagendar">
          <p className="mb-1 text-sm text-muted-foreground">
            <strong>{reagendarDialog.grupo.cliente_nome}</strong>
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Escolha a nova data para todos os procedimentos:
          </p>
          <ul className="mb-4 space-y-1">
            {reagendarDialog.grupo.agendamentos
              .filter(ag => ag.status === 'pendente' || ag.status === 'agendado')
              .map(ag => (
                <li key={ag.id} className="text-sm text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {ag.procedimento_nome}{ag.etapa_modelo_nome ? ` — ${ag.etapa_modelo_nome}` : ''}
                </li>
              ))}
          </ul>
          <div className="mb-5">
            <label className="block text-sm font-medium text-foreground mb-1">Nova data</label>
            <input
              type="datetime-local"
              min={getDateTimeLocalMinValue()}
              value={reagendarDialog.novaData}
              onChange={e => setReagendarDialog(prev => ({ ...prev, novaData: e.target.value }))}
              className="field-control w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReagendarDialog({ isOpen: false, grupo: null, novaData: '' })}>
              Voltar
            </Button>
            <Button
              variant="primary"
              disabled={!reagendarDialog.novaData}
              loading={grupoLoading === `${reagendarDialog.grupo.cliente_id}_${reagendarDialog.grupo.data_key}`}
              onClick={() => marcarFaltouGrupo(reagendarDialog.grupo!, reagendarDialog.novaData)}
            >
              Confirmar Reagendamento
            </Button>
          </div>
        </Modal>
      )}

      {/* Editar grupo */}
      {reagendarDiretoDialog.isOpen && reagendarDiretoDialog.grupo && (
        <Modal
          isOpen
          onClose={() => setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '', executorId: '', error: '' })}
          title="Editar grupo de agendamentos"
        >
          {reagendarDiretoDialog.error && (
            <Alert type="error" dismissible onDismiss={() => setReagendarDiretoDialog((prev) => ({ ...prev, error: '' }))}>
              {reagendarDiretoDialog.error}
            </Alert>
          )}
          <p className="mb-1 text-sm text-muted-foreground">
            Atualizar as sessões ativas de <strong>{reagendarDiretoDialog.grupo.cliente_nome}</strong>.
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Você pode alterar a data/hora, o executor, ou os dois campos ao mesmo tempo.
          </p>
          <ul className="mb-4 space-y-1">
            {reagendarDiretoDialog.grupo.agendamentos
              .filter(ag => isAgendamentoAtivo(ag.status))
              .map(ag => (
                <li key={ag.id} className="text-sm text-foreground flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {ag.procedimento_nome}{ag.etapa_modelo_nome ? ` — ${ag.etapa_modelo_nome}` : ''}
                </li>
              ))}
          </ul>
          <div className="mb-5">
            <Input
              label="Nova data e hora (opcional)"
              name="editar_grupo_data_agendada"
              type="datetime-local"
              value={reagendarDiretoDialog.novaData}
              onChange={(value) => setReagendarDiretoDialog(prev => ({ ...prev, novaData: value, error: '' }))}
              hint="Deixe em branco para manter os horários atuais."
            />
          </div>
          <div className="mb-5">
            <Select
              label="Executor para todas (opcional)"
              name="editar_grupo_executor_id"
              value={reagendarDiretoDialog.executorId}
              onChange={(value) => setReagendarDiretoDialog(prev => ({ ...prev, executorId: value, error: '' }))}
              options={[
                { value: GROUP_EXECUTOR_CLEAR_VALUE, label: 'Remover executor de todas' },
                ...profissionaisAgenda.map((profissional) => ({
                  value: String(profissional.id),
                  label: profissional.nome,
                })),
              ]}
              placeholder="Manter executores atuais"
              hint="Escolha um profissional para aplicar em todas as sessões ativas."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '', executorId: '', error: '' })}
            >
              Voltar
            </Button>
            <Button
              variant="primary"
              disabled={!reagendarDiretoDialog.novaData && !reagendarDiretoDialog.executorId}
              loading={grupoLoading === `${reagendarDiretoDialog.grupo.cliente_id}_${reagendarDiretoDialog.grupo.data_key}`}
              onClick={handleEditarGrupo}
            >
              Salvar alterações
            </Button>
          </div>
        </Modal>
      )}

      {/* Editar agendamento individual */}
      {editarAgendamentoDialog.isOpen && editarAgendamentoDialog.agendamento && (
        <Modal
          isOpen
          onClose={() => setEditarAgendamentoDialog({
            isOpen: false,
            agendamento: null,
            executorId: '',
            data: '',
            observacoes: '',
            salvando: false,
            error: '',
          })}
          title="Editar Agendamento"
          size="md"
        >
          {editarAgendamentoDialog.error && (
            <Alert
              type="error"
              dismissible
              onDismiss={() => setEditarAgendamentoDialog((prev) => ({ ...prev, error: '' }))}
            >
              {editarAgendamentoDialog.error}
            </Alert>
          )}

          <div className="mb-4 rounded-lg bg-surface-secondary px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{editarAgendamentoDialog.agendamento.cliente_nome}</p>
            <p className="text-muted-foreground">
              {editarAgendamentoDialog.agendamento.tipo === 'avaliacao' ? 'Avaliação' : editarAgendamentoDialog.agendamento.procedimento_nome}
              {editarAgendamentoDialog.agendamento.etapa_modelo_nome ? ` — ${editarAgendamentoDialog.agendamento.etapa_modelo_nome}` : ''}
            </p>
          </div>

          {isAdminOrAtendente ? (
            <Select
              label={editarAgendamentoDialog.agendamento.tipo === 'avaliacao' ? 'Avaliador (opcional)' : 'Executor (opcional)'}
              name="editar_agendamento_executor_id"
              value={editarAgendamentoDialog.executorId}
              onChange={(value) => setEditarAgendamentoDialog((prev) => ({ ...prev, executorId: value, error: '' }))}
              options={profissionaisAgenda.map((profissional) => ({
                value: String(profissional.id),
                label: profissional.nome,
              }))}
              placeholder={editarAgendamentoDialog.agendamento.tipo === 'avaliacao' ? 'Sem avaliador' : 'Sem executor'}
            />
          ) : null}

          <div className="mt-4">
            <Input
              label="Data e hora (opcional)"
              name="editar_agendamento_data_agendada"
              type="datetime-local"
              value={editarAgendamentoDialog.data}
              onChange={(value) => setEditarAgendamentoDialog((prev) => ({ ...prev, data: value, error: '' }))}
              hint="Deixe em branco para deixar o agendamento sem data."
            />
          </div>

          <div className="mt-4">
            <Textarea
              label="Observações (opcional)"
              name="editar_agendamento_observacoes"
              value={editarAgendamentoDialog.observacoes}
              onChange={(value) => setEditarAgendamentoDialog((prev) => ({ ...prev, observacoes: value, error: '' }))}
              placeholder="Observações..."
              rows={3}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setEditarAgendamentoDialog({
                isOpen: false,
                agendamento: null,
                executorId: '',
                data: '',
                observacoes: '',
                salvando: false,
                error: '',
              })}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSalvarEdicaoAgendamento}
              loading={editarAgendamentoDialog.salvando}
            >
              Salvar alterações
            </Button>
          </div>
        </Modal>
      )}

      {/* Cancelar agendamento */}
      {cancelarDialog.isOpen && cancelarDialog.grupo && (
        <Modal isOpen onClose={() => setCancelarDialog({ isOpen: false, grupo: null, motivo: '' })} title="Cancelar Agendamento">
          <p className="mb-4 text-sm text-muted-foreground">
            Cancelar todos os agendamentos ativos de <strong>{cancelarDialog.grupo.cliente_nome}</strong>?
          </p>
          <Textarea
            label="Motivo (opcional)"
            name="motivo_cancelamento"
            value={cancelarDialog.motivo}
            onChange={(v) => setCancelarDialog(prev => ({ ...prev, motivo: v }))}
            placeholder="Motivo do cancelamento..."
            rows={2}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setCancelarDialog({ isOpen: false, grupo: null, motivo: '' })}>
              Voltar
            </Button>
              <Button
              variant="primary"
              className="!bg-error-600 !text-error-50 hover:!bg-error-700"
              loading={grupoLoading === `${cancelarDialog.grupo.cliente_id}_${cancelarDialog.grupo.data_key}`}
              onClick={handleCancelar}
            >
              Confirmar Cancelamento
            </Button>
          </div>
        </Modal>
      )}

      {/* Trocar executor */}
      {executorDialog.isOpen && executorDialog.agendamento && (
        <Modal
          isOpen
          onClose={() => setExecutorDialog({ isOpen: false, agendamento: null, executorId: '' })}
          title={executorDialog.agendamento.tipo === 'avaliacao' ? 'Trocar Avaliador' : 'Trocar Executor'}
        >
          <p className="mb-4 text-sm text-muted-foreground">
            {executorDialog.agendamento.procedimento_nome}
            {executorDialog.agendamento.etapa_modelo_nome && ` — ${executorDialog.agendamento.etapa_modelo_nome}`}
          </p>
          <Select
            label={executorDialog.agendamento.tipo === 'avaliacao' ? 'Avaliador' : 'Executor'}
            name="executor_id"
            value={executorDialog.executorId}
            onChange={(v) => setExecutorDialog(prev => ({ ...prev, executorId: v }))}
            options={[
              { value: '', label: executorDialog.agendamento.tipo === 'avaliacao' ? 'Sem avaliador' : 'Sem executor' },
              ...profissionaisAgenda.map((profissional) => ({
                value: String(profissional.id),
                label: profissional.nome,
              })),
            ]}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setExecutorDialog({ isOpen: false, agendamento: null, executorId: '' })}>
              Voltar
            </Button>
            <Button variant="primary" onClick={handleTrocarExecutor}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      <ProntuarioDrawer
        clienteId={drawerClienteId}
        open={drawerClienteId !== null}
        onClose={() => setDrawerClienteId(null)}
      />

      {/* Novo agendamento */}
      <Modal isOpen={canManageAgenda && novoDialog} onClose={() => setNovoDialog(false)} title="Novo Agendamento" size="md">
        {novoError && <Alert type="error" dismissible onDismiss={() => setNovoError('')}>{novoError}</Alert>}

        {/* Busca e seleção de cliente */}
        {!novoClienteSelecionado ? (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Cliente</label>
            <input
              type="text"
              value={novoBuscaCliente}
              onChange={e => buscarClientes(e.target.value)}
              placeholder="Digite o nome do cliente..."
              className="field-control mb-2 w-full px-3 py-2 text-sm"
              autoFocus
            />
            {novoClientes.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {novoClientes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setNovoClienteSelecionado(c);
                      setNovoClientes([]);
                      setNovoProcId('');
                      limparVinculoProcedimentoPendente();
                    }}
                    className="w-full border-b border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-secondary last:border-0"
                  >
                    <span className="font-medium">{c.nome}</span>
                    {isAdminOrAtendente && c.telefone && (
                      <span className="ml-2 text-muted-foreground">{formatarTelefone(c.telefone)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {novoBuscaCliente.length >= 2 && novoClientes.length === 0 && (
              <p className="mt-1 text-sm text-muted-foreground">Nenhum cliente encontrado</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cliente selecionado */}
            <div className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2">
              <div>
                <span className="text-sm font-medium">{novoClienteSelecionado.nome}</span>
                {isAdminOrAtendente && novoClienteSelecionado.telefone && (
                  <span className="ml-2 text-xs text-muted-foreground">{formatarTelefone(novoClienteSelecionado.telefone)}</span>
                )}
              </div>
              <button
                onClick={() => {
                  setNovoClienteSelecionado(null);
                  setNovoBuscaCliente('');
                  setNovoProcId('');
                  limparVinculoProcedimentoPendente();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo: Avaliação ou Procedimento */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Tipo</label>
              <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                <button
                  onClick={() => {
                    setNovoTipo('avaliacao');
                    setNovoProcId('');
                    limparVinculoProcedimentoPendente();
                    setNovoExecId('');
                  }}
                className={`flex-1 px-4 py-2 font-medium transition-colors ${
                    novoTipo === 'avaliacao'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                  }`}
                >
                  Avaliação
                </button>
                <button
                  onClick={() => setNovoTipo('procedimento')}
                  className={`flex-1 px-4 py-2 font-medium transition-colors border-l border-border ${
                    novoTipo === 'procedimento'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-surface-secondary hover:text-foreground'
                  }`}
                >
                  Procedimento
                </button>
              </div>
            </div>

            {novoTipo === 'procedimento' && (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-foreground">
                      Procedimentos pendentes deste cliente
                    </label>
                    {novoPendentesLoading && (
                      <span className="text-xs text-muted-foreground">Carregando...</span>
                    )}
                  </div>

                  {novoProcedimentosPendentes.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-border p-2">
                      {novoProcedimentosPendentes.map((procedimento) => {
                        const selecionado = novoItemOrigemId === procedimento.item_id;
                        const valorPendente = procedimento.valor_pendente > 0
                          ? `Pendente ${formatarMoeda(procedimento.valor_pendente)}`
                          : 'Sem saldo pendente';
                        const contextoOrigem = procedimento.motivo_saida === 'continuacao'
                          ? 'Continuação'
                          : 'Atendimento aberto';

                        return (
                          <button
                            key={procedimento.item_id}
                            type="button"
                            aria-pressed={selecionado}
                            onClick={() => handleSelecionarProcedimentoPendente(procedimento)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            selecionado
                                ? 'border-primary/40 bg-primary/12 text-primary dark:border-primary dark:bg-primary/30 dark:text-primary-100'
                                : 'border-border bg-card text-foreground hover:bg-surface-secondary'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">
                                {procedimento.procedimento_nome}
                                {procedimento.etapa_label ? ` — ${procedimento.etapa_label}` : ''}
                              </span>
                              {selecionado && (
                                <span className="text-xs font-semibold uppercase tracking-wide">Selecionado</span>
                              )}
                            </div>
                            <p className={`mt-1 text-xs ${selecionado ? 'text-primary' : 'text-muted-foreground'}`}>
                              {contextoOrigem} de {formatarData(procedimento.atendimento_created_at)} · {valorPendente}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    !novoPendentesLoading && (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                        Nenhum procedimento pendente sugerido para este cliente.
                      </p>
                    )
                  )}
                </div>

                {novoItemOrigemId && (
                  <div className="rounded-lg border border-primary/40 bg-primary/12 px-3 py-2 text-sm text-primary dark:border-primary dark:bg-primary/25 dark:text-primary-100">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        Procedimento pendente vinculado ao agendamento
                        {novoEtapaLabel ? ` · ${novoEtapaLabel}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={limparVinculoProcedimentoPendente}
                        className="text-xs font-medium text-primary hover:text-primary/80"
                      >
                        Desvincular
                      </button>
                    </div>
                  </div>
                )}

                {novoEtapaModeloId && !novoItemOrigemId && (
                  <div className="rounded-lg border border-warning/40 bg-warning/12 px-3 py-2 text-sm text-warning dark:border-warning/65 dark:bg-warning/20 dark:text-warning-100">
                    Etapa pré-selecionada: {novoEtapaLabel || `#${novoEtapaModeloId}`}
                  </div>
                )}

                <SearchableSelect
                  label="Procedimento"
                  name="procedimento_id"
                  value={novoProcId}
                  onChange={handleSelecionarProcedimentoCatalogo}
                  options={novoProcedimentos.map((procedimento) => ({
                    value: String(procedimento.id),
                    label: procedimento.nome,
                  }))}
                  placeholder="Selecione..."
                  searchPlaceholder="Buscar procedimento..."
                  emptyMessage="Nenhum procedimento encontrado"
                  hint={novoItemOrigemId ? 'Alterar aqui transforma o agendamento em procedimento avulso.' : undefined}
                />
              </div>
            )}

            {isAdminOrAtendente ? (
              <Select
                label={novoTipo === 'avaliacao' ? 'Avaliador (opcional)' : 'Executor (opcional)'}
                name="executor_id"
                value={novoExecId}
                onChange={setNovoExecId}
                options={[
                  { value: '', label: novoTipo === 'avaliacao' ? 'Sem avaliador' : 'Sem executor' },
                  ...profissionaisAgenda.map((profissional) => ({
                    value: String(profissional.id),
                    label: profissional.nome,
                  })),
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {novoTipo === 'avaliacao' ? 'Avaliador' : 'Executor'}: <strong>{user?.nome}</strong>
              </p>
            )}

            <Input
              label="Data e hora (opcional)"
              name="data_agendada"
              type="datetime-local"
              value={novoData}
              onChange={setNovoData}
              min={getDateTimeLocalMinValue()}
            />

            <Textarea
              label="Observações (opcional)"
              name="observacoes"
              value={novoObs}
              onChange={setNovoObs}
              placeholder="Observações..."
              rows={2}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setNovoDialog(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleCriarAgendamento}
                loading={novoSalvando}
                disabled={novoTipo === 'procedimento' && !novoProcId}
              >
                Criar Agendamento
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
