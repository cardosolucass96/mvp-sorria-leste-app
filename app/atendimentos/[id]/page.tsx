'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora, tempoDecorrido, nomeProcedimentoItem, formatarDenteUnicoComFaces, formatarDentes, formatarCPF, formatarCNPJ, formatarAgoraDaClinica } from '@/lib/utils/formatters';
import { STATUS_CONFIG, PROXIMOS_STATUS, STATUS_ANTERIOR } from '@/lib/constants/status';
import type { AtendimentoStatus, AtendimentoTipo } from '@/lib/types';
import { AnexosGallery, StatusBadge, StatusPipeline, type AnexoData } from '@/components/domain';
import { ClipboardList, ChevronDown, ChevronRight, X, Trash2, CalendarPlus, Info, Pencil, Printer, Paperclip } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Button, Card, EmptyState, ConfirmDialog, Modal, Select, Input, Textarea, useToast } from '@/components/ui';
import ElapsedTime from '@/components/ui/ElapsedTime';
import usePageTitle from '@/lib/utils/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { finalizarJanelaDeImpressao } from '@/lib/utils/print';
import { getFormaPagamentoSnapshotLabel } from '@/lib/utils/formasPagamento';
import { PRINT_STYLE_TOKENS_BASE } from '@/lib/printStyles';

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
  roles?: string[];
  ativo?: number;
}

function getRolesUsuario(usuario: Usuario) {
  return Array.isArray(usuario.roles) && usuario.roles.length > 0
    ? usuario.roles
    : [usuario.role];
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
  criado_por_id: number | null;
  criado_por_nome: string | null;
  valor: number;
  valor_original: number | null;
  valor_final: number | null;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dentes?: string | null;
  dente_unico: string | null;
  observacoes: string | null;
  progresso_etapas: ProgressoEtapa[] | null;
}

interface AnexoClienteApi {
  id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  created_at: string;
  descricao?: string | null;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  unidade_id: number | null;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  unidade_nome: string | null;
  unidade_razao_social: string | null;
  unidade_cnpj: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
  unidade_email: string | null;
  unidade_responsavel: string | null;
  unidade_recibo_rodape: string | null;
  avaliador_id: number | null;
  avaliador_nome: string | null;
  liberado_por_nome: string | null;
  status: string;
  tipo: string | null;
  categoria_id: number | null;
  motivo_saida: string | null;
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
  forma_pagamento_id?: number | null;
  forma_pagamento_grupo_snapshot?: string | null;
  forma_pagamento_subgrupo_snapshot?: string | null;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  alocacoes?: PagamentoAlocacaoImpressao[];
}

interface PagamentoAlocacaoImpressao {
  id: number;
  pagamento_id: number;
  item_atendimento_id: number | null;
  agendamento_id: number | null;
  etapa_modelo_id: number | null;
  valor_alocado: number;
  procedimento_nome: string;
  etapa_label: string | null;
  dentes: string | null;
  dente_unico: string | null;
  quantidade: number | null;
  data_agendada: string | null;
  agendamento_status: string | null;
}

interface PagamentoAgrupado {
  id: string;
  valor_total: number;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  alocacoes?: PagamentoAlocacaoImpressao[];
  formas: PagamentoForma[];
}

interface PagamentoSimples {
  id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  recebido_por_nome: string | null;
  alocacoes?: PagamentoAlocacaoImpressao[];
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
              ? 'bg-success-500/10 text-success-700 dark:text-success-300'
              : 'bg-muted text-muted-foreground'
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
  const { hasRole, user, currentUnidade } = useAuth();
  const podeGerenciarEdicaoRecepcao = Boolean(
    user && getRolesUsuario(user).some((role) => ['admin', 'atendente'].includes(role))
  );
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
  const [imprimindoRecibos, setImprimindoRecibos] = useState(false);

  const escapeHtml = (value: unknown) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const parseSafeNumber = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

  const getMetodoPagamentoLabel = (pagamento: { metodo: string; forma_pagamento_grupo_snapshot?: string | null; forma_pagamento_subgrupo_snapshot?: string | null }) =>
    getFormaPagamentoSnapshotLabel({
      metodo: pagamento.metodo,
      forma_pagamento_grupo_snapshot: pagamento.forma_pagamento_grupo_snapshot ?? null,
      forma_pagamento_subgrupo_snapshot: pagamento.forma_pagamento_subgrupo_snapshot ?? null,
    }) || METODOS_PAGAMENTO_LABEL[pagamento.metodo] || pagamento.metodo;

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
  const [procObservacoes, setProcObservacoes] = useState('');
  const [anexosCliente, setAnexosCliente] = useState<AnexoData[]>([]);
  const [anexosClienteLoading, setAnexosClienteLoading] = useState(false);
  const [anexosClienteUploading, setAnexosClienteUploading] = useState(false);
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
  const [avaliadores, setAvaliadores] = useState<Usuario[]>([]);
  const [loadingAvaliadores, setLoadingAvaliadores] = useState(false);
  const [savingAvaliador, setSavingAvaliador] = useState(false);
  const [vendedores, setVendedores] = useState<Usuario[]>([]);
  const [loadingVendedores, setLoadingVendedores] = useState(false);
  const [trocandoVendedor, setTrocandoVendedor] = useState<string | null>(null);
  const [savingVendedorKey, setSavingVendedorKey] = useState<string | null>(null);
  const [editingValorId, setEditingValorId] = useState<number | null>(null);
  const [editingValorValue, setEditingValorValue] = useState('');
  const [savingValorId, setSavingValorId] = useState<number | null>(null);

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

