'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora, tempoDecorrido, nomeProcedimentoItem, formatarDenteUnicoComFaces } from '@/lib/utils/formatters';
import { STATUS_CONFIG, PROXIMOS_STATUS, STATUS_ANTERIOR } from '@/lib/constants/status';
import type { AtendimentoStatus, AtendimentoTipo } from '@/lib/types';
import { StatusBadge, StatusPipeline } from '@/components/domain';
import { ClipboardList, ChevronDown, ChevronRight, X, Trash2, CalendarPlus, Info, Printer } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Button, Card, EmptyState, ConfirmDialog, Modal, Select, Input, Textarea, useToast } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  por_dente: number;
  tem_face: number;
  tem_etapas: number;
}

interface Usuario {
  id: number;
  nome: string;
  role: string;
}

const METODOS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
];

interface ProgressoEtapa {
  nome: string;
  status: string;
}

interface ItemAtendimento {
  id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_id: number | null;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dentes?: string | null;
  dente_unico: string | null;
  progresso_etapas: ProgressoEtapa[] | null;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  avaliador_id: number | null;
  avaliador_nome: string | null;
  liberado_por_nome: string | null;
  status: string;
  tipo: string | null;
  categoria_id: number | null;
  created_at: string;
  liberado_em: string | null;
  finalizado_at: string | null;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

const METODOS_PAGAMENTO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

interface PagamentoForma {
  id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
}

interface PagamentoAgrupado {
  id: string;
  valor_total: number;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  formas: PagamentoForma[];
}

function ProgressoEtapas({ etapas }: { etapas: ProgressoEtapa[] }) {
  const concluidas = etapas.filter(e => e.status === 'concluido').length;
  return (
    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
      {etapas.map((etapa, i) => (
        <span
          key={i}
          className={`text-xs px-1.5 py-0.5 rounded ${
            etapa.status === 'concluido'
              ? 'bg-success-100 text-success-700'
              : 'bg-neutral-100 text-neutral-400'
          }`}
          title={`${etapa.nome}: ${etapa.status === 'concluido' ? 'Concluída' : 'Pendente'}`}
        >
          {etapa.nome}
        </span>
      ))}
      <span className="text-xs text-muted ml-0.5">{concluidas}/{etapas.length}</span>
    </div>
  );
}

export default function AtendimentoDetalhePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  usePageTitle('Detalhes do Atendimento');
  const { id } = use(params);
  const router = useRouter();
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const unitFetch = useUnitFetch();
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [imprimindoAtendimento, setImprimindoAtendimento] = useState(false);

  const escapeHtml = (value: unknown) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const parseSafeNumber = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

