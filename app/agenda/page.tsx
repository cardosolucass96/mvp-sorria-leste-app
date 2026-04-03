'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, UserCheck, UserX, MessageCircle, CalendarClock, X, RefreshCw, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LoadingState from '@/components/ui/LoadingState';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { StatusBadge } from '@/components/domain';
import { useToast } from '@/components/ui/Toast';
import { formatarDataAgendada, formatarTelefone } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
import { apiFetch } from '@/lib/utils/apiFetch';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useAuth } from '@/contexts/AuthContext';

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

interface GrupoCliente {
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  data_key: string;
  agendamentos: Agendamento[];
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

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AgendaPage() {
  usePageTitle('Agenda');
  const router = useRouter();
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const unitFetch = useUnitFetch();

  // Avaliador/executor só vê seus próprios agendamentos
  const isDentista = hasRole(['avaliador', 'executor']);
  const isAdminOrAtendente = hasRole(['admin', 'atendente']);

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('pendente,agendado,faltou,realizado');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [filtroRapido, setFiltroRapido] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Loading por grupo (clienteId_dataKey)
  const [grupoLoading, setGrupoLoading] = useState<string | null>(null);

  // Executores (para trocar executor)
  const [executores, setExecutores] = useState<Usuario[]>([]);

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

  // Dialog de reagendar direto (sem faltou)
  const [reagendarDiretoDialog, setReagendarDiretoDialog] = useState<{
    isOpen: boolean;
    grupo: GrupoCliente | null;
    novaData: string;
  }>({ isOpen: false, grupo: null, novaData: '' });

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

  // Modal novo agendamento
  const [novoDialog, setNovoDialog] = useState(false);
  const [novoBuscaCliente, setNovoBuscaCliente] = useState('');
  const [novoClientes, setNovoClientes] = useState<ClienteBusca[]>([]);
  const [novoClienteSelecionado, setNovoClienteSelecionado] = useState<ClienteBusca | null>(null);
  const [novoTipo, setNovoTipo] = useState<'avaliacao' | 'procedimento'>('avaliacao');
  const [novoProcedimentos, setNovoProcedimentos] = useState<Procedimento[]>([]);
  const [novoProcId, setNovoProcId] = useState('');
  const [novoExecId, setNovoExecId] = useState('');
  const [novoData, setNovoData] = useState('');
  const [novoObs, setNovoObs] = useState('');
  const [novoSalvando, setNovoSalvando] = useState(false);
  const [novoError, setNovoError] = useState('');

  const carregarAgendamentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.append('status', filtroStatus);
      if (busca) params.append('busca', busca);
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);
      params.append('page', String(page));
      params.append('limit', String(LIMIT));
      params.append('order_by', 'cliente_nome');
      params.append('order_dir', 'asc');

      // Avaliador/executor: filtrar só seus agendamentos
      if (isDentista && user) {
        params.append('executor_id', String(user.id));
      }