  const carregarAnexosCliente = async (clienteId: number) => {
    setAnexosClienteLoading(true);
    try {
      const res = await fetch(`/api/clientes/${clienteId}/anexos`);
      if (!res.ok) {
        setAnexosCliente([]);
        return;
      }

      const data = await res.json() as AnexoClienteApi[];
      setAnexosCliente(
        data.map((anexo) => ({
          id: anexo.id,
          nome: anexo.nome_arquivo,
          url: `/api/arquivos/${anexo.caminho}`,
          tipo: anexo.tipo_arquivo,
          tamanho: anexo.tamanho,
          created_at: anexo.created_at,
          descricao: anexo.descricao || null,
        }))
      );
    } catch {
      setAnexosCliente([]);
    } finally {
      setAnexosClienteLoading(false);
    }
  };

  const handleUploadAnexoCliente = async ({ file }: { file: File; titulo?: string; descricao?: string }) => {
    if (!user || !atendimento) return;

    setAnexosClienteUploading(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', String(user.id));

      const res = await fetch(`/api/clientes/${atendimento.cliente_id}/anexos`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Erro ao enviar anexo');
        return;
      }

      await carregarAnexosCliente(atendimento.cliente_id);
      toast.success('Foto adicionada com sucesso');
    } catch {
      toast.error('Erro ao enviar anexo');
    } finally {
      setAnexosClienteUploading(false);
    }
  };