  const getMetodoPagamentoLabel = (metodo: string) => METODOS_PAGAMENTO_LABEL[metodo] || metodo;

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };
  // Modal adicionar procedimento
  const [modalProcedimento, setModalProcedimento] = useState(false);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loadingDadosProc, setLoadingDadosProc] = useState(false);
  const [procId, setProcId] = useState('');
  const [execId, setExecId] = useState('');
  const [valorCustom, setValorCustom] = useState('');
  const [dentesFaces, setDentesFaces] = useState<DenteFaceInput[]>([]);
  const [adicionando, setAdicionando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Modal ficha do cliente
  const [modalCliente, setModalCliente] = useState(false);
  const [dadosCliente, setDadosCliente] = useState<Record<string, string | null> | null>(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // Modal pagamento
  const [modalPagamento, setModalPagamento] = useState(false);
  const [valorPagamento, setValorPagamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [itensPagamento, setItensPagamento] = useState<{ [key: number]: number }>({});
  const [registrando, setRegistrando] = useState(false);
  const [errorPagamento, setErrorPagamento] = useState('');

  // Modal agendar próxima sessão
  const [modalAgendamento, setModalAgendamento] = useState(false);
  const [agProcId, setAgProcId] = useState('');
  const [agExecId, setAgExecId] = useState('');
  const [agData, setAgData] = useState('');
  const [agObs, setAgObs] = useState('');
  const [agSalvando, setAgSalvando] = useState(false);
  const [agError, setAgError] = useState('');

  // Trocar executor
  const [trocandoExecutor, setTrocandoExecutor] = useState<number | null>(null);

  const carregarExecutores = async () => {
    if (executores.length > 0) return;
    try {
      const catId = atendimento?.categoria_id;
      const url = catId ? `/api/usuarios?categoria_id=${catId}` : '/api/usuarios';
      const res = await fetch(url);
      const data: Usuario[] = await res.json();
      setExecutores((catId ? data : data).filter((u: Usuario & { roles?: string[] }) => {
        const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
        return roles.includes('executor') || roles.includes('ortodontista');
      }));
    } catch {}
  };

  const handleTrocarExecutor = async (itemId: number, novoExecutorId: number | null) => {
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executor_id: novoExecutorId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Erro ao trocar executor');
        return;
      }
      toast.success('Executor alterado com sucesso');
      await carregarAtendimento();
    } catch {
      toast.error('Erro ao trocar executor');
    } finally {
      setTrocandoExecutor(null);
    }
  };

  // Estado para grupos expandidos
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());

  const toggleGrupo = (groupId: string) => {
    setGruposExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const carregarAtendimento = useCallback(async () => {
    try {
      const res = await unitFetch(`/api/atendimentos/${id}`);
      if (!res.ok) {
        throw new Error('Atendimento não encontrado');
      }
      const data = await res.json();
      setAtendimento(data);
    } catch (error) {
      setError('Erro ao carregar atendimento');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [id, unitFetch]);

  useEffect(() => {
    carregarAtendimento();
  }, [carregarAtendimento]);

  const handleMudarStatus = async (novoStatus: string) => {
    if (!atendimento) return;
    
    setMudandoStatus(true);
    setError('');
    
    try {
      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao mudar status');
      }
      
      await carregarAtendimento();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao mudar status');
    } finally {
      setMudandoStatus(false);
    }
  };

  const handleArquivar = () => {
    if (!atendimento) return;
    openConfirm({
      title: 'Arquivar Atendimento',
      message: `Arquivar o atendimento #${atendimento.id} de ${atendimento.cliente_nome}? O histórico será preservado e ele sairá do fluxo ativo.`,
      confirmLabel: 'Arquivar',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await unitFetch(`/api/atendimentos/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao arquivar'); return; }
          router.push('/atendimentos');
        } catch {
          setError('Erro ao arquivar atendimento');
        }
      },
    });
  };

  const abrirModalProcedimento = async () => {
    setModalProcedimento(true);
    if (procedimentos.length > 0) return;
    setLoadingDadosProc(true);
    try {
      const catId = atendimento?.categoria_id;
      const usuariosUrl = catId ? `/api/usuarios?categoria_id=${catId}` : '/api/usuarios';
      const [resProc, resUsers] = await Promise.all([
        fetch('/api/procedimentos'),
        fetch(usuariosUrl),
      ]);
      setProcedimentos(await resProc.json());
      const usersData: Usuario[] = await resUsers.json();
      setExecutores((catId ? usersData : usersData).filter((u: Usuario & { roles?: string[] }) => {
        const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
        return roles.includes('executor') || roles.includes('ortodontista');
      }));
    } finally {
      setLoadingDadosProc(false);
    }
  };

  const fecharModalProcedimento = () => {
    setModalProcedimento(false);
    setProcId('');
    setExecId('');
    setValorCustom('');
    setDentesFaces([]);
    setErrorModal('');
  };

  const handleAdicionarProcedimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procId) return;
    const proc = procedimentos.find(p => p.id === parseInt(procId));
    if (proc?.por_dente && dentesFaces.length === 0) {
      setErrorModal('Selecione pelo menos um dente para este procedimento');
      return;
    }
    if (proc?.por_dente && proc?.tem_face && dentesFaces.some(d => d.faces.length === 0)) {
      setErrorModal('Selecione ao menos uma face para cada dente');
      return;
    }
    setAdicionando(true);
    setErrorModal('');
    try {
      const quantidade = proc?.por_dente ? dentesFaces.length : 1;
      const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
      const dentesParaSalvar = proc?.por_dente
        ? JSON.stringify(dentesFaces.map(d => ({
            dente: d.dente,
            faces: d.faces.map(f => ({ nome: f, concluido: false })),
          })))
        : null;
      const res = await unitFetch(`/api/atendimentos/${id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(procId),
          executor_id: execId ? parseInt(execId) : null,
          criado_por_id: user?.id,
          valor: valorBase * quantidade,
          dentes: dentesParaSalvar,
          quantidade,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }
      fecharModalProcedimento();
      await carregarAtendimento();
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionando(false);
    }
  };

  const abrirFichaCliente = async () => {
    setModalCliente(true);
    if (dadosCliente) return;
    setLoadingCliente(true);
    try {
      const res = await fetch(`/api/clientes/${atendimento?.cliente_id}`);
      const data = await res.json();
      setDadosCliente(data);
    } finally {
      setLoadingCliente(false);
    }
  };

  const fecharModalPagamento = () => {
    setModalPagamento(false);
    setValorPagamento('');
    setMetodoPagamento('pix');
    setObservacoesPagamento('');
    setItensPagamento({});
    setErrorPagamento('');
  };

  const distribuirPagamento = (valor: number) => {
    if (!atendimento) return;
    const novos: { [key: number]: number } = {};
    let restante = valor;
    for (const item of atendimento.itens) {
      if (restante <= 0) break;
      const devido = item.valor - item.valor_pago;
      if (devido <= 0) continue;
      const aplicado = Math.min(restante, devido);
      novos[item.id] = Math.round(aplicado * 100) / 100;
      restante -= aplicado;
    }
    setItensPagamento(novos);
  };

  const handleRegistrarPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorPagamento) return;
    const itens = Object.entries(itensPagamento)
      .filter(([, v]) => v > 0)
      .map(([item_id, valor_aplicado]) => ({ item_id: parseInt(item_id), valor_aplicado }));
    if (itens.length === 0) {
      setErrorPagamento('Distribua o valor entre os procedimentos');
      return;
    }
    const total = itens.reduce((s, i) => s + i.valor_aplicado, 0);
    if (Math.abs(total - parseFloat(valorPagamento)) > 0.01) {
      setErrorPagamento(`Total alocado (${formatarMoeda(total)}) não bate com o valor informado (${formatarMoeda(parseFloat(valorPagamento))})`);
      return;
    }
    setRegistrando(true);
    setErrorPagamento('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: parseFloat(valorPagamento), metodo: metodoPagamento, observacoes: observacoesPagamento || null, itens }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar');
      }
      fecharModalPagamento();
      // Recarrega e verifica se todos os procedimentos estão pagos
      const resAtend = await unitFetch(`/api/atendimentos/${id}`);
      const dadosAtend = await resAtend.json();
      setAtendimento(dadosAtend);
      const todosPagos = dadosAtend.itens.length > 0 &&
        dadosAtend.itens.every((item: ItemAtendimento) => item.valor_pago >= item.valor);
      if (todosPagos && dadosAtend.status === 'aguardando_pagamento') {
        openConfirm({
          title: 'Todos os procedimentos pagos',
          message: 'Todos os procedimentos estão quitados. Deseja abrir a etapa de destino para definir o que será feito hoje, o que ficará agendado e então liberar a execução?',
          confirmLabel: 'Definir destinos',
          type: 'info',
          onConfirm: async () => {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            router.push(`/atendimentos/${id}/pagamento`);
          },
        });
      }
    } catch (err) {
      setErrorPagamento(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setRegistrando(false);
    }
  };

  const abrirModalAgendamento = async () => {
    setModalAgendamento(true);
    setAgError('');
    setAgSalvando(false);
    // Pre-fill procedure from current items
    if (atendimento?.itens.length) {
      const firstItem = atendimento.itens[0];
      const proc = procedimentos.find(p => p.nome === firstItem.procedimento_nome);
      if (proc) setAgProcId(String(proc.id));
    }
    // Load data if needed
    if (procedimentos.length === 0) {
      setLoadingDadosProc(true);
      try {
        const catId = atendimento?.categoria_id;
        const usuariosUrl = catId ? `/api/usuarios?categoria_id=${catId}` : '/api/usuarios';
        const [resProc, resUsers] = await Promise.all([
          fetch('/api/procedimentos'),
          fetch(usuariosUrl),
        ]);
        setProcedimentos(await resProc.json());
        const usersData: Usuario[] = await resUsers.json();
        setExecutores((catId ? usersData : usersData).filter((u: Usuario & { roles?: string[] }) => {
          const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
          return roles.includes('executor') || roles.includes('ortodontista');
        }));
      } finally {
        setLoadingDadosProc(false);
      }
    }
  };

  const fecharModalAgendamento = () => {
    setModalAgendamento(false);
    setAgProcId('');
    setAgExecId('');
    setAgData('');
    setAgObs('');
    setAgError('');
  };

  const handleSalvarAgendamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agProcId) return;
    setAgSalvando(true);
    setAgError('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/gerar-agendamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procedimento_id: parseInt(agProcId),
          executor_id: agExecId ? parseInt(agExecId) : null,
          data_agendada: agData || null,
          observacoes: agObs || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao agendar');
      fecharModalAgendamento();
      toast.success('Próxima sessão agendada com sucesso');
    } catch (err) {
      setAgError(err instanceof Error ? err.message : 'Erro ao agendar');
    } finally {
      setAgSalvando(false);
    }
  };

  const handleRemoverItem = (itemId: number) => {
    openConfirm({
      title: 'Remover Dente',
      message: 'Deseja remover este dente do procedimento?',
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await unitFetch(`/api/atendimentos/${id}/itens?item_id=${itemId}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Erro ao remover');
            return;
          }
          await carregarAtendimento();
        } catch {
          setError('Erro ao remover item');
        }
      },
    });
  };

  const handleRemoverGrupo = (groupId: string) => {
    openConfirm({
      title: 'Remover Procedimento',
      message: 'Deseja remover todos os dentes deste procedimento?',
      confirmLabel: 'Remover Todos',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await unitFetch(`/api/atendimentos/${id}/itens?group_id=${groupId}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Erro ao remover');
            return;
          }
          await carregarAtendimento();
        } catch {
          setError('Erro ao remover grupo');
        }
      },
    });
  };

  if (loading) {
    return <LoadingState text="Carregando atendimento..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon={<ClipboardList className="w-7 h-7" />}
        title="Atendimento não encontrado"
        actionLabel="Voltar para lista"
        onAction={() => router.push('/atendimentos')}
      />
    );
  }

  const statusConfig = STATUS_CONFIG[atendimento.status as AtendimentoStatus];
  const proximoStatus = PROXIMOS_STATUS[atendimento.status as AtendimentoStatus];
  const statusAnterior = STATUS_ANTERIOR[atendimento.status as AtendimentoStatus];

  // Agrupar itens por group_id
  type GrupoOuItem =
    | { tipo: 'grupo'; groupId: string; itens: ItemAtendimento[] }
    | { tipo: 'solo'; item: ItemAtendimento };

  const itensAgrupados: GrupoOuItem[] = (() => {
    if (!atendimento) return [];
    const grupos: Record<string, ItemAtendimento[]> = {};
    const solos: ItemAtendimento[] = [];

    for (const item of atendimento.itens) {
      if (item.group_id) {
        if (!grupos[item.group_id]) grupos[item.group_id] = [];
        grupos[item.group_id].push(item);
      } else {
        solos.push(item);
      }
    }

    const result: GrupoOuItem[] = [];
    for (const [groupId, itens] of Object.entries(grupos)) {
      result.push({ tipo: 'grupo', groupId, itens });
    }
    for (const item of solos) {
      result.push({ tipo: 'solo', item });
    }
    return result;
  })();

  const getStatusAgregado = (itens: ItemAtendimento[]): string => {
    const statuses = itens.map(i => i.status);
    if (statuses.every(s => s === 'concluido')) return 'concluido';
    if (statuses.some(s => s === 'executando')) return 'executando';
    if (statuses.every(s => s === 'pendente')) return 'pendente';
    if (statuses.some(s => s === 'pago') && !statuses.some(s => s === 'executando')) return 'pago';
    return 'pendente';
  };

  const podRemover = atendimento?.status === 'avaliacao';
  const podTrocarExecutor = hasRole(['atendente', 'admin']) && atendimento && ['avaliacao', 'aguardando_pagamento', 'em_execucao'].includes(atendimento.status);

  const imprimirAtendimento = async () => {
    if (!atendimento) return;

    try {
      setImprimindoAtendimento(true);
      const res = await fetch(`/api/atendimentos/${atendimento.id}/pagamentos?grouped=1`);
      if (!res.ok) {
        setError('Erro ao carregar pagamentos do atendimento para impressão.');
        return;
      }

      const pagamentos = (await res.json()) as PagamentoAgrupado[];
      const itensHtml = atendimento.itens.length
        ? atendimento.itens.map((item) => `
            <tr>
              <td>${escapeHtml(nomeProcedimentoItem(item))}</td>
              <td>${escapeHtml(item.criado_por_nome || '-')}</td>
              <td>${escapeHtml(item.executor_nome || '-')}</td>
              <td>${escapeHtml(item.status)}</td>
              <td style="text-align:right">${formatarMoeda(parseSafeNumber(item.valor))}</td>
              <td>${escapeHtml(item.dentes || item.dente_unico || '-')}</td>
              <td style="text-align:right">${formatarMoeda(parseSafeNumber(item.valor_pago))}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" class="muted">Nenhum procedimento registrado</td></tr>';

      const pagamentosHtml = pagamentos.length
        ? pagamentos.flatMap((pagamento) => {
            if (!pagamento.formas?.length) {
              return `<tr>
                <td>${formatarDataHora(pagamento.created_at)}</td>
                <td>${escapeHtml(getMetodoPagamentoLabel(''))}</td>
                <td style="text-align:right;">${formatarMoeda(parseSafeNumber(pagamento.valor_total))}</td>
                <td style="text-align:center">${pagamento.cancelado ? 'Cancelado' : 'Ativo'}</td>
                <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
                <td>${escapeHtml(pagamento.observacoes || '-')}</td>
              </tr>`;
            }

            return pagamento.formas.map((forma) => `
              <tr>
                <td>${formatarDataHora(forma.created_at || pagamento.created_at)}</td>
                <td>${escapeHtml(getMetodoPagamentoLabel(forma.metodo))}</td>
                <td style="text-align:right;">${formatarMoeda(parseSafeNumber(forma.valor))}</td>
                <td style="text-align:center">${(forma.cancelado || pagamento.cancelado) ? 'Cancelado' : 'Ativo'}</td>
                <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
                <td>${escapeHtml(forma.observacoes || pagamento.observacoes || '-')}</td>
              </tr>
            `);
          }).join('')
        : '<tr><td colspan="6" class="muted">Nenhum pagamento registrado</td></tr>';

      const janela = window.open('', '_blank');
      if (!janela) {
        setError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
        return;
      }

      const totalGeral = parseSafeNumber(atendimento.total);
      const pago = parseSafeNumber(atendimento.total_pago);
      const saldoPendente = Math.max(totalGeral - pago, 0);
      const logoUrl = `${window.location.origin}/logo-sorria-leste-laranja-fundo-transparente.svg`;

      janela.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Relatório de Atendimento #${escapeHtml(String(atendimento.id))}</title>
            <style>
              :root { --sorria-orange: #ea580c; }
              body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #0f172a; font-size: 12px; background: #ffffff; }
              h1 { font-size: 20px; margin: 0; color: #0f172a; letter-spacing: 0.2px; }
              h2 { font-size: 14px; margin: 16px 0 8px; color: var(--sorria-orange); }
              h3 { font-size: 12px; margin: 12px 0 6px; }
              .header { border: 1px solid #fed7aa; padding: 14px 14px 12px; margin-bottom: 14px; background: #fff7ed; border-radius: 6px; }
              .summary { margin: 12px 0; }
              .report-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
              .brand { display: flex; align-items: center; gap: 10px; }
              .brand img { width: 40px; height: 40px; object-fit: contain; }
              .brand-text { color: var(--sorria-orange); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
              .summary { background: #fff; border: 1px solid #fed7aa; border-radius: 6px; padding: 10px 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
              th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
              th { background: #ffedd5; color: #7c2d12; }
              .muted { color: #64748b; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="report-header">
                <div class="brand">
                  <img src="${logoUrl}" alt="Logo Sorria Leste" />
                  <div>
                    <h1>Relatório de Atendimento</h1>
                    <div class="brand-text">Sorria Leste</div>
                  </div>
                </div>
                <div><strong>Nº:</strong> #${escapeHtml(String(atendimento.id))}</div>
              </div>
              <div><strong>Atendimento:</strong> #${escapeHtml(String(atendimento.id))}</div>
              <div><strong>Status:</strong> ${escapeHtml(STATUS_CONFIG[atendimento.status as AtendimentoStatus]?.label || atendimento.status)}</div>
              <div><strong>Data de abertura:</strong> ${formatarDataHora(atendimento.created_at)}</div>
              <div><strong>Finalizado em:</strong> ${escapeHtml(formatarDataHora(atendimento.finalizado_at))}</div>
              <div><strong>Cliente:</strong> ${escapeHtml(atendimento.cliente_nome)}</div>
              <div><strong>CPF:</strong> ${escapeHtml(atendimento.cliente_cpf || '-')} <strong>Telefone:</strong> ${escapeHtml(atendimento.cliente_telefone || '-')}</div>
              <div><strong>Email:</strong> ${escapeHtml(atendimento.cliente_email || '-')}</div>
            </div>
            <div class="summary">
              <strong>Total do atendimento:</strong> ${formatarMoeda(totalGeral)}<br />
              <strong>Total pago:</strong> ${formatarMoeda(pago)}<br />
              <strong>Saldo pendente:</strong> ${formatarMoeda(saldoPendente)}
            </div>

            <section>
              <h2>Procedimentos realizados</h2>
              <table>
                <thead>
                  <tr>
                    <th>Procedimento</th>
                    <th>Vendedor</th>
                    <th>Executor</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Dentes</th>
                    <th>Valor pago</th>
                  </tr>
                </thead>
                <tbody>${itensHtml}</tbody>
              </table>
            </section>

            <section>
              <h2>Pagamentos</h2>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Forma</th>
                    <th>Valor</th>
                    <th>Origem</th>
                    <th>Recebido por</th>
                    <th>Observações</th>
                  </tr>
                </thead>
                <tbody>${pagamentosHtml}</tbody>
              </table>
            </section>
          </body>
        </html>
      `);
      janela.document.close();
      janela.focus();
      setTimeout(() => {
        janela.print();
      }, 150);
    } finally {
      setImprimindoAtendimento(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Atendimento #${atendimento.id}`}
        icon={<ClipboardList className="w-7 h-7" />}
        breadcrumb={[
          { label: 'Atendimentos', href: '/atendimentos' },
          { label: `#${atendimento.id}` },
        ]}
        actions={
          <div className="flex gap-2 flex-wrap">
            {atendimento.status === 'em_execucao' && (
              <Button onClick={() => abrirModalAgendamento()} variant="secondary">
                <CalendarPlus className="w-4 h-4 mr-1" />
                Agendar próxima sessão
              </Button>
            )}
            {(atendimento.status === 'finalizado' || atendimento.status === 'encerrado') && (
              <Button variant="secondary" onClick={imprimirAtendimento} disabled={imprimindoAtendimento}>
                <Printer className="w-4 h-4 mr-1" />
                {imprimindoAtendimento ? 'Preparando impressão...' : 'Imprimir atendimento'}
              </Button>
            )}
            {atendimento.status === 'finalizado' && hasRole(['atendente', 'admin']) && (
              <Link href={`/atendimentos/${id}/encerrar`}>
                <Button variant="primary">
                  Revisar e Encerrar
                </Button>
              </Link>
            )}
            {statusAnterior && (
              <Button variant="secondary" onClick={() => handleMudarStatus(statusAnterior)} disabled={mudandoStatus}>
                {mudandoStatus ? 'Processando...' : `Voltar para ${STATUS_CONFIG[statusAnterior].label}`}
              </Button>
            )}
            {proximoStatus && !['em_execucao', 'aguardando_pagamento', 'finalizado', 'encerrado'].includes(atendimento.status) && (
              <Button onClick={() => handleMudarStatus(proximoStatus)} disabled={mudandoStatus}>
                {mudandoStatus ? 'Processando...' : `Avançar para ${STATUS_CONFIG[proximoStatus].label}`}
              </Button>
            )}
            {atendimento.status === 'aguardando_pagamento' && (
              <Link href={`/atendimentos/${id}/pagamento`}>
                <Button variant="primary">
                  💳 Ir para Pagamento
                </Button>
              </Link>
            )}
            {atendimento.status !== 'encerrado' && hasRole(['atendente', 'admin']) && (
              <Button variant="danger" onClick={handleArquivar}>
                Arquivar
              </Button>
            )}
          </div>
        }
      />

      <Card className="-mt-2">
        <StatusPipeline currentStatus={atendimento.status as AtendimentoStatus} tipo={atendimento.tipo as AtendimentoTipo} />
      </Card>

      {error && <Alert type="error">{error}</Alert>}

      {/* Banner de sessão de continuação */}
      {atendimento.tipo === 'sessao' && (
        <div className="flex items-center gap-2 p-3 bg-info-50 border border-info-200 rounded-lg text-sm text-info-800">
          <Info className="w-4 h-4 shrink-0" />
          <span>Este atendimento é uma continuação — sessão agendada para {
            atendimento.itens[0]
              ? (atendimento.itens[0].etapa_label
                  ? `${atendimento.itens[0].procedimento_nome} — ${atendimento.itens[0].etapa_label}`
                  : atendimento.itens[0].procedimento_nome)
              : 'procedimento'
          }.</span>
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados do Cliente */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Cliente</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Nome</p>
              <p className="font-medium">{atendimento.cliente_nome}</p>
            </div>
            {atendimento.cliente_cpf && (
              <div>
                <p className="text-sm text-muted">CPF</p>
                <p className="font-medium">{atendimento.cliente_cpf}</p>
              </div>
            )}
            {atendimento.cliente_telefone && (
              <div>
                <p className="text-sm text-muted">Telefone</p>
                <p className="font-medium">{atendimento.cliente_telefone}</p>
              </div>
            )}
            {atendimento.cliente_email && (
              <div>
                <p className="text-sm text-muted">Email</p>
                <p className="font-medium">{atendimento.cliente_email}</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={abrirFichaCliente}
              className="text-info-600 hover:text-info-800 text-sm"
            >
              Ver ficha completa →
            </button>
          </div>
        </Card>

        {/* Dados do Atendimento */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Atendimento</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Status</p>
              <p className={`font-medium ${statusConfig.cor}`}>
                {statusConfig.label}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Avaliador</p>
              <p className="font-medium">
                {atendimento.avaliador_nome || 'Não definido'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Criado em</p>
              <p className="font-medium">{formatarDataHora(atendimento.created_at)}</p>
            </div>
            {atendimento.liberado_em && ['em_execucao', 'finalizado'].includes(atendimento.status) && (
              <div>
                <p className="text-sm text-muted">Liberado para execução</p>
                <p className="font-medium">{formatarDataHora(atendimento.liberado_em)}</p>
                {atendimento.liberado_por_nome && (
                  <p className="text-xs text-muted">por {atendimento.liberado_por_nome}</p>
                )}
              </div>
            )}
            {atendimento.finalizado_at && (
              <div>
                <p className="text-sm text-muted">Finalizado em</p>
                <p className="font-medium">{formatarDataHora(atendimento.finalizado_at)}</p>
              </div>
            )}
          </div>

          {/* Métricas de tempo */}
          <div className="mt-4 pt-4 border-t space-y-2">
            {!['finalizado', 'encerrado'].includes(atendimento.status) ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Aberto há:</span>
                <span className="font-medium text-warning-600">{tempoDecorrido(atendimento.created_at)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Duração total:</span>
                <span className="font-medium">{tempoDecorrido(atendimento.created_at, atendimento.finalizado_at)}</span>
              </div>
            )}
            {atendimento.liberado_em && atendimento.status === 'em_execucao' && !atendimento.finalizado_at && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Em execução há:</span>
                <span className="font-medium text-info-600">{tempoDecorrido(atendimento.liberado_em)}</span>
              </div>
            )}
            {atendimento.liberado_em && atendimento.finalizado_at && atendimento.status === 'finalizado' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Tempo em execução:</span>
                <span className="font-medium">{tempoDecorrido(atendimento.liberado_em, atendimento.finalizado_at)}</span>
              </div>
            )}
            {!atendimento.liberado_em && !['finalizado', 'encerrado'].includes(atendimento.status) && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Aguardando liberação há:</span>
                <span className="font-medium text-warning-500">{tempoDecorrido(atendimento.created_at)}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Resumo Financeiro */}
        <Card>
          <h2 className="text-lg font-semibold mb-4">Financeiro</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted">Total</p>
              <p className="text-2xl font-bold text-foreground">
                {formatarMoeda(atendimento.total)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pago</p>
              <p className="text-xl font-semibold text-success-600">
                {formatarMoeda(atendimento.total_pago)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Pendente</p>
              <p className={`text-xl font-semibold ${
                atendimento.total - atendimento.total_pago > 0 
                  ? 'text-error-600' 
                  : 'text-neutral-400'
              }`}>
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </p>
            </div>
          </div>
          {atendimento.status === 'aguardando_pagamento' && (
            <div className="mt-4 pt-4 border-t">
              <Link href={`/atendimentos/${id}/pagamento`} className="block">
                <Button variant="secondary" className="w-full justify-center">
                  💳 Ir para Pagamento
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Procedimentos */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Procedimentos</h2>
          {(['triagem', 'avaliacao', 'em_execucao'].includes(atendimento.status)) && (
            <Button variant="secondary" size="sm" onClick={abrirModalProcedimento}>+ Adicionar Procedimento</Button>
          )}
        </div>
        
        {atendimento.itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-muted py-12">
            <p className="text-sm">Nenhum procedimento adicionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-light">
            <table className="w-full text-sm">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-left">Procedimento</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-left">Vendedor</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-left">Executor</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-right">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-center">Status</th>
                  {podRemover && (
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-primary-900 text-center w-20">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-surface">
                {itensAgrupados.map((entry) => {
                  if (entry.tipo === 'solo') {
                    const item = entry.item;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div>{nomeProcedimentoItem(item)}</div>
                          {item.progresso_etapas && item.progresso_etapas.length > 0 && (
                            <ProgressoEtapas etapas={item.progresso_etapas} />
                          )}
                        </td>
                        <td className="px-4 py-3">{item.criado_por_nome || '-'}</td>
                        <td className="px-4 py-3">
                          {podTrocarExecutor && ['pendente', 'pago'].includes(item.status) ? (
                            trocandoExecutor === item.id ? (
                              <select
                                autoFocus
                                className="text-sm border border-border rounded px-2 py-1 bg-surface"
                                defaultValue={item.executor_id ?? ''}
                                onChange={(e) => handleTrocarExecutor(item.id, e.target.value ? parseInt(e.target.value) : null)}
                                onBlur={() => setTrocandoExecutor(null)}
                              >
                                <option value="">Sem executor</option>
                                {executores.map(ex => (
                                  <option key={ex.id} value={ex.id}>{ex.nome}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => { carregarExecutores(); setTrocandoExecutor(item.id); }}
                                className="text-left hover:text-primary-600 hover:underline transition-colors"
                                title="Clique para trocar executor"
                              >
                                {item.executor_nome || <span className="text-muted italic">Sem executor</span>}
                              </button>
                            )
                          ) : (
                            item.executor_nome || '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{formatarMoeda(item.valor)}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge type="item" status={item.status} /></td>
                        {podRemover && (
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleRemoverItem(item.id)} className="text-error-500 hover:text-error-700 p-1" title="Remover">
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  const { groupId, itens: grupoItens } = entry;
                  const expandido = gruposExpandidos.has(groupId);
                  const totalGrupo = grupoItens.reduce((s, i) => s + i.valor, 0);
                  const statusAgregado = getStatusAgregado(grupoItens);
                  const primeiro = grupoItens[0];

                  return (
                    <React.Fragment key={groupId}>
                      {/* Header do grupo */}
                      <tr
                        className="bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors"
                        onClick={() => toggleGrupo(groupId)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expandido ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                            <span className="font-medium">{primeiro.procedimento_nome}</span>
                            <span className="text-xs text-muted bg-neutral-200 px-1.5 py-0.5 rounded">
                              {grupoItens.length} {grupoItens.length === 1 ? 'dente' : 'dentes'}
                            </span>
                          </div>
                          {primeiro.progresso_etapas && primeiro.progresso_etapas.length > 0 && (
                            <div className="ml-6">
                              <ProgressoEtapas etapas={primeiro.progresso_etapas} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{primeiro.criado_por_nome || '-'}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {podTrocarExecutor && grupoItens.every(i => ['pendente', 'pago'].includes(i.status)) ? (
                            trocandoExecutor === primeiro.id ? (
                              <select
                                autoFocus
                                className="text-sm border border-border rounded px-2 py-1 bg-surface"
                                defaultValue={primeiro.executor_id ?? ''}
                                onChange={async (e) => {
                                  const novoId = e.target.value ? parseInt(e.target.value) : null;
                                  for (const gi of grupoItens) {
                                    await handleTrocarExecutor(gi.id, novoId);
                                  }
                                }}
                                onBlur={() => setTrocandoExecutor(null)}
                              >
                                <option value="">Sem executor</option>
                                {executores.map(ex => (
                                  <option key={ex.id} value={ex.id}>{ex.nome}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => { carregarExecutores(); setTrocandoExecutor(primeiro.id); }}
                                className="text-left hover:text-primary-600 hover:underline transition-colors"
                                title="Clique para trocar executor de todo o grupo"
                              >
                                {primeiro.executor_nome || <span className="text-muted italic">Sem executor</span>}
                              </button>
                            )
                          ) : (
                            primeiro.executor_nome || '-'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatarMoeda(totalGrupo)}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge type="item" status={statusAgregado} /></td>
                        {podRemover && (
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleRemoverGrupo(groupId)} className="text-error-500 hover:text-error-700 p-1" title="Remover procedimento">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>

                      {/* Sub-linhas dos dentes */}
                      {expandido && grupoItens.map((item) => (
                        <tr key={item.id} className="bg-neutral-50/50">
                          <td className="px-4 py-2 pl-12">
                            <span className="text-muted">
                              {item.dentes
                                ? formatarDenteUnicoComFaces(item)
                                : item.dente_unico ? `Dente ${item.dente_unico}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right text-muted">{formatarMoeda(item.valor)}</td>
                          <td className="px-4 py-2 text-center"><StatusBadge type="item" status={item.status} size="sm" /></td>
                          {podRemover && (
                            <td className="px-4 py-2 text-center">
                              <button onClick={() => handleRemoverItem(item.id)} className="text-error-400 hover:text-error-600 p-1" title="Remover dente">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {atendimento.itens.length > 0 && (
          <div className="mt-4 pt-4 border-t flex justify-end">
            <div className="text-right">
              <span className="text-sm text-muted mr-3">Total:</span>
              <span className="text-lg font-bold">{formatarMoeda(atendimento.total)}</span>
            </div>
          </div>
        )}
      </Card>


      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />

      <Modal
        isOpen={modalProcedimento}
        onClose={fecharModalProcedimento}
        title="Adicionar Procedimento"
        size="lg"
        className="sm:h-[80vh]"
      >
        {loadingDadosProc ? (
          <LoadingState text="Carregando..." />
        ) : (
          <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
            {errorModal && <Alert type="error">{errorModal}</Alert>}
            <SearchableSelect
              label="Procedimento *"
              name="procedimento"
              value={procId}
              onChange={(value) => {
                setProcId(value);
                setValorCustom('');
                setDentesFaces([]);
              }}
              options={procedimentos.map((p) => ({
                value: String(p.id),
                label: `${p.nome} — ${formatarMoeda(p.valor)}${p.por_dente ? ' (por dente)' : ''}`,
              }))}
              placeholder="Selecione..."
              searchPlaceholder="Buscar procedimento..."
              emptyMessage="Nenhum procedimento encontrado"
              required
            />
            {(() => {
              const proc = procedimentos.find(p => p.id === parseInt(procId));
              return proc?.por_dente === 1 ? (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Dentes *</label>
                  <SeletorDentes
                    valor={dentesFaces}
                    onChange={setDentesFaces}
                    disabled={adicionando}
                    mostrarFaces={proc.tem_face === 1}
                  />
                  {dentesFaces.length > 0 && (
                    <p className="text-sm text-info-600 mt-2">
                      {formatarMoeda(proc.valor)} × {dentesFaces.length} dentes = <strong>{formatarMoeda(proc.valor * dentesFaces.length)}</strong>
                    </p>
                  )}
                </div>
              ) : null;
            })()}
            <Select
              label="Executor"
              name="executor"
              value={execId}
              onChange={setExecId}
              options={executores.map(e => ({ value: String(e.id), label: e.nome }))}
              placeholder="Definir depois"
            />
            <Input
              label="Valor (R$)"
              name="valor"
              type="number"
              value={valorCustom}
              onChange={setValorCustom}
              placeholder={(() => {
                const proc = procedimentos.find(p => p.id === parseInt(procId));
                return proc ? `Padrão: ${proc.valor}` : 'Selecione um procedimento';
              })()}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={fecharModalProcedimento}>Cancelar</Button>
              <Button type="submit" disabled={!procId || adicionando} loading={adicionando}>
                + Adicionar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Ficha do Cliente */}
      <Modal isOpen={modalCliente} onClose={() => setModalCliente(false)} title="Ficha do Cliente" size="md">
        {loadingCliente ? (
          <LoadingState text="Carregando..." />
        ) : dadosCliente ? (
          <div className="space-y-3">
            {[
              { label: 'Nome', value: dadosCliente.nome },
              { label: 'CPF', value: dadosCliente.cpf },
              { label: 'Telefone', value: dadosCliente.telefone },
              { label: 'Email', value: dadosCliente.email },
              { label: 'Data de Nascimento', value: dadosCliente.data_nascimento },
              { label: 'Endereço', value: dadosCliente.endereco },
              { label: 'Origem', value: dadosCliente.origem },
              { label: 'Observações', value: dadosCliente.observacoes },
            ].map(({ label, value }) =>
              value ? (
                <div key={label} className="flex gap-3">
                  <span className="text-sm text-muted w-40 shrink-0">{label}</span>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ) : null
            )}
            <div className="pt-3 border-t">
              <Link href={`/clientes/${atendimento.cliente_id}`} className="text-info-600 hover:text-info-800 text-sm">
                Abrir ficha completa →
              </Link>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal Agendar Próxima Sessão */}
      <Modal isOpen={modalAgendamento} onClose={fecharModalAgendamento} title="Agendar Próxima Sessão" size="md">
        {loadingDadosProc ? (
          <LoadingState text="Carregando..." />
        ) : (
          <form onSubmit={handleSalvarAgendamento} className="space-y-4">
            {agError && <Alert type="error">{agError}</Alert>}
            <SearchableSelect
              label="Procedimento *"
              name="agProcedimento"
              value={agProcId}
              onChange={setAgProcId}
              options={procedimentos.map(p => ({ value: String(p.id), label: p.nome }))}
              placeholder="Selecione..."
              searchPlaceholder="Buscar procedimento..."
              emptyMessage="Nenhum procedimento encontrado"
              required
            />
            <Select
              label="Executor"
              name="agExecutor"
              value={agExecId}
              onChange={setAgExecId}
              options={executores.map(e => ({ value: String(e.id), label: e.nome }))}
              placeholder="Definir depois"
            />
            <Input
              label="Data e hora"
              name="agData"
              type="datetime-local"
              value={agData}
              onChange={setAgData}
              hint="Opcional — sem data = agendamento pendente. Hora também opcional."
            />
            <Textarea
              label="Observações"
              name="agObs"
              value={agObs}
              onChange={setAgObs}
              placeholder="Observações sobre a próxima sessão..."
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={fecharModalAgendamento}>Cancelar</Button>
              <Button type="submit" disabled={!agProcId || agSalvando} loading={agSalvando}>
                Agendar Sessão
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Pagamento */}
      <Modal isOpen={modalPagamento} onClose={fecharModalPagamento} title="Registrar Pagamento" size="md">
        {atendimento && (() => {
          const saldo = atendimento.total - atendimento.total_pago;
          const totalAlocado = Object.values(itensPagamento).reduce((s, v) => s + v, 0);
          const val = parseFloat(valorPagamento) || 0;
          const diff = Math.abs(totalAlocado - val);
          const ok = val > 0 && diff < 0.01;
          return (
            <form onSubmit={handleRegistrarPagamento} className="space-y-4">
              {errorPagamento && <Alert type="error">{errorPagamento}</Alert>}

              {/* Valor */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Valor recebido (R$) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min="0"
                    value={valorPagamento}
                    onChange={(e) => setValorPagamento(e.target.value)}
                    onBlur={(e) => distribuirPagamento(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="input flex-1"
                    required
                  />
                  {saldo > 0 && (
                    <button type="button"
                      onClick={() => { setValorPagamento(saldo.toString()); distribuirPagamento(saldo); }}
                      className="btn btn-secondary whitespace-nowrap text-sm"
                    >
                      Pagar tudo
                    </button>
                  )}
                </div>
                {saldo > 0 && <p className="text-xs text-muted mt-1">Saldo restante: <span className="font-medium text-error-600">{formatarMoeda(saldo)}</span></p>}
              </div>

              {/* Forma de pagamento */}
              <Select
                label="Forma de pagamento"
                name="metodoPagamento"
                options={METODOS_PAGAMENTO}
                value={metodoPagamento}
                onChange={setMetodoPagamento}
                required
              />

              {/* Distribuição */}
              {val > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-surface-secondary">
                    <span className="text-sm font-medium text-neutral-700">Como distribuir nos procedimentos</span>
                  </div>
                  <div className="divide-y">
                    {atendimento.itens.map(item => {
                      const devido = item.valor - item.valor_pago;
                      if (devido <= 0) return null;
                      const alocado = itensPagamento[item.id] || 0;
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {nomeProcedimentoItem(item)}
                            </p>
                            <p className="text-xs text-muted">
                              Falta pagar: {formatarMoeda(devido)}
                              {alocado >= devido && <span className="ml-2 text-success-600 font-medium">✓ Quitado</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-muted">R$</span>
                            <input
                              type="number" step="0.01" min="0" max={devido}
                              value={itensPagamento[item.id] ?? ''}
                              onChange={(e) => setItensPagamento(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                              className="w-28 text-right px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`flex justify-between px-3 py-2 text-sm font-medium ${ok ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>
                    <span>{ok ? '✓ Valor totalmente alocado' : val - totalAlocado > 0 ? `Falta alocar: ${formatarMoeda(val - totalAlocado)}` : `Excesso: ${formatarMoeda(totalAlocado - val)}`}</span>
                    <span>{formatarMoeda(totalAlocado)} / {formatarMoeda(val)}</span>
                  </div>
                </div>
              )}

              {/* Observações */}
              <Input
                label="Observações"
                name="observacoesPagamento"
                value={observacoesPagamento}
                onChange={setObservacoesPagamento}
                placeholder="Ex: Entrada do tratamento"
                hint="opcional"
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={fecharModalPagamento}>Cancelar</Button>
                <Button type="submit" disabled={!valorPagamento || registrando} loading={registrando}>
                  Confirmar Pagamento
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
