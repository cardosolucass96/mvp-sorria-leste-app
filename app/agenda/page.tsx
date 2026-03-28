'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, UserCheck, UserX, CalendarPlus, X, Check } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import LoadingState from '@/components/ui/LoadingState';
import Alert from '@/components/ui/Alert';
import Table, { TableColumn } from '@/components/ui/Table';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/domain';
import { useToast } from '@/components/ui/Toast';
import { formatarData, formatarTelefone } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Agendamento {
  id: number;
  cliente_id: number;
  procedimento_id: number;
  data_agendada: string | null;
  status: string;
  motivo_cancelamento: string | null;
  observacoes: string | null;
  created_at: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
  dias_desde_criacao: number;
}

const STATUS_OPTIONS = [
  { value: 'pendente,agendado,faltou', label: 'Ativos (Pendente, Agendado, Faltou)' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'faltou', label: 'Faltou' },
  { value: 'realizado', label: 'Realizado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: '', label: 'Todos' },
];

export default function AgendaPage() {
  usePageTitle('Agenda');
  const router = useRouter();
  const { toast } = useToast();

  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('pendente,agendado,faltou');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Inline reschedule
  const [reagendandoId, setReagendandoId] = useState<number | null>(null);
  const [novaData, setNovaData] = useState('');

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Cancel dialog with reason
  const [cancelDialog, setCancelDialog] = useState<{
    isOpen: boolean;
    agendamentoId: number | null;
    nome: string;
    motivo: string;
  }>({ isOpen: false, agendamentoId: null, nome: '', motivo: '' });

  // Action loading states
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const carregarAgendamentos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.append('status', filtroStatus);
      if (busca) params.append('busca', busca);
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);

      const res = await fetch(`/api/agendamentos?${params}`);
      const data = await res.json();
      setAgendamentos(data);
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      setError('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, busca, dataInicio, dataFim]);

  useEffect(() => {
    carregarAgendamentos();
  }, [carregarAgendamentos]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    carregarAgendamentos();
  };

  // ─── Actions ─────────────────────────────────────────────────

  const handleChegou = async (agendamento: Agendamento) => {
    setActionLoading(agendamento.id);
    try {
      const res = await fetch(`/api/agendamentos/${agendamento.id}/chegou`, {
        method: 'POST',
      });

      if (res.status === 201) {
        const data = await res.json();
        router.push(`/atendimentos/${data.id}`);
        return;
      }

      if (res.status === 409) {
        const data = await res.json();
        toast.warning(
          `Este cliente já tem atendimento aberto hoje. Ver atendimento #${data.atendimento_existente_id}`,
          8000
        );
        return;
      }

      const data = await res.json();
      toast.error(data.error || 'Erro ao registrar chegada');
    } catch {
      toast.error('Erro ao registrar chegada');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFaltou = (agendamento: Agendamento) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Confirmar falta',
      message: `Confirmar que ${agendamento.cliente_nome} não compareceu?`,
      type: 'warning',
      confirmLabel: 'Confirmar Falta',
      onConfirm: async () => {
        setActionLoading(agendamento.id);
        try {
          const res = await fetch(`/api/agendamentos/${agendamento.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'faltou' }),
          });

          if (!res.ok) {
            const data = await res.json();
            toast.error(data.error || 'Erro ao marcar falta');
            return;
          }

          toast.success('Falta registrada');
          carregarAgendamentos();
        } catch {
          toast.error('Erro ao marcar falta');
        } finally {
          setActionLoading(null);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleReagendar = async (agendamentoId: number) => {
    if (!novaData) return;
    setActionLoading(agendamentoId);
    try {
      const res = await fetch(`/api/agendamentos/${agendamentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_agendada: novaData }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Erro ao reagendar');
        return;
      }

      toast.success('Reagendado com sucesso');
      setReagendandoId(null);
      setNovaData('');
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao reagendar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelar = (agendamento: Agendamento) => {
    setCancelDialog({
      isOpen: true,
      agendamentoId: agendamento.id,
      nome: agendamento.cliente_nome,
      motivo: '',
    });
  };

  const confirmarCancelamento = async () => {
    if (!cancelDialog.agendamentoId) return;
    setActionLoading(cancelDialog.agendamentoId);
    try {
      const res = await fetch(`/api/agendamentos/${cancelDialog.agendamentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelado',
          motivo_cancelamento: cancelDialog.motivo || 'Cancelado pela agenda',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Erro ao cancelar');
        return;
      }

      toast.success('Agendamento cancelado');
      setCancelDialog({ isOpen: false, agendamentoId: null, nome: '', motivo: '' });
      carregarAgendamentos();
    } catch {
      toast.error('Erro ao cancelar agendamento');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Table Columns ────────────────────────────────────────────

  const columns: TableColumn<Agendamento>[] = [
    {
      key: 'cliente',
      label: 'Cliente',
      render: (ag) => (
        <div>
          <div className="font-medium text-foreground">{ag.cliente_nome}</div>
          {ag.cliente_telefone && (
            <div className="text-sm text-muted">{formatarTelefone(ag.cliente_telefone)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'procedimento',
      label: 'Procedimento',
      render: (ag) => ag.procedimento_nome || <span className="text-muted">-</span>,
    },
    {
      key: 'data_agendada',
      label: 'Data Agendada',
      render: (ag) =>
        ag.data_agendada ? (
          formatarData(ag.data_agendada)
        ) : (
          <Badge color="gray" size="sm">Sem data</Badge>
        ),
    },
    {
      key: 'dias_desde_criacao',
      label: 'Criado há',
      render: (ag) => (
        <span className="text-muted">
          {ag.dias_desde_criacao === 0 ? 'Hoje' : `${ag.dias_desde_criacao} dia${ag.dias_desde_criacao !== 1 ? 's' : ''}`}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (ag) => <StatusBadge type="agendamento" status={ag.status} size="sm" />,
    },
    {
      key: 'acoes',
      label: 'Ações',
      align: 'right',
      render: (ag) => {
        const isLoading = actionLoading === ag.id;
        const canChegar = ['pendente', 'agendado'].includes(ag.status);
        const canFaltar = ['pendente', 'agendado'].includes(ag.status);
        const canReagendar = ag.status !== 'cancelado';
        const canCancelar = !['cancelado', 'realizado'].includes(ag.status);

        if (reagendandoId === ag.id) {
          return (
            <div className="flex items-center gap-1 justify-end">
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="text-sm border border-border-light rounded px-2 py-1"
              />
              <button
                onClick={() => handleReagendar(ag.id)}
                disabled={!novaData || isLoading}
                className="p-1 text-success-600 hover:text-success-800 disabled:opacity-50"
                title="Confirmar"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setReagendandoId(null); setNovaData(''); }}
                className="p-1 text-neutral-500 hover:text-neutral-700"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1 justify-end flex-wrap">
            {canChegar && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleChegou(ag)}
                loading={isLoading}
                className="!bg-success-600 hover:!bg-success-700 !text-white"
              >
                <UserCheck className="w-3.5 h-3.5 mr-1" />
                Chegou
              </Button>
            )}
            {canFaltar && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleFaltou(ag)}
                disabled={isLoading}
                className="!text-warning-700 !border-warning-300 hover:!bg-warning-50"
              >
                <UserX className="w-3.5 h-3.5 mr-1" />
                Faltou
              </Button>
            )}
            {canReagendar && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setReagendandoId(ag.id); setNovaData(ag.data_agendada || ''); }}
                disabled={isLoading}
                className="!text-info-700 !border-info-300 hover:!bg-info-50"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
              </Button>
            )}
            {canCancelar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCancelar(ag)}
                disabled={isLoading}
                className="!text-error-600 hover:!bg-error-50"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title="Agenda"
        icon={<Calendar className="w-7 h-7" />}
        description="Gestão de retornos agendados"
      />

      {/* Filters */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar cliente"
              name="busca"
              value={busca}
              onChange={(value) => setBusca(value)}
              placeholder="Nome do cliente..."
            />
          </div>
          <div className="min-w-[220px]">
            <Select
              label="Status"
              name="filtroStatus"
              value={filtroStatus}
              onChange={(value) => setFiltroStatus(value)}
              options={STATUS_OPTIONS}
              placeholder="Todos"
            />
          </div>
          <div className="min-w-[160px]">
            <Input
              label="Data início"
              name="dataInicio"
              type="date"
              value={dataInicio}
              onChange={(value) => setDataInicio(value)}
            />
          </div>
          <div className="min-w-[160px]">
            <Input
              label="Data fim"
              name="dataFim"
              type="date"
              value={dataFim}
              onChange={(value) => setDataFim(value)}
            />
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </div>

      {/* Table */}
      {agendamentos.length === 0 && !loading ? (
        <EmptyState
          title="Nenhum agendamento encontrado"
          description="Não há agendamentos que correspondam aos filtros selecionados."
        />
      ) : (
        <Table
          columns={columns}
          data={agendamentos}
          keyExtractor={(ag) => ag.id}
          emptyMessage="Nenhum agendamento encontrado"
          caption="Agendamentos"
        />
      )}

      <div className="text-sm text-muted">
        Total: {agendamentos.length} agendamento(s)
      </div>

      {/* Confirm Dialog (Faltou) */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel={confirmDialog.confirmLabel}
      />

      {/* Cancel Dialog with reason */}
      {cancelDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Cancelar Agendamento
            </h3>
            <p className="text-sm text-muted mb-4">
              Confirmar cancelamento do agendamento de <strong>{cancelDialog.nome}</strong>?
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-1">
                Motivo (opcional)
              </label>
              <textarea
                value={cancelDialog.motivo}
                onChange={(e) => setCancelDialog(prev => ({ ...prev, motivo: e.target.value }))}
                className="w-full border border-border-light rounded-lg px-3 py-2 text-sm resize-none"
                rows={3}
                placeholder="Informe o motivo do cancelamento..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCancelDialog({ isOpen: false, agendamentoId: null, nome: '', motivo: '' })}
              >
                Voltar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarCancelamento}
                loading={actionLoading === cancelDialog.agendamentoId}
              >
                Cancelar Agendamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