  const handleDeleteAnexoCliente = async (anexo: AnexoData) => {
    if (!atendimento) return;

    try {
      const res = await fetch(`/api/clientes/${atendimento.cliente_id}/anexos?anexo_id=${anexo.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao remover anexo');
        return;
      }

      await carregarAnexosCliente(atendimento.cliente_id);
      toast.success('Anexo removido com sucesso');
    } catch {
      toast.error('Erro ao remover anexo');
    }
  };

  const handleUpdateAnexoCliente = async (
    anexo: AnexoData,
    data: { titulo?: string; descricao?: string }
  ) => {
    if (!atendimento) return;

    const res = await fetch(`/api/clientes/${atendimento.cliente_id}/anexos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anexo_id: anexo.id,
        titulo: data.titulo,
        descricao: data.descricao,
      }),
    });
    const responseData = await res.json();
    if (!res.ok) {
      toast.error(responseData.error || 'Erro ao atualizar anexo');
      return;
    }

    await carregarAnexosCliente(atendimento.cliente_id);
    toast.success('Anexo atualizado com sucesso');
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

  const carregarAvaliadores = useCallback(async () => {
    setLoadingAvaliadores(true);
    try {
      const params = new URLSearchParams({ role: 'avaliador' });
      if (currentUnidade) {
        params.set('unidade_id', String(currentUnidade));
      }

      const res = await unitFetch(`/api/usuarios?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Não foi possível carregar os avaliadores');
      }

      const data = await res.json() as Usuario[];
      setAvaliadores(data);
    } catch (loadError) {
      console.error('Erro ao carregar avaliadores:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar avaliadores');
    } finally {
      setLoadingAvaliadores(false);
    }
  }, [currentUnidade, unitFetch]);

  useEffect(() => {
    if (atendimento?.status === 'triagem' && podeGerenciarEdicaoRecepcao) {
      carregarAvaliadores();
    }
  }, [atendimento?.status, carregarAvaliadores, podeGerenciarEdicaoRecepcao]);

  const carregarVendedores = useCallback(async () => {
    setLoadingVendedores(true);
    try {
      const params = new URLSearchParams();
      if (currentUnidade) {
        params.set('unidade_id', String(currentUnidade));
      }

      const url = params.toString() ? `/api/usuarios?${params.toString()}` : '/api/usuarios';
      const res = await unitFetch(url);
      if (!res.ok) {
        throw new Error('Não foi possível carregar os vendedores');
      }

      const data = await res.json() as Usuario[];
      setVendedores(data.filter((usuario) => {
        const roles = getRolesUsuario(usuario);
        return usuario.ativo !== 0 && roles.some((role) => ['admin', 'atendente', 'avaliador'].includes(role));
      }));
    } catch (loadError) {
      console.error('Erro ao carregar vendedores:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar vendedores');
    } finally {
      setLoadingVendedores(false);
    }
  }, [currentUnidade, unitFetch]);

  useEffect(() => {
    if (atendimento?.status === 'triagem' && podeGerenciarEdicaoRecepcao) {
      carregarVendedores();
    }
  }, [atendimento?.status, carregarVendedores, podeGerenciarEdicaoRecepcao]);

  const handleAtualizarAvaliador = useCallback(async (novoAvaliadorId: string) => {
    if (!atendimento) return;

    const avaliadorAtual = atendimento.avaliador_id ? String(atendimento.avaliador_id) : '';
    if (novoAvaliadorId === avaliadorAtual) return;

    setSavingAvaliador(true);
    setError('');

    try {
      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avaliador_id: novoAvaliadorId ? parseInt(novoAvaliadorId) : null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar avaliador');
      }

      toast.success(novoAvaliadorId ? 'Avaliador atualizado com sucesso' : 'Avaliador removido com sucesso');
      await carregarAtendimento();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Erro ao atualizar avaliador';
      setError(message);
      toast.error(message);
    } finally {
      setSavingAvaliador(false);
    }
  }, [atendimento, carregarAtendimento, id, toast, unitFetch]);

  const handleAtualizarVendedor = useCallback(async (
    key: string,
    itemIds: number[],
    novoVendedorId: number
  ) => {
    if (!novoVendedorId || itemIds.length === 0) return;

    setSavingVendedorKey(key);
    setError('');

    try {
      for (const itemId of itemIds) {
        const response = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ criado_por_id: novoVendedorId }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erro ao atualizar vendedor');
        }
      }

      toast.success(itemIds.length > 1 ? 'Vendedor do grupo atualizado com sucesso' : 'Vendedor atualizado com sucesso');
      await carregarAtendimento();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Erro ao atualizar vendedor';
      setError(message);
      toast.error(message);
    } finally {
      setSavingVendedorKey(null);
      setTrocandoVendedor(null);
    }
  }, [carregarAtendimento, id, toast, unitFetch]);

  const handleAtualizarValor = useCallback(async (item: ItemAtendimento) => {
    if (savingValorId === item.id) return;

    const valorNum = Number(editingValorValue);
    const valorAtual = item.valor_final ?? item.valor;
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      setError('Valor inválido');
      toast.error('Valor inválido');
      return;
    }

    if (Math.abs(valorNum - valorAtual) < 0.001) {
      setEditingValorId(null);
      setEditingValorValue('');
      return;
    }

    setSavingValorId(item.id);
    setError('');

    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_final: Number(valorNum.toFixed(2)) }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao atualizar valor');
      }

      toast.success('Valor atualizado com sucesso');
      setEditingValorId(null);
      setEditingValorValue('');
      await carregarAtendimento();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Erro ao atualizar valor';
      setError(message);
      toast.error(message);
    } finally {
      setSavingValorId(null);
    }
  }, [carregarAtendimento, editingValorValue, id, savingValorId, toast, unitFetch]);

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
    if (atendimento?.cliente_id) {
      void carregarAnexosCliente(atendimento.cliente_id);
    }
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
    setProcObservacoes('');
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
          criado_por_id: atendimento?.avaliador_id ?? user?.id,
          valor: valorBase * quantidade,
          dentes: dentesParaSalvar,
          quantidade,
          observacoes: procObservacoes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }
      toast.success('Procedimento adicionado com sucesso');
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
  const podeAcessarFinanceiro = ['aguardando_pagamento', 'em_execucao', 'finalizado', 'encerrado'].includes(atendimento.status);
  const labelAcessoFinanceiro = atendimento.status === 'aguardando_pagamento' ? '💳 Ir para Pagamento' : '💳 Ver Financeiro';
  const podeImprimirRecibos = podeAcessarFinanceiro && parseSafeNumber(atendimento.total_pago) > 0;
  const atendimentoEhContinuacao = atendimento.motivo_saida === 'continuacao';

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

  const getValorAtualItem = (item: ItemAtendimento) => item.valor_final ?? item.valor;
  const getValorOriginalItem = (item: ItemAtendimento) => item.valor_original;
  const itemTemDesconto = (item: ItemAtendimento) => {
    const valorOriginal = getValorOriginalItem(item);
    return valorOriginal != null && valorOriginal > getValorAtualItem(item);
  };

  const carregarPagamentosParaImpressao = async (atendimentoId: number): Promise<PagamentoAgrupado[]> => {
    try {
      const resAgrupado = await unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos?grouped=1`);
      if (resAgrupado.ok) {
        return (await resAgrupado.json()) as PagamentoAgrupado[];
      }
      console.warn('[print] grouped payments unavailable, falling back to simple payments list');
    } catch (error) {
      console.warn('[print] grouped payments fetch failed, falling back to simple payments list', error);
    }

    const resSimples = await unitFetch(`/api/atendimentos/${atendimentoId}/pagamentos`);
    if (!resSimples.ok) {
      throw new Error('Erro ao carregar pagamentos do atendimento para impressão.');
    }

    const pagamentosSimples = (await resSimples.json()) as PagamentoSimples[];
    return pagamentosSimples.map((pagamento) => ({
      id: `pagamento:${pagamento.id}`,
      valor_total: parseSafeNumber(pagamento.valor),
      observacoes: pagamento.observacoes,
      cancelado: pagamento.cancelado,
      motivo_cancelamento: pagamento.motivo_cancelamento,
      created_at: pagamento.created_at,
      recebido_por_nome: pagamento.recebido_por_nome,
      alocacoes: pagamento.alocacoes ?? [],
      formas: [
        {
          id: pagamento.id,
          valor: parseSafeNumber(pagamento.valor),
          metodo: pagamento.metodo,
          observacoes: pagamento.observacoes,
          cancelado: pagamento.cancelado,
          motivo_cancelamento: pagamento.motivo_cancelamento,
          created_at: pagamento.created_at,
          alocacoes: pagamento.alocacoes ?? [],
        },
      ],
    }));
  };

  const formatarReferenciasPagamentoImpressao = (alocacoes?: PagamentoAlocacaoImpressao[]) => {
    if (!alocacoes?.length) {
      return '<span class="muted">Não informado</span>';
    }

    return `
      <ul class="compact-list">
        ${alocacoes.map((alocacao) => {
          const nome = nomeProcedimentoItem({
            procedimento_nome: alocacao.procedimento_nome || 'Procedimento',
            etapa_label: alocacao.etapa_label,
            dentes: alocacao.dentes,
            dente_unico: alocacao.dente_unico,
          });
          const complemento = alocacao.agendamento_id && alocacao.data_agendada
            ? ` · agendado para ${formatarDataHora(alocacao.data_agendada)}`
            : '';

          return `
            <li>
              <strong>${escapeHtml(nome)}</strong>
              <span class="muted"> · ${formatarMoeda(parseSafeNumber(alocacao.valor_alocado))}${escapeHtml(complemento)}</span>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  };

  const formatarObservacoesPagamentoImpressao = ({
    observacoes,
    cancelado,
    motivo_cancelamento,
  }: {
    observacoes: string | null;
    cancelado: number;
    motivo_cancelamento: string | null;
  }) => {
    const detalhes = [
      observacoes || null,
      cancelado && motivo_cancelamento ? `Cancelado: ${motivo_cancelamento}` : null,
    ].filter((valor): valor is string => Boolean(valor));

    return detalhes.length ? escapeHtml(detalhes.join(' | ')) : '-';
  };

  const renderizarTabelaPagamentosImpressao = (pagamentos: PagamentoAgrupado[]) => {
    if (!pagamentos.length) {
      return '<tr><td colspan="7" class="muted">Nenhum pagamento registrado</td></tr>';
    }

    return pagamentos.flatMap((pagamento) => {
      if (!pagamento.formas?.length) {
        return `<tr>
          <td>${formatarDataHora(pagamento.created_at)}</td>
          <td>#${escapeHtml(String(atendimento?.id ?? '-'))}</td>
          <td>${formatarReferenciasPagamentoImpressao(pagamento.alocacoes)}</td>
          <td>-</td>
          <td style="text-align:right;">${formatarMoeda(parseSafeNumber(pagamento.valor_total))}</td>
          <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
          <td>${formatarObservacoesPagamentoImpressao(pagamento)}</td>
        </tr>`;
      }

      return pagamento.formas.map((forma) => {
        const alocacoes = forma.alocacoes?.length ? forma.alocacoes : pagamento.alocacoes;
        return `
          <tr>
            <td>${formatarDataHora(forma.created_at || pagamento.created_at)}</td>
            <td>#${escapeHtml(String(atendimento?.id ?? '-'))}</td>
            <td>${formatarReferenciasPagamentoImpressao(alocacoes)}</td>
            <td>${escapeHtml(getMetodoPagamentoLabel(forma) || '-')}</td>
            <td style="text-align:right;">${formatarMoeda(parseSafeNumber(forma.valor))}</td>
            <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
            <td>${formatarObservacoesPagamentoImpressao({
              observacoes: forma.observacoes || pagamento.observacoes,
              cancelado: forma.cancelado || pagamento.cancelado,
              motivo_cancelamento: forma.motivo_cancelamento || pagamento.motivo_cancelamento,
            })}</td>
          </tr>
        `;
      });
    }).join('');
  };

  const abrirRelatorioDeImpressao = ({
    tituloDocumento,
    tituloCabecalho,
    pagamentosHtml,
    itensHtml,
    modoRecibo = false,
    quantidadePagamentos,
    totalPagamentos,
  }: {
    tituloDocumento: string;
    tituloCabecalho: string;
    pagamentosHtml: string;
    itensHtml?: string;
    modoRecibo?: boolean;
    quantidadePagamentos?: number;
    totalPagamentos?: number;
  }) => {
    if (!atendimento) return false;

    const janela = window.open('', '_blank');
    if (!janela) {
      setError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
      return false;
    }

    const totalGeral = parseSafeNumber(atendimento.total);
    const pago = parseSafeNumber(atendimento.total_pago);
    const saldoPendente = Math.max(totalGeral - pago, 0);
    const logoUrl = `${window.location.origin}/logo-sorria-leste-laranja-fundo-transparente.svg`;
    const emitidoEm = formatarAgoraDaClinica();
    const empresaTitulo = atendimento.unidade_nome
      ? `Sorria Leste - ${atendimento.unidade_nome}`
      : 'Sorria Leste';
    const empresaNome = atendimento.unidade_razao_social || 'Sorria Leste';
    const unidadeNome = atendimento.unidade_nome || 'Unidade não informada';
    const empresaEndereco = atendimento.unidade_endereco || null;
    const empresaTelefone = atendimento.unidade_telefone || null;
    const empresaEmail = atendimento.unidade_email || null;
    const empresaResponsavel = atendimento.unidade_responsavel || null;
    const empresaCnpj = atendimento.unidade_cnpj ? formatarCNPJ(atendimento.unidade_cnpj) : null;
    const rodapeRecibo = atendimento.unidade_recibo_rodape
      || 'Este recibo comprova o recebimento dos valores descritos e não substitui documento fiscal.';
    const renderInfoLine = (label: string, value: string | null) => value
      ? `<div class="info-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
      : '';
    const dadosEmpresaHtml = [
      renderInfoLine('Razão social', empresaNome),
      renderInfoLine('Unidade', unidadeNome),
      renderInfoLine('CNPJ', empresaCnpj),
      renderInfoLine('Endereço', empresaEndereco),
      renderInfoLine('Telefone', empresaTelefone),
      renderInfoLine('E-mail', empresaEmail),
      renderInfoLine('Responsável', empresaResponsavel),
    ].join('');
    const resumoHtml = modoRecibo
      ? `
        <div class="summary-grid">
          <div class="summary-item">
            <span>Pagamentos</span>
            <strong>${escapeHtml(String(quantidadePagamentos ?? 0))}</strong>
          </div>
          <div class="summary-item total">
            <span>Total recebido</span>
            <strong>${formatarMoeda(parseSafeNumber(totalPagamentos ?? pago))}</strong>
          </div>
        </div>
      `
      : `
        <strong>Total do atendimento:</strong> ${formatarMoeda(totalGeral)}<br />
        <strong>Total pago:</strong> ${formatarMoeda(pago)}<br />
        <strong>Saldo pendente:</strong> ${formatarMoeda(saldoPendente)}
      `;
    const cabecalhoHtml = modoRecibo
      ? `
        <div class="document-hero">
          <div class="hero-brand">
            <img src="${logoUrl}" alt="Logo Sorria Leste" />
            <div>
              <div class="hero-kicker">Sorria Leste</div>
              <h1>Recibo de Pagamento</h1>
              <p>Documento não fiscal</p>
            </div>
          </div>
          <div class="hero-meta">
            <div><span>Atendimento</span><strong>#${escapeHtml(String(atendimento.id))}</strong></div>
            <div><span>Emissão</span><strong>${escapeHtml(emitidoEm)}</strong></div>
          </div>
        </div>

        <div class="info-grid">
          <section class="info-card company-card">
            <h2>Dados da empresa</h2>
            ${dadosEmpresaHtml}
          </section>
          <section class="info-card">
            <h2>Dados do cliente</h2>
            <div class="info-line"><span>Nome</span><strong>${escapeHtml(atendimento.cliente_nome)}</strong></div>
            <div class="info-line"><span>CPF</span><strong>${escapeHtml(formatarCPF(atendimento.cliente_cpf))}</strong></div>
          </section>
        </div>
      `
      : `
        <div class="header">
          <div class="report-header">
            <div class="brand">
              <img src="${logoUrl}" alt="Logo Sorria Leste" />
              <div>
                <h1>${escapeHtml(tituloCabecalho)}</h1>
                <div class="brand-text">${escapeHtml(empresaTitulo)}</div>
              </div>
            </div>
            <div><strong>Nº:</strong> #${escapeHtml(String(atendimento.id))}</div>
          </div>
          <div><strong>Unidade:</strong> ${escapeHtml(atendimento.unidade_nome || '-')}</div>
          <div><strong>Atendimento:</strong> #${escapeHtml(String(atendimento.id))}</div>
          <div><strong>Status:</strong> ${escapeHtml(STATUS_CONFIG[atendimento.status as AtendimentoStatus]?.label || atendimento.status)}</div>
          <div><strong>Data de abertura:</strong> ${formatarDataHora(atendimento.created_at)}</div>
          <div><strong>Finalizado em:</strong> ${escapeHtml(formatarDataHora(atendimento.finalizado_at))}</div>
          <div><strong>Cliente:</strong> ${escapeHtml(atendimento.cliente_nome)}</div>
          <div><strong>CPF:</strong> ${escapeHtml(formatarCPF(atendimento.cliente_cpf))} <strong>Telefone:</strong> ${escapeHtml(atendimento.cliente_telefone || '-')}</div>
          <div><strong>Email:</strong> ${escapeHtml(atendimento.cliente_email || '-')}</div>
        </div>
      `;
    const rodapeHtml = modoRecibo
      ? `
        <footer class="receipt-footer">
          <p>${escapeHtml(rodapeRecibo)}</p>
          <div class="signature-row">
            <div>
              <span></span>
              <strong>${escapeHtml(empresaResponsavel || 'Responsável pela unidade')}</strong>
            </div>
            <div>
              <span></span>
              <strong>${escapeHtml(atendimento.cliente_nome)}</strong>
            </div>
          </div>
        </footer>
      `
      : '';

    janela.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(tituloDocumento)} #${escapeHtml(String(atendimento.id))}</title>
          <style>
            ${PRINT_STYLE_TOKENS_BASE}
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; }
            html { background: var(--sorria-surface); }
            body { font-family: Arial, Helvetica, sans-serif; padding: 0; margin: 0; color: var(--ink); font-size: 11.5px; line-height: 1.42; background: var(--sorria-surface); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            h1 { font-size: 22px; line-height: 1.08; margin: 0; color: var(--ink); letter-spacing: -0.35px; }
            h2 { font-size: 11px; margin: 0 0 8px; color: var(--sorria-orange-dark); text-transform: uppercase; letter-spacing: 0.7px; }
            h3 { font-size: 12px; margin: 10px 0 6px; }
            .receipt-page { width: 186mm; max-width: 100%; margin: 0 auto; }
            .header { border: 1px solid var(--sorria-orange-border); padding: 14px 14px 12px; margin-bottom: 14px; background: var(--sorria-soft); border-radius: 6px; }
            .summary { margin: 10px 0; }
            .report-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand img { width: 40px; height: 40px; object-fit: contain; }
            .brand-text { color: var(--sorria-orange); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
            .summary { background: var(--sorria-surface); border: 1px solid var(--sorria-orange-border); border-radius: 6px; padding: 10px 12px; }
            .document-hero { display: flex; justify-content: space-between; gap: 14px; align-items: center; padding: 12px 14px; border: 1px solid var(--sorria-orange-border-strong); border-radius: 12px; background: linear-gradient(135deg, var(--sorria-soft) 0%, var(--sorria-surface) 58%, var(--sorria-soft-soft) 100%); }
            .hero-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
            .hero-brand img { width: 46px; height: 46px; object-fit: contain; flex: 0 0 auto; }
            .hero-kicker { color: var(--sorria-orange-strong); font-weight: 800; letter-spacing: 0.75px; text-transform: uppercase; font-size: 10px; }
            .hero-brand p { margin: 2px 0 0; color: var(--label); font-weight: 700; }
            .hero-meta { min-width: 174px; display: grid; grid-template-columns: 1fr; gap: 6px; }
            .hero-meta div { border: 1px solid var(--sorria-orange-border); border-radius: 9px; background: color-mix(in srgb, var(--sorria-surface) 90%, transparent); padding: 7px 9px; }
            .hero-meta span, .info-line span, .summary-item span { display: block; color: var(--label); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.45px; font-weight: 700; }
            .hero-meta strong { display: block; margin-top: 1px; font-size: 12px; color: var(--ink); }
            .info-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 10px; margin-top: 10px; align-items: stretch; }
            .info-card { border: 1px solid var(--line); border-radius: 10px; padding: 10px 11px; background: var(--sorria-surface); break-inside: avoid; page-break-inside: avoid; }
            .company-card { background: var(--sorria-surface-subtle); }
            .info-line { display: grid; grid-template-columns: 92px 1fr; gap: 8px; padding: 3px 0; border-bottom: 1px solid var(--sorria-line-soft); }
            .info-line:last-child { border-bottom: 0; }
            .info-line strong { font-weight: 700; overflow-wrap: anywhere; }
            .summary { border-color: var(--sorria-orange-border-strong); background: var(--sorria-soft); break-inside: avoid; page-break-inside: avoid; }
            .summary-grid { display: grid; grid-template-columns: 1fr 1.35fr; gap: 9px; }
            .summary-item { border-radius: 10px; background: var(--sorria-surface); border: 1px solid var(--sorria-orange-border); padding: 9px 11px; }
            .summary-item strong { display: block; margin-top: 2px; font-size: 16px; line-height: 1.15; }
            .summary-item.total { background: var(--sorria-orange-strong); color: var(--sorria-surface); border-color: var(--sorria-orange-strong); }
            .summary-item.total span { color: var(--sorria-soft); }
            section { break-inside: avoid; page-break-inside: avoid; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 10px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            th, td { border-bottom: 1px solid var(--line); padding: 6px 7px; text-align: left; vertical-align: top; }
            th { background: var(--sorria-soft-soft-2); color: var(--sorria-orange-dark); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 800; }
            td { background: var(--sorria-surface); }
            tr:last-child td { border-bottom: 0; }
            ul { padding-left: 16px; margin: 0; }
            .compact-list { padding-left: 14px; margin: 0; }
            .compact-list li { margin-bottom: 3px; }
            .receipt-footer { margin-top: 22px; color: var(--label); break-inside: avoid; page-break-inside: avoid; }
            .receipt-footer p { margin: 0 0 24px; padding: 9px 11px; border-left: 3px solid var(--sorria-orange-strong); background: var(--sorria-soft); color: var(--sorria-label); }
            .signature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 42px; margin-top: 26px; }
            .signature-row span { display: block; border-top: 1px solid var(--sorria-muted-border); margin-bottom: 7px; }
            .signature-row strong { display: block; text-align: center; color: var(--ink); font-weight: 700; }
            .muted { color: var(--muted); }
            @media print {
              .receipt-page { width: 100%; max-width: none; }
              .document-hero, .info-card, .summary, table { box-shadow: none !important; }
              .document-hero { border-color: var(--sorria-orange-hover); }
              a { color: inherit; text-decoration: none; }
            }
          </style>
        </head>
        <body>
          <main class="receipt-page">
          ${cabecalhoHtml}
          <div class="summary">${resumoHtml}</div>

          ${itensHtml ? `
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
          ` : ''}

          <section>
            <h2>Pagamentos</h2>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Atendimento</th>
                  <th>Referente a</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th>Recebido por</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>${pagamentosHtml}</tbody>
            </table>
          </section>
          ${rodapeHtml}
          </main>
        </body>
      </html>
    `);
    finalizarJanelaDeImpressao(janela);
    return true;
  };

  const podeEditarProcedimentosCompartilhados = Boolean(
    podeGerenciarEdicaoRecepcao
    && atendimento
    && ['triagem', 'avaliacao'].includes(atendimento.status)
  );
  const podRemover = Boolean(
    atendimento
    && (
      atendimento.status === 'avaliacao'
      || (atendimento.status === 'triagem' && podeGerenciarEdicaoRecepcao)
    )
  );
  const podTrocarExecutor = Boolean(
    podeGerenciarEdicaoRecepcao
    && atendimento
    && ['triagem', 'avaliacao', 'aguardando_pagamento', 'em_execucao'].includes(atendimento.status)
  );
  const podEditarValor = podeEditarProcedimentosCompartilhados;
  const podEditarVendedor = podeEditarProcedimentosCompartilhados;
  const avaliadoresDisponiveis = (() => {
    if (!atendimento?.avaliador_id || !atendimento.avaliador_nome) return avaliadores;
    if (avaliadores.some((avaliador) => avaliador.id === atendimento.avaliador_id)) return avaliadores;

    return [
      { id: atendimento.avaliador_id, nome: `${atendimento.avaliador_nome} (atual)`, role: 'avaliador' },
      ...avaliadores,
    ];
  })();

  const getVendedoresDisponiveis = (item: Pick<ItemAtendimento, 'criado_por_id' | 'criado_por_nome'>) => {
    if (!item.criado_por_id || !item.criado_por_nome) return vendedores;
    if (vendedores.some((vendedor) => vendedor.id === item.criado_por_id)) return vendedores;

    return [
      { id: item.criado_por_id, nome: `${item.criado_por_nome} (atual)`, role: 'avaliador' },
      ...vendedores,
    ];
  };
  const imprimindoAlgumDocumento = imprimindoAtendimento || imprimindoRecibos;

  const imprimirAtendimento = async () => {
    if (!atendimento) return;

    try {
      setImprimindoAtendimento(true);
      const pagamentos = await carregarPagamentosParaImpressao(atendimento.id);
      const itensHtml = atendimento.itens.length
        ? atendimento.itens.map((item) => `
            <tr>
              <td>${escapeHtml(nomeProcedimentoItem(item))}</td>
              <td>${escapeHtml(item.criado_por_nome || '-')}</td>
              <td>${escapeHtml(item.executor_nome || '-')}</td>
              <td>${escapeHtml(item.status)}</td>
              <td style="text-align:right">${formatarMoeda(parseSafeNumber(item.valor))}</td>
              <td>${escapeHtml(formatarDentes(item.dentes) || item.dente_unico || '-')}</td>
              <td style="text-align:right">${formatarMoeda(parseSafeNumber(item.valor_pago))}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" class="muted">Nenhum procedimento registrado</td></tr>';
      const pagamentosHtml = renderizarTabelaPagamentosImpressao(pagamentos);

      abrirRelatorioDeImpressao({
        tituloDocumento: 'Relatório de Atendimento',
        tituloCabecalho: 'Relatório de Atendimento',
        pagamentosHtml,
        itensHtml,
      });
    } catch {
      setError('Erro ao carregar pagamentos do atendimento para impressão.');
    } finally {
      setImprimindoAtendimento(false);
    }
  };

  const imprimirRecibos = async () => {
    if (!atendimento) return;

    try {
      setImprimindoRecibos(true);
      const pagamentos = await carregarPagamentosParaImpressao(atendimento.id);
      const pagamentosHtml = renderizarTabelaPagamentosImpressao(pagamentos);
      const totalPagamentos = pagamentos.reduce((acc, pagamento) => (
        pagamento.cancelado ? acc : acc + parseSafeNumber(pagamento.valor_total)
      ), 0);

      abrirRelatorioDeImpressao({
        tituloDocumento: 'Recibo de Pagamento',
        tituloCabecalho: 'Recibo de Pagamento',
        pagamentosHtml,
        modoRecibo: true,
        quantidadePagamentos: pagamentos.filter((pagamento) => !pagamento.cancelado).length,
        totalPagamentos,
      });
    } catch {
      setError('Erro ao carregar pagamentos do atendimento para impressão.');
    } finally {
      setImprimindoRecibos(false);
    }
  };

  const renderValorCell = (item: ItemAtendimento, compact = false) => {
    const valorAtual = getValorAtualItem(item);
    const valorOriginal = getValorOriginalItem(item);
    const emEdicao = editingValorId === item.id;
    const salvando = savingValorId === item.id;
    const descontoAtivo = itemTemDesconto(item);

    if (!podEditarValor) {
      return (
        <div className={compact ? 'flex flex-col items-end gap-0.5' : 'flex flex-col items-end gap-1'}>
          {descontoAtivo && (
            <span className="text-xs text-muted-foreground line-through">
              {formatarMoeda(valorOriginal!)}
            </span>
          )}
          <span className={compact ? 'text-sm text-muted' : ''}>{formatarMoeda(valorAtual)}</span>
        </div>
      );
    }

    if (emEdicao) {
      return (
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          value={editingValorValue}
          disabled={salvando}
          onChange={(e) => setEditingValorValue(e.target.value)}
          onBlur={() => { void handleAtualizarValor(item); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleAtualizarValor(item);
            }
            if (e.key === 'Escape') {
              setEditingValorId(null);
              setEditingValorValue('');
            }
          }}
          className={`field-control w-28 px-2 py-1 text-right text-sm ${compact ? 'ml-auto' : ''}`}
        />
      );
    }

    return (
      <div className={compact ? 'flex flex-col items-end gap-0.5' : 'flex flex-col items-end gap-1'}>
        {descontoAtivo && (
          <span className="text-xs text-muted-foreground line-through">
            {formatarMoeda(valorOriginal!)}
          </span>
        )}
        <button
          onClick={() => {
            setEditingValorId(item.id);
            setEditingValorValue(String(valorAtual));
          }}
          className={`inline-flex items-center gap-1 font-medium hover:text-primary transition-colors ${
            compact ? 'text-sm text-muted' : 'text-foreground'
          }`}
          title="Clique para editar valor"
          aria-label={`Editar valor de ${nomeProcedimentoItem(item)}`}
        >
          {formatarMoeda(valorAtual)}
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    );
  };

  const renderVendedorCell = (
    key: string,
    itemIds: number[],
    item: Pick<ItemAtendimento, 'id' | 'criado_por_id' | 'criado_por_nome' | 'procedimento_nome'>,
    label: string
  ) => {
    if (!podEditarVendedor) {
      return item.criado_por_nome || '-';
    }

    const emEdicao = trocandoVendedor === key;
    const salvando = savingVendedorKey === key;
    const vendedoresItem = getVendedoresDisponiveis(item);

    if (emEdicao) {
      return (
        <select
          autoFocus
          aria-label={label}
          className="field-control max-w-52 px-2 py-1 text-sm"
          defaultValue={item.criado_por_id ?? ''}
          disabled={loadingVendedores || salvando}
          onChange={(e) => {
            const novoId = Number(e.target.value);
            if (Number.isFinite(novoId) && novoId > 0) {
              void handleAtualizarVendedor(key, itemIds, novoId);
            }
          }}
          onBlur={() => {
            if (!salvando) {
              setTrocandoVendedor(null);
            }
          }}
        >
          <option value="">
            {loadingVendedores ? 'Carregando vendedores...' : 'Selecione um vendedor'}
          </option>
          {vendedoresItem.map((vendedor) => (
            <option key={vendedor.id} value={vendedor.id}>
              {vendedor.nome}
            </option>
          ))}
        </select>
      );
    }

    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          void carregarVendedores();
          setTrocandoVendedor(key);
        }}
        className="text-left hover:text-primary-600 hover:underline transition-colors"
        title={itemIds.length > 1 ? 'Clique para trocar vendedor do grupo' : 'Clique para trocar vendedor'}
      >
        {item.criado_por_nome || <span className="text-muted italic">Sem vendedor</span>}
      </button>
    );
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
              <Button variant="secondary" onClick={imprimirAtendimento} disabled={imprimindoAlgumDocumento}>
                <Printer className="w-4 h-4 mr-1" />
                {imprimindoAtendimento ? 'Preparando impressão...' : 'Imprimir atendimento'}
              </Button>
            )}
            {podeImprimirRecibos && (
              <Button variant="secondary" onClick={imprimirRecibos} disabled={imprimindoAlgumDocumento}>
                <Printer className="w-4 h-4 mr-1" />
                {imprimindoRecibos ? 'Preparando recibos...' : 'Imprimir recibos'}
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
            {podeAcessarFinanceiro && (
              <Link href={`/atendimentos/${id}/pagamento`}>
                <Button variant={atendimento.status === 'aguardando_pagamento' ? 'primary' : 'secondary'}>
                  {labelAcessoFinanceiro}
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

      {atendimentoEhContinuacao && ['finalizado', 'encerrado'].includes(atendimento.status) && (
        <Alert type="info">
          Este atendimento foi finalizado como continuação/retorno. Os procedimentos seguiram para agenda ou ficaram sem data, então este finalizado não representa tratamento concluído.
        </Alert>
      )}

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
                  {atendimento.status === 'triagem' && podeGerenciarEdicaoRecepcao ? (
                <div className="mt-1 space-y-2">
                  <select
                    aria-label="Avaliador"
                    value={String(atendimento.avaliador_id ?? '')}
                    disabled={loadingAvaliadores || savingAvaliador}
                    onChange={(e) => { void handleAtualizarAvaliador(e.target.value); }}
                    className="field-control w-full px-3 py-2 text-sm"
                  >
                    <option value="">
                      {loadingAvaliadores ? 'Carregando avaliadores...' : 'Sem avaliador'}
                    </option>
                    {avaliadoresDisponiveis.map((avaliador) => (
                      <option key={avaliador.id} value={avaliador.id}>
                        {avaliador.nome}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { void handleAtualizarAvaliador(''); }}
                      disabled={!atendimento.avaliador_id || savingAvaliador}
                    >
                      Limpar avaliador
                    </Button>
                    {savingAvaliador && (
                      <span className="text-xs text-muted">Salvando...</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="font-medium">
                  {atendimento.avaliador_nome || 'Não definido'}
                </p>
              )}
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
            {atendimentoEhContinuacao && (
              <div>
                <p className="text-sm text-muted">Motivo do finalizado</p>
                <p className="font-medium">Continuação / retorno agendado</p>
              </div>
            )}
          </div>

          {/* Métricas de tempo */}
          <div className="mt-4 pt-4 border-t space-y-2">
            {!['finalizado', 'encerrado'].includes(atendimento.status) ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Aberto há:</span>
                <span className="font-medium text-warning-600"><ElapsedTime inicio={atendimento.created_at} /></span>
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
                <span className="font-medium text-info-600"><ElapsedTime inicio={atendimento.liberado_em} /></span>
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
                <span className="font-medium text-warning-500"><ElapsedTime inicio={atendimento.created_at} /></span>
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
                  : 'text-muted-foreground'
              }`}>
                {formatarMoeda(atendimento.total - atendimento.total_pago)}
              </p>
            </div>
          </div>
          {podeAcessarFinanceiro && (
            <div className="mt-4 pt-4 border-t">
              <Link href={`/atendimentos/${id}/pagamento`} className="block">
                <Button variant="secondary" className="w-full justify-center">
                  {labelAcessoFinanceiro}
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
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="detail-table">
              <thead>
                <tr>
                  <th className="text-left">Procedimento</th>
                  <th className="text-left">Vendedor</th>
                  <th className="text-left">Executor</th>
                  <th className="text-right">Valor</th>
                  <th className="text-center">Status</th>
                  {podRemover && (
                    <th className="w-20 text-center">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {itensAgrupados.map((entry) => {
                  if (entry.tipo === 'solo') {
                    const item = entry.item;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div>{nomeProcedimentoItem(item)}</div>
                          {item.observacoes && (
                            <p className="mt-1 text-xs text-muted-foreground">{item.observacoes}</p>
                          )}
                          {item.progresso_etapas && item.progresso_etapas.length > 0 && (
                            <ProgressoEtapas etapas={item.progresso_etapas} />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {renderVendedorCell(
                            `item:${item.id}`,
                            [item.id],
                            item,
                            `Vendedor do item ${item.id}`
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {podTrocarExecutor && ['pendente', 'pago'].includes(item.status) ? (
                            trocandoExecutor === item.id ? (
                              <select
                                autoFocus
                                className="field-control max-w-52 px-2 py-1 text-sm"
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
                        <td className="px-4 py-3 text-right">{renderValorCell(item)}</td>
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
                  const totalGrupo = grupoItens.reduce((s, i) => s + getValorAtualItem(i), 0);
                  const statusAgregado = getStatusAgregado(grupoItens);
                  const primeiro = grupoItens[0];

                  return (
                    <React.Fragment key={groupId}>
                      {/* Header do grupo */}
                      <tr
                        className="cursor-pointer bg-muted/45 transition-colors hover:bg-accent/45"
                        onClick={() => toggleGrupo(groupId)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expandido ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                            <span className="font-medium">{primeiro.procedimento_nome}</span>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                              {grupoItens.length} {grupoItens.length === 1 ? 'dente' : 'dentes'}
                            </span>
                          </div>
                          {primeiro.observacoes && (
                            <p className="ml-6 mt-1 text-xs text-muted-foreground">{primeiro.observacoes}</p>
                          )}
                          {primeiro.progresso_etapas && primeiro.progresso_etapas.length > 0 && (
                            <div className="ml-6">
                              <ProgressoEtapas etapas={primeiro.progresso_etapas} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {renderVendedorCell(
                            `group:${groupId}`,
                            grupoItens.map((item) => item.id),
                            primeiro,
                            `Vendedor do grupo ${groupId}`
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {podTrocarExecutor && grupoItens.every(i => ['pendente', 'pago'].includes(i.status)) ? (
                            trocandoExecutor === primeiro.id ? (
                              <select
                                autoFocus
                                className="field-control max-w-52 px-2 py-1 text-sm"
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
                        <tr key={item.id} className="bg-secondary/35">
                          <td className="px-4 py-2 pl-12">
                            <span className="text-muted">
                              {item.dentes
                                ? formatarDenteUnicoComFaces(item)
                                : item.dente_unico ? `Dente ${item.dente_unico}` : '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right">{renderValorCell(item, true)}</td>
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
                  <label className="mb-2 block text-sm font-medium text-foreground">Dentes *</label>
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
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Fotos e anexos da avaliação</h3>
              </div>
              <AnexosGallery
                anexos={anexosCliente}
                onUpload={handleUploadAnexoCliente}
                onDelete={handleDeleteAnexoCliente}
                onUpdate={handleUpdateAnexoCliente}
                loading={anexosClienteLoading}
                uploading={anexosClienteUploading}
                maxSizeMB={10}
                acceptTypes="image/*,.pdf,.doc,.docx,.mp4,.webm,.mov"
              />
            </div>
            <Textarea
              label="Obs / Laudo (opcional)"
              name="procObservacoes"
              value={procObservacoes}
              onChange={setProcObservacoes}
              placeholder="Observações ou laudo do procedimento..."
              rows={3}
              disabled={adicionando}
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
                <label className="mb-1 block text-sm font-medium text-foreground">
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
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="bg-muted/65 px-3 py-2">
                    <span className="text-sm font-medium text-foreground">Como distribuir nos procedimentos</span>
                  </div>
                  <div className="divide-y divide-border bg-card">
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
                              className="field-control w-28 px-3 py-2 text-right text-sm"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`flex justify-between px-3 py-2 text-sm font-medium ${
                    ok
                      ? 'bg-success-500/10 text-success-700 dark:text-success-300'
                      : 'bg-error-500/10 text-error-700 dark:text-error-300'
                  }`}>
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