      const res = await unitFetch(`/api/agendamentos?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao carregar agendamentos');
        return;
      }
      setAgendamentos(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      setError('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, busca, dataInicio, dataFim, page, isDentista, user, unitFetch]);

  useEffect(() => {
    carregarAgendamentos();
  }, [carregarAgendamentos]);

  const carregarExecutores = async () => {
    if (executores.length > 0) return;
    try {
      const res = await apiFetch('/api/usuarios');
      const data: Usuario[] = await res.json();
      setExecutores(data.filter(u => u.role === 'executor' || u.role === 'admin'));
    } catch {}
  };

  // ─── Novo agendamento ─────────────────────────────────────────

  const abrirNovoAgendamento = async () => {
    setNovoDialog(true);
    setNovoError('');
    setNovoClienteSelecionado(null);
    setNovoBuscaCliente('');
    setNovoClientes([]);
    setNovoTipo('avaliacao');
    setNovoProcId('');
    setNovoExecId('');
    setNovoData('');
    setNovoObs('');
    // Carrega procedimentos e executores
    if (novoProcedimentos.length === 0) {
      try {
        const res = await apiFetch('/api/procedimentos');
        setNovoProcedimentos(await res.json());
      } catch {}
    }
    carregarExecutores();
  };

  const buscarClientes = async (termo: string) => {
    setNovoBuscaCliente(termo);
    if (termo.length < 2) { setNovoClientes([]); return; }
    try {
      const res = await apiFetch(`/api/clientes?busca=${encodeURIComponent(termo)}&limit=8`);
      const data = await res.json();
      setNovoClientes(data.clientes ?? []);
    } catch {}
  };

  const handleCriarAgendamento = async () => {
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
      }
      body.executor_id = novoExecId ? parseInt(novoExecId) : null;
      const res = await unitFetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
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

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    if (page !== 1) setPage(1);
    else carregarAgendamentos();
  };

  // ─── Filtros rápidos ─────────────────────────────────────────

  const aplicarFiltroRapido = (tipo: string) => {
    const hoje = new Date();
    switch (tipo) {
      case 'hoje':
        setDataInicio(formatDate(hoje));
        setDataFim(formatDate(hoje));
        break;
      case 'amanha': {
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        setDataInicio(formatDate(amanha));
        setDataFim(formatDate(amanha));
        break;
      }
      case 'semana': {
        const fimSemana = new Date(hoje);
        fimSemana.setDate(fimSemana.getDate() + (7 - fimSemana.getDay()));
        setDataInicio(formatDate(hoje));
        setDataFim(formatDate(fimSemana));
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
      const dataKey = ag.data_agendada ? ag.data_agendada.slice(0, 10) : 'sem-data';
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
      const data = await res.json();

      if (res.status === 201) {
        if (data.agendamentos_agrupados > 1) {
          toast.success(`${data.agendamentos_agrupados} procedimentos agrupados em 1 atendimento`);
        }
        if (isAdminOrAtendente) {
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

  const handleReagendarDireto = async () => {
    const { grupo, novaData } = reagendarDiretoDialog;
    if (!grupo || !novaData) return;

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
            body: JSON.stringify({ data_agendada: novaData }),
          })
        )
      );
      toast.success('Reagendado com sucesso');
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao reagendar');
    } finally {
      setGrupoLoading(null);
      setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '' });
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
        const data = await res.json();
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
      ag => ag.status === 'pendente' || ag.status === 'agendado'
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-light bg-surface-raised flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{grupo.cliente_nome}</span>
            {grupo.cliente_telefone && (
              <span className="text-sm text-muted">{formatarTelefone(grupo.cliente_telefone)}</span>
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
            {isAdminOrAtendente && grupo.cliente_telefone && (
              <a
                href={gerarLinkWhatsApp(grupo)}
                target="_blank"
                rel="noopener noreferrer"
                title="Lembrete WhatsApp"
                className="inline-flex items-center justify-center p-1.5 rounded text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}
            {temAtivo && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCancelarDialog({ isOpen: true, grupo, motivo: '' })}
                  disabled={isLoading}
                  className="!text-error-500 hover:!bg-error-50"
                  title="Cancelar agendamento(s)"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancelar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReagendarDiretoDialog({ isOpen: true, grupo, novaData: '' })}
                  disabled={isLoading}
                  title="Alterar data do agendamento"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Reagendar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleFaltouReagendar(grupo)}
                  disabled={isLoading}
                  className="!text-warning-700 !border-warning-300 hover:!bg-warning-50"
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
                  className="!text-warning-700 !border-warning-300 hover:!bg-warning-50"
                >
                  <UserX className="w-3.5 h-3.5 mr-1" />
                  Faltou
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleChegou(grupo)}
                  loading={isLoading}
                  className="!bg-success-600 hover:!bg-success-700 !text-white"
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                  Chegou
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Lista de procedimentos */}
        <div className="divide-y divide-border-light">
          {grupo.agendamentos.map((ag) => {
            const podTrocar = isAdminOrAtendente && (ag.status === 'pendente' || ag.status === 'agendado');
            return (
              <div key={ag.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">
                    {ag.procedimento_nome}
                    {ag.etapa_modelo_nome && (
                      <span className="text-muted ml-1">— {ag.etapa_modelo_nome}</span>
                    )}
                  </span>
                  {(() => {
                    const roleLabel = ag.tipo === 'avaliacao' ? 'Avaliador' : 'Executor';
                    if (ag.executor_nome) {
                      return podTrocar ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); carregarExecutores(); setExecutorDialog({ isOpen: true, agendamento: ag, executorId: String(ag.executor_id ?? '') }); }}
                          className="block text-xs text-muted hover:text-primary-600 hover:underline transition-colors"
                          title={`Clique para trocar ${roleLabel.toLowerCase()}`}
                        >
                          {roleLabel}: {ag.executor_nome}
                        </button>
                      ) : (
                        <span className="block text-xs text-muted">{roleLabel}: {ag.executor_nome}</span>
                      );
                    }
                    return podTrocar ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); carregarExecutores(); setExecutorDialog({ isOpen: true, agendamento: ag, executorId: '' }); }}
                        className="block text-xs text-muted italic hover:text-primary-600 hover:underline transition-colors"
                        title={`Clique para definir ${roleLabel.toLowerCase()}`}
                      >
                        Sem {roleLabel.toLowerCase()}
                      </button>
                    ) : null;
                  })()}
                </div>
                {ag.tipo !== 'avaliacao' && (
                  ag.pago ? <Badge color="green" size="sm">Pago</Badge> : <Badge color="gray" size="sm">A pagar</Badge>
                )}
                {ag.status !== 'realizado' && (
                  <StatusBadge type="agendamento" status={ag.status} size="sm" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title={isDentista ? 'Minha Agenda' : 'Agenda'}
        icon={<Calendar className="w-7 h-7" />}
        description={isDentista ? `Seus agendamentos, ${user?.nome}` : 'Gestão de retornos agendados'}
        actions={
          <Button onClick={abrirNovoAgendamento}>
            <Plus className="w-4 h-4 mr-1" />
            Novo Agendamento
          </Button>
        }
      />

      {/* Filtros */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar cliente"
              name="busca"
              value={busca}
              onChange={setBusca}
              placeholder="Nome do cliente..."
            />
          </div>
          <div className="min-w-[220px]">
            <Select
              label="Status"
              name="filtroStatus"
              value={filtroStatus}
              onChange={setFiltroStatus}
              options={STATUS_OPTIONS}
              placeholder="Todos"
            />
          </div>
          <div className="min-w-[160px]">
            <Input label="Data início" name="dataInicio" type="date" value={dataInicio} onChange={(v) => { setDataInicio(v); setFiltroRapido(null); }} />
          </div>
          <div className="min-w-[160px]">
            <Input label="Data fim" name="dataFim" type="date" value={dataFim} onChange={(v) => { setDataFim(v); setFiltroRapido(null); }} />
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>

        {/* Filtros rápidos */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-border-light">
          {FILTROS_RAPIDOS.map(f => (
            <button
              key={f.id}
              onClick={() => aplicarFiltroRapido(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtroRapido === f.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-secondary text-muted hover:text-foreground hover:bg-neutral-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-muted">
        {total > 0 ? `${agrupados.length} cliente(s) · ${total} agendamento(s)` : 'Nenhum resultado'}
      </div>

      {agendamentos.length === 0 ? (
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
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
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
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Página {page} de {pages} · {total} registros</span>
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
                    n === page ? 'bg-primary text-white' : 'border border-border-light text-muted hover:text-foreground'
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
          <p className="text-sm text-muted mb-1">
            <strong>{reagendarDialog.grupo.cliente_nome}</strong>
          </p>
          <p className="text-sm text-muted mb-4">
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
              min={new Date().toISOString().slice(0, 16)}
              value={reagendarDialog.novaData}
              onChange={e => setReagendarDialog(prev => ({ ...prev, novaData: e.target.value }))}
              className="w-full border border-border-light rounded-lg px-3 py-2 text-sm"
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

      {/* Reagendar direto (sem faltou) */}
      {reagendarDiretoDialog.isOpen && reagendarDiretoDialog.grupo && (
        <Modal isOpen onClose={() => setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '' })} title="Reagendar">
          <p className="text-sm text-muted mb-4">
            Alterar a data de agendamento de <strong>{reagendarDiretoDialog.grupo.cliente_nome}</strong>:
          </p>
          <ul className="mb-4 space-y-1">
            {reagendarDiretoDialog.grupo.agendamentos
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
              min={new Date().toISOString().slice(0, 16)}
              value={reagendarDiretoDialog.novaData}
              onChange={e => setReagendarDiretoDialog(prev => ({ ...prev, novaData: e.target.value }))}
              className="w-full border border-border-light rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReagendarDiretoDialog({ isOpen: false, grupo: null, novaData: '' })}>
              Voltar
            </Button>
            <Button
              variant="primary"
              disabled={!reagendarDiretoDialog.novaData}
              loading={grupoLoading === `${reagendarDiretoDialog.grupo.cliente_id}_${reagendarDiretoDialog.grupo.data_key}`}
              onClick={handleReagendarDireto}
            >
              Reagendar
            </Button>
          </div>
        </Modal>
      )}

      {/* Cancelar agendamento */}
      {cancelarDialog.isOpen && cancelarDialog.grupo && (
        <Modal isOpen onClose={() => setCancelarDialog({ isOpen: false, grupo: null, motivo: '' })} title="Cancelar Agendamento">
          <p className="text-sm text-muted mb-4">
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
              className="!bg-error-600 hover:!bg-error-700"
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
        <Modal isOpen onClose={() => setExecutorDialog({ isOpen: false, agendamento: null, executorId: '' })} title="Trocar Executor">
          <p className="text-sm text-muted mb-4">
            {executorDialog.agendamento.procedimento_nome}
            {executorDialog.agendamento.etapa_modelo_nome && ` — ${executorDialog.agendamento.etapa_modelo_nome}`}
          </p>
          <Select
            label="Executor"
            name="executor_id"
            value={executorDialog.executorId}
            onChange={(v) => setExecutorDialog(prev => ({ ...prev, executorId: v }))}
            options={[
              { value: '', label: 'Sem executor' },
              ...executores.map(ex => ({ value: String(ex.id), label: ex.nome })),
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

      {/* Novo agendamento */}
      <Modal isOpen={novoDialog} onClose={() => setNovoDialog(false)} title="Novo Agendamento" size="md">
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
              className="w-full border border-border-light rounded-lg px-3 py-2 text-sm mb-2"
              autoFocus
            />
            {novoClientes.length > 0 && (
              <div className="border border-border-light rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {novoClientes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setNovoClienteSelecionado(c); setNovoClientes([]); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary transition-colors border-b border-border-light last:border-0"
                  >
                    <span className="font-medium">{c.nome}</span>
                    {c.telefone && <span className="text-muted ml-2">{formatarTelefone(c.telefone)}</span>}
                  </button>
                ))}
              </div>
            )}
            {novoBuscaCliente.length >= 2 && novoClientes.length === 0 && (
              <p className="text-sm text-muted mt-1">Nenhum cliente encontrado</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cliente selecionado */}
            <div className="flex items-center justify-between bg-surface-secondary rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-medium">{novoClienteSelecionado.nome}</span>
                {novoClienteSelecionado.telefone && (
                  <span className="text-xs text-muted ml-2">{formatarTelefone(novoClienteSelecionado.telefone)}</span>
                )}
              </div>
              <button
                onClick={() => { setNovoClienteSelecionado(null); setNovoBuscaCliente(''); }}
                className="text-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo: Avaliação ou Procedimento */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Tipo</label>
              <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                <button
                  onClick={() => { setNovoTipo('avaliacao'); setNovoProcId(''); setNovoExecId(''); }}
                  className={`flex-1 px-4 py-2 font-medium transition-colors ${
                    novoTipo === 'avaliacao'
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface text-muted hover:bg-surface-secondary'
                  }`}
                >
                  Avaliação
                </button>
                <button
                  onClick={() => setNovoTipo('procedimento')}
                  className={`flex-1 px-4 py-2 font-medium transition-colors border-l border-border ${
                    novoTipo === 'procedimento'
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface text-muted hover:bg-surface-secondary'
                  }`}
                >
                  Procedimento
                </button>
              </div>
            </div>

            {novoTipo === 'procedimento' && (
              <Select
                label="Procedimento"
                name="procedimento_id"
                value={novoProcId}
                onChange={setNovoProcId}
                options={novoProcedimentos.map(p => ({ value: String(p.id), label: p.nome }))}
                placeholder="Selecione..."
              />
            )}

            {isAdminOrAtendente ? (
              <Select
                label={novoTipo === 'avaliacao' ? 'Avaliador (opcional)' : 'Executor (opcional)'}
                name="executor_id"
                value={novoExecId}
                onChange={setNovoExecId}
                options={[
                  { value: '', label: novoTipo === 'avaliacao' ? 'Sem avaliador' : 'Sem executor' },
                  ...executores.map(ex => ({ value: String(ex.id), label: ex.nome })),
                ]}
              />
            ) : (
              <p className="text-sm text-muted">
                {novoTipo === 'avaliacao' ? 'Avaliador' : 'Executor'}: <strong>{user?.nome}</strong>
              </p>
            )}

            <Input
              label="Data e hora (opcional)"
              name="data_agendada"
              type="datetime-local"
              value={novoData}
              onChange={setNovoData}
              min={new Date().toISOString().slice(0, 16)}
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
