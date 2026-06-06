'use client';

import { useState, useEffect, use } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AnexosGallery, type AnexoData } from '@/components/domain';
import SeletorDentes, { type DenteFaceInput } from '@/components/SeletorDentes';
import { formatarMoeda, formatarDenteUnicoComFaces } from '@/lib/utils/formatters';
import { Search, Trash2, Pencil, Plus, CheckCircle2, Paperclip, FileText } from 'lucide-react';
import { Alert, LoadingState, PageHeader, Card, Button, Select, Input, EmptyState, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import usePageTitle from '@/lib/utils/usePageTitle';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface EtapaModelo {
  id: number;
  nome: string;
  valor: number | null;
  comissao_venda: number;
  comissao_acrescimo: number;
  comissao_execucao: number;
  ordem: number;
}

interface Procedimento {
  id: number;
  nome: string;
  valor: number;
  por_dente: number;
  tem_etapas: number;
  tem_face: number;
}

interface Usuario {
  id: number;
  nome: string;
  role: string;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  executor_id: number | null;
  executor_nome: string | null;
  criado_por_id: number | null;
  criado_por_nome: string | null;
  valor: number;
  valor_original: number | null;
  status: string;
  dentes: string | null;
  dente_unico: string | null;
  etapa_label: string | null;
  tem_etapas: number;
  observacoes: string | null;
}

interface Anexo {
  id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  descricao: string | null;
  usuario_nome: string;
  created_at: string;
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
  cliente_nome: string;
  status: string;
  avaliador_nome: string | null;
  itens: ItemAtendimento[];
  total: number;
}


export default function AvaliacaoDetalhePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  usePageTitle('Detalhes da Avaliação');
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const unitFetch = useUnitFetch();

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [anexosCliente, setAnexosCliente] = useState<AnexoData[]>([]);
  const [anexosClienteLoading, setAnexosClienteLoading] = useState(false);
  const [anexosClienteUploading, setAnexosClienteUploading] = useState(false);
  const [anexosPorItem, setAnexosPorItem] = useState<Record<number, Anexo[]>>({});
  const [anexosLoading, setAnexosLoading] = useState<Record<number, boolean>>({});

  // Form para novo procedimento
  const [procedimentoId, setProcedimentoId] = useState('');
  const [executorId, setExecutorId] = useState('');
  const [valorCustom, setValorCustom] = useState('');
  const [dentesFaces, setDentesFaces] = useState<DenteFaceInput[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [etapasModelo, setEtapasModelo] = useState<EtapaModelo[]>([]);
  const [loadingEtapas, setLoadingEtapas] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [editingValorId, setEditingValorId] = useState<number | null>(null);
  const [editingValorValue, setEditingValorValue] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarAnexosItem = async (itemId: number) => {
    setAnexosLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const res = await unitFetch(`/api/execucao/item/${itemId}/anexos`);
      if (!res.ok) {
        setAnexosPorItem((prev) => ({ ...prev, [itemId]: [] }));
        return;
      }
      const data = await res.json();
      setAnexosPorItem((prev) => ({ ...prev, [itemId]: data }));
    } catch {
      setAnexosPorItem((prev) => ({ ...prev, [itemId]: [] }));
    } finally {
      setAnexosLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const carregarAnexosDosItens = async (itens: ItemAtendimento[]) => {
    setAnexosPorItem({});
    setAnexosLoading({});
    await Promise.all(itens.map((item) => carregarAnexosItem(item.id)));
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

  const handleRemoverAnexo = (itemId: number, anexoId: number) => {
    openConfirm({
      title: 'Remover Anexo',
      message: 'Remover este anexo do prontuário?',
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await unitFetch(`/api/execucao/item/${itemId}/anexos?anexo_id=${anexoId}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json();
            toast.error(data.error || 'Erro ao remover anexo');
            return;
          }
          await carregarAnexosItem(itemId);
        } catch {
          toast.error('Erro ao remover anexo');
        }
      },
    });
  };

  const handleUploadAnexoCliente = async ({ file }: { file: File; titulo?: string; descricao?: string }) => {
    if (!user || !atendimento) return;

    setAnexosClienteUploading(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', user.id.toString());

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

      if (!res.ok) {
        const data = await res.json();
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
    { titulo, descricao }: { titulo?: string; descricao?: string }
  ) => {
    if (!atendimento) return;

    const res = await fetch(`/api/clientes/${atendimento.cliente_id}/anexos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anexo_id: anexo.id,
        titulo,
        descricao,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || 'Erro ao atualizar anexo');
      return;
    }

    await carregarAnexosCliente(atendimento.cliente_id);
    toast.success('Anexo atualizado com sucesso');
  };

  const carregarDados = async () => {
    try {
      const [resAtend, resProc] = await Promise.all([
        unitFetch(`/api/atendimentos/${id}`),
        fetch('/api/procedimentos'),
      ]);

      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);

      const procData = await resProc.json();
      setProcedimentos(procData);

      // Busca executores filtrados pela categoria do atendimento (se houver)
      const usuariosUrl = atendData.categoria_id
        ? `/api/usuarios?categoria_id=${atendData.categoria_id}`
        : '/api/usuarios';
      const resUsers = await fetch(usuariosUrl);
      const usersData = await resUsers.json();
      setExecutores(
        usersData.filter((u: Usuario & { roles?: string[] }) => {
          const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
          return roles.includes('executor') || roles.includes('ortodontista');
        })
      );

      await carregarAnexosDosItens(atendData.itens || []);
      await carregarAnexosCliente(atendData.cliente_id);
    } catch (err) {
      setError('Erro ao carregar dados');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdicionarProcedimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procedimentoId) return;

    const proc = procedimentos.find(p => p.id === parseInt(procedimentoId));

    if (proc?.por_dente && dentesFaces.length === 0) {
      setError('Selecione pelo menos um dente para este procedimento');
      return;
    }
    if (proc?.por_dente && proc?.tem_face && dentesFaces.some(d => d.faces.length === 0)) {
      setError('Selecione ao menos uma face para cada dente');
      return;
    }

    setAdicionando(true);
    setError('');

    try {
      const quantidade = proc?.por_dente ? dentesFaces.length : 1;
      const valorBase = valorCustom ? parseFloat(valorCustom) : proc?.valor || 0;
      const valorTotal = valorBase * quantidade;

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
          procedimento_id: parseInt(procedimentoId),
          executor_id: executorId ? parseInt(executorId) : null,
          criado_por_id: user?.id,
          valor: valorTotal,
          dentes: dentesParaSalvar,
          quantidade: quantidade,
          observacoes: observacoes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao adicionar');
      }

      setProcedimentoId('');
      setExecutorId('');
      setValorCustom('');
      setDentesFaces([]);
      setObservacoes('');
      setEtapasModelo([]);
      await carregarDados();
      toast.success('Procedimento adicionado!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setAdicionando(false);
    }
  };

  const handleRemoverItem = (itemId: number) => {
    openConfirm({
      title: 'Remover Procedimento',
      message: 'Deseja remover este procedimento?',
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await unitFetch(
            `/api/atendimentos/${id}/itens?item_id=${itemId}&usuario_id=${user?.id}`,
            { method: 'DELETE' }
          );

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erro ao remover');
          }

          await carregarDados();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao remover');
        }
      },
    });
  };

  const handleAtualizarExecutor = async (itemId: number, novoExecutorId: string) => {
    try {
      await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor_id: novoExecutorId ? parseInt(novoExecutorId) : null,
        }),
      });

      await carregarDados();
    } catch (err) {
      console.error('Erro ao atualizar executor:', err);
    }
  };

  const handleAtualizarValor = async (itemId: number) => {
    const novoValor = parseFloat(editingValorValue);
    setEditingValorId(null);
    if (isNaN(novoValor) || novoValor < 0) return;
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: novoValor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível salvar o novo valor');
        return;
      }
      await carregarDados();
    } catch (err) {
      console.error('Erro ao atualizar valor:', err);
      toast.error('Erro ao atualizar valor');
    }
  };

  const handleRestaurarValorOriginal = async (item: ItemAtendimento) => {
    if (item.valor_original == null) return;
    setEditingValorId(null);
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: item.valor_original }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível restaurar o valor original');
        return;
      }
      await carregarDados();
    } catch (err) {
      console.error('Erro ao restaurar valor:', err);
    }
  };

  const handleFinalizarAvaliacao = async () => {
    if (!atendimento || atendimento.itens.length === 0) {
      setError('Adicione pelo menos um procedimento');
      return;
    }

    setFinalizando(true);
    setError('');

    try {
      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aguardando_pagamento' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao finalizar');
      }

      router.push('/avaliacao');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    } finally {
      setFinalizando(false);
    }
  };

  const procedimentoSelecionado = procedimentos.find(
    p => p.id === parseInt(procedimentoId)
  );

  const calcularValorTotal = () => {
    if (!procedimentoSelecionado) return 0;
    const valorBase = valorCustom ? parseFloat(valorCustom) : procedimentoSelecionado.valor;
    const quantidade = procedimentoSelecionado.por_dente ? dentesFaces.length : 1;
    return valorBase * quantidade;
  };

  if (loading) {
    return <LoadingState text="Carregando avaliação..." />;
  }

  if (!atendimento) {
    return (
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        title="Atendimento não encontrado"
        actionLabel="Voltar para fila"
        onAction={() => router.push('/avaliacao')}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={atendimento.cliente_nome}
        icon={<Search className="h-6 w-6" />}
        description={`Avaliação · Atendimento #${atendimento.id}`}
        breadcrumb={[
          { label: 'Avaliações', href: '/avaliacao' },
          { label: atendimento.cliente_nome },
        ]}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {/* ── Adicionar Procedimento ── */}
      <Card>
        <h2 className="text-lg font-bold mb-4">
          <Plus className="w-5 h-5 inline-block mr-1.5 -mt-0.5" />
          Adicionar Procedimento
        </h2>

        <form onSubmit={handleAdicionarProcedimento} className="space-y-4">
          <SearchableSelect
            label="Procedimento *"
            name="procedimento"
            value={procedimentoId}
            onChange={async (value) => {
              setProcedimentoId(value);
              setValorCustom('');
              setDentesFaces([]);
              setEtapasModelo([]);
              if (!value) return;
              const proc = procedimentos.find(p => p.id === parseInt(value));
              if (proc?.tem_etapas) {
                setLoadingEtapas(true);
                try {
                  const res = await fetch(`/api/procedimentos/${value}`);
                  const data = await res.json();
                  setEtapasModelo(data.etapas ?? []);
                } finally {
                  setLoadingEtapas(false);
                }
              }
            }}
            options={procedimentos.map((proc) => ({
              value: String(proc.id),
              label: `${proc.nome} — ${formatarMoeda(proc.valor)}${proc.por_dente ? ' (por dente)' : ''}${proc.tem_etapas ? ' · multi-sessão' : ''}`,
            }))}
            placeholder="Selecione..."
            searchPlaceholder="Buscar procedimento..."
            emptyMessage="Nenhum procedimento encontrado"
            required
          />

          {/* Etapas do procedimento multi-sessão */}
          {procedimentoSelecionado?.tem_etapas === 1 && (
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-warning-500/10 border-b border-warning-500/20">
                <p className="text-sm font-medium text-warning-600 dark:text-warning-400">
                  {loadingEtapas ? 'Carregando etapas...' : `${etapasModelo.length} etapas de execução`}
                </p>
                <p className="text-xs text-warning-600/70 dark:text-warning-400/70 mt-0.5">
                  As etapas serão acompanhadas durante a execução
                </p>
              </div>
              {!loadingEtapas && etapasModelo.length > 0 && (
                <div className="divide-y divide-border">
                  {etapasModelo.map((etapa, idx) => (
                    <div key={etapa.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-foreground">
                        <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                        {etapa.nome}
                      </span>
                      <span className="text-muted-foreground font-medium">
                        {etapa.valor != null ? formatarMoeda(etapa.valor) : 'Proporcional'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Seletor de Dentes */}
          {procedimentoSelecionado?.por_dente === 1 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Dentes *
              </label>
              <SeletorDentes
                valor={dentesFaces}
                onChange={setDentesFaces}
                disabled={adicionando}
                mostrarFaces={procedimentoSelecionado?.tem_face === 1}
              />
              {dentesFaces.length > 0 && (
                <p className="text-sm text-primary mt-2">
                  Valor: {formatarMoeda(procedimentoSelecionado.valor)} x {dentesFaces.length} dentes = <strong>{formatarMoeda(calcularValorTotal())}</strong>
                </p>
              )}
            </div>
          )}

          <Select
            label="Executor"
            name="executor"
            value={executorId}
            onChange={(value) => setExecutorId(value)}
            options={executores.map((exec) => ({ value: String(exec.id), label: exec.nome }))}
            placeholder="Definir depois"
          />

          {procedimentoSelecionado?.tem_etapas !== 1 && (
            <Input
              label="Valor (R$)"
              name="valor"
              type="number"
              value={valorCustom}
              onChange={(value) => setValorCustom(value)}
              placeholder={procedimentoSelecionado
                ? `Padrão: ${procedimentoSelecionado.valor}`
                : 'Selecione um procedimento'}
              hint={procedimentoSelecionado && !valorCustom
                ? `Valor padrão será usado: ${formatarMoeda(procedimentoSelecionado.valor)}`
                : undefined}
            />
          )}

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

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Obs / Laudo <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Observações ou laudo do procedimento..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
              disabled={adicionando}
            />
          </div>

          <Button
            type="submit"
            variant="secondary"
            disabled={!procedimentoId || adicionando || loadingEtapas}
            loading={adicionando}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-1.5 inline-block" />
            Adicionar
          </Button>
        </form>

      </Card>

      {/* ── Lista de Procedimentos ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Procedimentos</h2>
          {atendimento.itens.length > 0 && (
            <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {atendimento.itens.length} {atendimento.itens.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>

        {atendimento.itens.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Nenhum procedimento adicionado ainda</p>
            <p className="text-xs mt-1">Use o formulário acima para adicionar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {atendimento.itens.map((item) => {
              const denteLabel = formatarDenteUnicoComFaces(item);
              return (
              <div key={item.id} className="rounded-lg border border-border bg-background">
                {/* Header do item */}
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {item.procedimento_nome}
                      </span>
                      {denteLabel && (
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                          {item.dentes ? denteLabel : `dente ${denteLabel}`}
                        </span>
                      )}
                      {item.etapa_label && (
                        <span className="text-xs bg-primary-500/10 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded font-medium">
                          {item.etapa_label}
                        </span>
                      )}
                      {item.tem_etapas === 1 && !item.etapa_label && (
                        <span className="text-xs bg-warning-500/10 text-warning-600 dark:text-warning-400 px-1.5 py-0.5 rounded font-medium">
                          multi-sessão
                        </span>
                      )}
                    </div>
                    {item.observacoes && (
                      <p className="text-xs text-muted-foreground mt-1">{item.observacoes}</p>
                    )}
                    {item.criado_por_nome && (
                      <p className="text-xs text-muted-foreground mt-0.5">Vendedor: {item.criado_por_nome}</p>
                    )}
                  </div>

                  {/* Valor */}
                  <div className="text-right shrink-0">
                    {editingValorId === item.id ? (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={editingValorValue}
                        onChange={(e) => setEditingValorValue(e.target.value)}
                        onBlur={() => handleAtualizarValor(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAtualizarValor(item.id);
                          if (e.key === 'Escape') setEditingValorId(null);
                        }}
                        className="w-28 px-2 py-1 border border-border rounded-lg text-sm text-right bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        {item.valor_original != null && item.valor_original > item.valor && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatarMoeda(item.valor_original)}
                          </span>
                        )}
                        <button
                          onClick={() => { setEditingValorId(item.id); setEditingValorValue(String(item.valor)); }}
                          className="font-bold text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1"
                          title="Clique para editar valor"
                        >
                          {formatarMoeda(item.valor)}
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </button>
                        {item.valor_original != null && item.valor_original > item.valor && (
                          <button
                            onClick={() => handleRestaurarValorOriginal(item)}
                            className="text-[10px] text-primary-600 hover:underline"
                            title="Restaurar valor original"
                          >
                            restaurar original
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {item.valor_original != null && item.valor_original > item.valor && editingValorId !== item.id && (
                  <div className="px-4 py-1 border-t border-border bg-warning-500/5">
                    <span className="text-xs font-medium text-warning-600 dark:text-warning-400">
                      Desconto: {formatarMoeda(item.valor_original - item.valor)}
                    </span>
                  </div>
                )}

                {/* Footer do item: executor + a��ões */}
                <div className="px-4 py-2 border-t border-border bg-muted/40 flex items-center justify-between gap-3">
                  <select
                    value={item.executor_id || ''}
                    onChange={(e) => handleAtualizarExecutor(item.id, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 border border-border rounded-lg text-xs bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Executor: não definido</option>
                    {executores.map((exec) => (
                      <option key={exec.id} value={exec.id}>
                        {exec.nome}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRemoverItem(item.id)}
                    className="text-error-600 hover:text-error-500 dark:text-error-400 shrink-0 p-1"
                    title="Remover procedimento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {/* Anexos */}
                <div className="px-4 py-3 border-t border-border bg-surface-muted/40 space-y-3">
                  <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" /> Anexos e Imagens
                  </h3>
                  {anexosLoading[item.id] ? (
                    <p className="text-sm text-muted-foreground">Carregando anexos...</p>
                  ) : (anexosPorItem[item.id]?.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {anexosPorItem[item.id]?.map((anexo) => {
                        const url = `/api/arquivos/${anexo.caminho}`;
                        const isImg = anexo.tipo_arquivo.startsWith('image/');
                        return (
                          <div key={anexo.id} className="border rounded-lg overflow-hidden">
                            {isImg ? (
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={anexo.nome_arquivo} className="w-full h-32 object-cover hover:opacity-90" />
                              </a>
                            ) : (
                              <a
                                href={`${url}?download=true`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center h-32 bg-surface-muted hover:bg-neutral-200"
                              >
                                <FileText className="w-8 h-8 text-neutral-400" />
                              </a>
                            )}
                            <div className="p-2">
                              <p className="font-medium text-xs truncate">{anexo.nome_arquivo}</p>
                              <p className="text-xs text-muted-foreground">{anexo.usuario_nome}</p>
                              <p className="text-xs text-muted-foreground">{(anexo.tamanho / 1024 / 1024).toFixed(2)} MB</p>
                              {anexo.descricao && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{anexo.descricao}</p>
                              )}
                              <button
                                onClick={() => handleRemoverAnexo(item.id, anexo.id)}
                                className="mt-1 text-xs text-error-600 hover:text-error-800"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum anexo</p>
                  ))}
                </div>
              </div>
            );
            })}

            {/* Total */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted rounded-lg mt-3">
              <span className="font-semibold text-sm text-muted-foreground">Total</span>
              <span className="font-bold text-lg text-foreground">{formatarMoeda(atendimento.total)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Finalizar Avaliação ── */}
      {atendimento.itens.length > 0 && (
        <div className="mt-4 md:mt-6">
          <Button
            onClick={handleFinalizarAvaliacao}
            disabled={finalizando}
            loading={finalizando}
            className="w-full text-lg py-3 shadow-lg"
          >
            <CheckCircle2 className="w-5 h-5 mr-2 inline-block" />
            Finalizar Avaliação — Encaminhar para Pagamento
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />
    </div>
  );
}
