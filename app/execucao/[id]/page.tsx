'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter, useParams } from 'next/navigation';
import { formatarDataHora } from '@/lib/utils/formatters';
import { StatusBadge, ProntuarioDrawer } from '@/components/domain';
import {
  Activity, Save, Paperclip, FileText,
  CheckCircle2, Circle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Alert, LoadingState, Modal, PageHeader, Card, Button, EmptyState, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import usePageTitle from '@/lib/utils/usePageTitle';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { getFaceDisplay } from '@/lib/utils/denteFaces';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Etapa {
  id: number;
  item_atendimento_id: number;
  dente: string;
  face: string;
  status: 'pendente' | 'concluido';
  concluido_at: string | null;
  concluido_por_nome: string | null;
  prontuario_id: number | null;
  prontuario_descricao: string | null;
  prontuario_observacoes: string | null;
  prontuario_created_at: string | null;
  prontuario_autor: string | null;
}

interface ItemAtendimento {
  id: number;
  atendimento_id: number;
  procedimento_id: number;
  executor_id: number | null;
  criado_por_id: number | null;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  adicionado_em_execucao: number;
  dentes: string | null;
  quantidade: number;
  por_dente: number;
  status: string;
  created_at: string;
  concluido_at: string | null;
  procedimento_nome: string;
  executor_nome: string | null;
  criado_por_nome: string | null;
  cliente_nome: string;
  cliente_id: number;
  etapas: Etapa[];
  etapa_label: string | null;
  tem_etapas: number;
  itens_elegiveis_evolucao?: ItemElegivelEvolucao[];
}

interface ItemElegivelEvolucao {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  status: string;
  concluido_at: string | null;
}

interface Procedimento {
  id: number;
  nome: string;
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

interface Prontuario {
  id: number;
  descricao: string;
  observacoes: string | null;
  usuario_nome: string;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_CHARS = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExecucaoProcedimentoPage() {
  usePageTitle('Execução de Procedimento');
  const params = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const unitFetch = useUnitFetch();
  const { toast } = useToast();

  const [item, setItem] = useState<ItemAtendimento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info'; confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const openConfirm = (cfg: Omit<typeof confirmDialog, 'isOpen'>) =>
    setConfirmDialog({ ...cfg, isOpen: true });

  // Procedimentos disponíveis (para adicionar novo)
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [showNovoProcedimento, setShowNovoProcedimento] = useState(false);
  const [novoProcId, setNovoProcId] = useState('');

  // Anexos
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [descricaoAnexo, setDescricaoAnexo] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prontuário do item (para procedimentos sem etapas)
  const [prontuario, setProntuario] = useState<Prontuario | null>(null);
  const [descricaoProntuario, setDescricaoProntuario] = useState('');
  const [observacoesProntuario, setObservacoesProntuario] = useState('');
  const [salvandoProntuario, setSalvandoProntuario] = useState(false);
  const [erroProntuario, setErroProntuario] = useState('');
  const [evolucaoModalOpen, setEvolucaoModalOpen] = useState(false);
  const [itensSelecionadosEvolucao, setItensSelecionadosEvolucao] = useState<number[]>([]);
  const [concluindoEvolucao, setConcluindoEvolucao] = useState(false);

  // Etapas — estado de cada uma (aberta/formulário)
  const [etapaAberta, setEtapaAberta] = useState<number | null>(null);
  const [etapaDescricao, setEtapaDescricao] = useState<Record<number, string>>({});
  const [etapaObservacoes, setEtapaObservacoes] = useState<Record<number, string>>({});
  const [salvandoEtapa, setSalvandoEtapa] = useState<number | null>(null);

  // Drawer de prontuário do paciente
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (params.id) {
      carregarItem();
      carregarProcedimentos();
      carregarAnexos();
      carregarProntuario();
    }
    // A carga desta tela deve reagir apenas à troca do item na URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function carregarItem() {
    try {
      const res = await unitFetch(`/api/execucao/item/${params.id}`);
      if (!res.ok) throw new Error('Item não encontrado');
      const data = await res.json();
      setItem(data);
      // Pré-preenche textos de prontuário de etapas já salvas
      if (data.etapas) {
        const desc: Record<number, string> = {};
        const obs: Record<number, string> = {};
        for (const e of data.etapas as Etapa[]) {
          if (e.prontuario_descricao) desc[e.id] = e.prontuario_descricao;
          if (e.prontuario_observacoes) obs[e.id] = e.prontuario_observacoes;
        }
        setEtapaDescricao(desc);
        setEtapaObservacoes(obs);
      }
    } catch {
      setError('Erro ao carregar procedimento');
    } finally {
      setLoading(false);
    }
  }

  async function carregarProcedimentos() {
    const res = await fetch('/api/procedimentos');
    setProcedimentos(await res.json());
  }

  async function carregarAnexos() {
    const res = await unitFetch(`/api/execucao/item/${params.id}/anexos`);
    setAnexos(await res.json());
  }

  async function carregarProntuario() {
    const res = await unitFetch(`/api/execucao/item/${params.id}/prontuario`);
    const data = await res.json();
    if (data.prontuario) {
      setProntuario(data.prontuario);
      setDescricaoProntuario(data.prontuario.descricao);
      setObservacoesProntuario(data.prontuario.observacoes || '');
    }
  }

  // ─── Ações do item ─────────────────────────────────────────────────────────

  async function pegarProcedimento() {
    if (!item) return;
    const res = await unitFetch(`/api/atendimentos/${item.atendimento_id}/itens/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executor_id: user?.id }),
    });
    if (res.ok) carregarItem();
  }

  async function iniciarExecucao() {
    if (!item) return;
    const res = await unitFetch(`/api/atendimentos/${item.atendimento_id}/itens/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'executando' }),
    });
    if (res.ok) carregarItem();
  }

  function abrirModalEvolucao() {
    if (!item) return;
    setItensSelecionadosEvolucao([item.id]);
    setErroProntuario('');
    setEvolucaoModalOpen(true);
  }

  async function concluirEvolucao() {
    if (!item) return;
    if (descricaoProntuario.trim().length < MIN_CHARS) {
      setErroProntuario(`Mínimo ${MIN_CHARS} caracteres`);
      return;
    }

    setConcluindoEvolucao(true);
    setErroProntuario('');
    try {
      const res = await unitFetch('/api/execucao/evolucoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_ids: itensSelecionadosEvolucao,
          descricao: descricaoProntuario,
          observacoes: observacoesProntuario,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroProntuario(data.error || 'Erro ao concluir evolução');
        return;
      }

      setEvolucaoModalOpen(false);
      if (data.atendimento_finalizado) {
        toast.success('Todos os procedimentos concluídos. Atendimento finalizado.');
      } else if (data.atendimento_voltou_para_pagamento) {
        toast.success('Procedimentos concluídos. Atendimento voltou para pagamento.');
      } else {
        toast.success('Evolução salva e procedimentos concluídos.');
      }
      router.push('/execucao');
    } catch {
      setErroProntuario('Erro ao concluir evolução');
    } finally {
      setConcluindoEvolucao(false);
    }
  }

  function marcarComoConcluidoIndividual() {
    if (!item) return;
    if (!prontuario) {
      toast.warning('Preencha o prontuário antes de concluir.');
      return;
    }
    openConfirm({
      title: 'Concluir Procedimento',
      message: 'Marcar este procedimento como concluído? Esta ação não pode ser desfeita.',
      confirmLabel: 'Concluir',
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const res = await unitFetch(`/api/atendimentos/${item.atendimento_id}/itens/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluido' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.atendimento_finalizado || data.atendimento_voltou_para_pagamento) {
            toast.success('Procedimento concluído.');
            router.push('/execucao');
          } else {
            carregarItem();
          }
        }
      },
    });
  }

  async function salvarProntuario() {
    if (!user) return;
    if (descricaoProntuario.trim().length < MIN_CHARS) {
      setErroProntuario(`Mínimo ${MIN_CHARS} caracteres`);
      return;
    }
    setSalvandoProntuario(true);
    setErroProntuario('');
    try {
      const res = await unitFetch(`/api/execucao/item/${params.id}/prontuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: user.id, descricao: descricaoProntuario, observacoes: observacoesProntuario }),
      });
      if (res.ok) {
        const data = await res.json();
        setProntuario(data.prontuario);
        toast.success('Prontuário salvo.');
      } else {
        const data = await res.json();
        setErroProntuario(data.error || 'Erro ao salvar');
      }
    } catch {
      setErroProntuario('Erro ao salvar prontuário');
    } finally {
      setSalvandoProntuario(false);
    }
  }

  // ─── Etapas ────────────────────────────────────────────────────────────────

  async function salvarEConcluirEtapa(etapa: Etapa) {
    if (!user) return;
    const descricao = etapaDescricao[etapa.id] ?? '';
    if (descricao.trim().length < MIN_CHARS) {
      toast.warning(`Prontuário deve ter no mínimo ${MIN_CHARS} caracteres`);
      return;
    }
    setSalvandoEtapa(etapa.id);
    try {
      // 1. Salva prontuário da etapa
      const resPront = await unitFetch(`/api/execucao/etapa/${etapa.id}/prontuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: user.id,
          descricao,
          observacoes: etapaObservacoes[etapa.id] ?? '',
        }),
      });
      if (!resPront.ok) {
        const d = await resPront.json();
        toast.error(d.error || 'Erro ao salvar prontuário');
        return;
      }

      // 2. Conclui a etapa
      const resConcluir = await unitFetch(`/api/execucao/etapa/${etapa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: user.id }),
      });
      const dataConcluir = await resConcluir.json();
      if (!resConcluir.ok) {
        toast.error(dataConcluir.error || 'Erro ao concluir etapa');
        return;
      }

      setEtapaAberta(null);
      toast.success('Etapa concluída!');

      if (dataConcluir.atendimento_finalizado) {
        toast.success('Todos os procedimentos concluídos! Atendimento encaminhado para revisão.');
        router.push('/execucao');
        return;
      }

      if (dataConcluir.item_concluido) {
        toast.success('Todas as etapas concluídas! Procedimento finalizado.');
      }

      await carregarItem();
    } catch {
      toast.error('Erro ao processar etapa');
    } finally {
      setSalvandoEtapa(null);
    }
  }

  // ─── Adicionar procedimento ────────────────────────────────────────────────

  async function adicionarProcedimento() {
    if (!item || !novoProcId) { toast.warning('Selecione um procedimento'); return; }
    const res = await unitFetch(`/api/atendimentos/${item.atendimento_id}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedimento_id: parseInt(novoProcId) }),
    });
    if (res.ok) {
      setShowNovoProcedimento(false);
      setNovoProcId('');
      toast.success('Procedimento adicionado e vinculado a você.');
      router.push('/execucao');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Erro ao adicionar procedimento');
    }
  }

  // ─── Anexos ────────────────────────────────────────────────────────────────

  async function enviarAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setEnviandoAnexo(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', user.id.toString());
      formData.append('descricao', descricaoAnexo);
      const res = await unitFetch(`/api/execucao/item/${params.id}/anexos`, { method: 'POST', body: formData });
      if (res.ok) { setDescricaoAnexo(''); carregarAnexos(); if (fileInputRef.current) fileInputRef.current.value = ''; }
      else { const d = await res.json(); toast.error(d.error || 'Erro ao enviar'); }
    } catch { /* noop */ }
    setEnviandoAnexo(false);
  }

  function removerAnexo(anexoId: number) {
    openConfirm({
      title: 'Remover Anexo', message: 'Remover este anexo?', confirmLabel: 'Remover', type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const res = await unitFetch(`/api/execucao/item/${params.id}/anexos?anexo_id=${anexoId}`, { method: 'DELETE' });
        if (res.ok) carregarAnexos();
      },
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingState text="Carregando procedimento..." />;
  if (!item) return (
    <EmptyState icon={<Activity className="w-7 h-7" />} title="Procedimento não encontrado"
      actionLabel="Voltar" onAction={() => router.push('/execucao')} />
  );

  const isMeu = item.executor_id === user?.id;
  const isDisponivel = item.executor_id === null;
  const temEtapas = item.etapas.length > 0;
  const isMultiSessao = item.tem_etapas === 1; // canal, implante — sessões via procedimento_etapas_modelo
  const etapasConcluidas = item.etapas.filter(e => e.status === 'concluido').length;
  const progresso = temEtapas ? Math.round((etapasConcluidas / item.etapas.length) * 100) : 0;

  // Detecta se item tem múltiplos dentes (legado) ou dente único (novo modelo)
  const dentesUnicos = new Set(item.etapas.map(e => e.dente));
  const temMultiplosDentes = dentesUnicos.size > 1;

  // Agrupa etapas por dente (usado apenas para itens legados com múltiplos dentes)
  const etapasPorDente = temMultiplosDentes
    ? item.etapas.reduce<Record<string, Etapa[]>>((acc, e) => {
        if (!acc[e.dente]) acc[e.dente] = [];
        acc[e.dente].push(e);
        return acc;
      }, {})
    : {};

  const denteLabel = temEtapas && !temMultiplosDentes ? ` · Dente ${item.etapas[0].dente}` : '';
  const canAct = isMeu && item.status === 'executando';

  function renderEtapaItem(etapa: Etapa) {
    const concluida = etapa.status === 'concluido';
    const aberta = etapaAberta === etapa.id;
    const descricao = etapaDescricao[etapa.id] ?? '';
    const salvando = salvandoEtapa === etapa.id;
    const faceDisplay = getFaceDisplay(etapa.face, etapa.dente);

    return (
      <div key={etapa.id} className={`rounded-lg border transition-colors ${
        concluida
          ? 'border-success-200 bg-success-50 dark:border-success-500/30 dark:bg-success-500/12'
          : 'border-border/70 bg-surface'
      }`}>
        {/* Linha da etapa */}
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          onClick={() => {
            if (concluida || !canAct) return;
            setEtapaAberta(aberta ? null : etapa.id);
          }}
          disabled={concluida || !canAct}
        >
          {concluida
            ? <CheckCircle2 className="w-5 h-5 text-success-500 dark:text-success-200 shrink-0" />
            : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{faceDisplay.sigla}</span>
              <span className="text-sm text-muted">— {faceDisplay.label}</span>
            </div>
            {concluida && etapa.concluido_por_nome && (
              <p className="text-xs text-muted mt-0.5">
                Concluída por {etapa.concluido_por_nome} · {formatarDataHora(etapa.concluido_at!)}
              </p>
            )}
          </div>
          {!concluida && canAct && (
            aberta
              ? <ChevronUp className="w-4 h-4 text-muted shrink-0" />
              : <ChevronDown className="w-4 h-4 text-muted shrink-0" />
          )}
        </button>

        {/* Prontuário de etapa concluída (leitura) */}
        {concluida && etapa.prontuario_descricao && (
          <div className="px-4 pb-3 ml-8">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Prontuário</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{etapa.prontuario_descricao}</p>
            {etapa.prontuario_observacoes && (
              <p className="text-xs text-muted mt-1 italic">{etapa.prontuario_observacoes}</p>
            )}
            <p className="text-xs text-muted mt-1">por {etapa.prontuario_autor}</p>
          </div>
        )}

        {/* Formulário de prontuário inline */}
        {aberta && !concluida && canAct && (
          <div className="px-4 pb-4 ml-8 space-y-3 border-t border-border pt-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Descrição do que foi feito *
              </label>
              <textarea
                value={descricao}
                onChange={e => setEtapaDescricao(prev => ({ ...prev, [etapa.id]: e.target.value }))}
                placeholder="Descreva detalhadamente o que foi feito nesta face do dente..."
                rows={4}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none ${
                  descricao.length < MIN_CHARS && descricao.length > 0
                ? 'border-error-300 dark:border-error-500/50'
                : descricao.length >= MIN_CHARS
                      ? 'border-success-300 dark:border-success-500/50'
                      : 'border-input'
                }`}
              />
              <div className="flex justify-between mt-1">
                <span className={`text-xs ${descricao.length < MIN_CHARS ? 'text-error-600 dark:text-error-100' : 'text-success-600 dark:text-success-100'}`}>
                  {descricao.length}/{MIN_CHARS} mín.
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Observações (opcional)</label>
              <textarea
                value={etapaObservacoes[etapa.id] ?? ''}
                onChange={e => setEtapaObservacoes(prev => ({ ...prev, [etapa.id]: e.target.value }))}
                placeholder="Cuidados pós-procedimento, retornos, etc..."
                rows={2}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
              />
            </div>
            <Button
              onClick={() => salvarEConcluirEtapa(etapa)}
              disabled={descricao.trim().length < MIN_CHARS || salvando}
              loading={salvando}
              className="w-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5 inline-block" />
              Salvar e Concluir Etapa
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}
        icon={<Activity className="w-7 h-7" />}
        description={`${item.cliente_nome} · Atendimento #${item.atendimento_id}${denteLabel}`}
        breadcrumb={[{ label: 'Execução', href: '/execucao' }, { label: item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome }]}
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {/* ── Card principal ── */}
      <Card>
        <div className="flex justify-between items-start mb-4">
          <StatusBadge type="item" status={item.status} item={item} />
          {isDisponivel && (
            <span className="px-3 py-1 text-sm font-semibold rounded bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-100">
              Disponível
            </span>
          )}
          {isMeu && item.status !== 'concluido' && (
            <span className="px-3 py-1 text-sm font-semibold rounded bg-info-100 text-info-800 dark:bg-info-900/30 dark:text-info-100">
              Meu procedimento
            </span>
          )}
        </div>

        {item.concluido_at && (
          <div className="bg-success-50 border border-success-200 p-3 rounded mb-4 dark:bg-success-900/25 dark:border-success-900/35">
            <p className="text-sm text-success-800 dark:text-success-100">Concluído em {formatarDataHora(item.concluido_at)}</p>
          </div>
        )}

        <div className="text-sm text-muted mb-4">
          Adicionado em {formatarDataHora(item.created_at)}
          {item.criado_por_nome && ` por ${item.criado_por_nome}`}
        </div>

        {/* Ações */}
        <div className="space-y-3">
          <Button
            onClick={() => setDrawerOpen(true)}
            variant="ghost"
            className="w-full"
          >
            <FileText className="w-4 h-4 mr-1.5 inline-block" />
            Ver prontuário do paciente
          </Button>
          {/* Sessão atual para procedimentos multi-sessão */}
          {isMultiSessao && item.etapa_label && (
            <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800 dark:bg-primary-900/22 dark:border-primary-900/40 dark:text-primary-100">
              <strong>Sessão sendo executada:</strong> {item.etapa_label}
            </div>
          )}
          {isDisponivel && item.status === 'pago' && (
            <Button onClick={pegarProcedimento} variant="secondary" className="w-full text-lg py-3">
              Pegar Este Procedimento
            </Button>
          )}
          {isMeu && item.status === 'pago' && (
            <Button onClick={iniciarExecucao} className="w-full text-lg py-3">
              Iniciar Execução
            </Button>
          )}
          {/* Concluir manual só para itens SEM etapas por dente */}
          {isMeu && item.status === 'executando' && !temEtapas && (
            <div className="space-y-2">
              {isMultiSessao ? (
                <>
                  {!prontuario && (
                    <div className="p-3 bg-warning-50 border border-warning-300 rounded-lg text-sm text-warning-800 dark:bg-warning-900/22 dark:border-warning-900/35 dark:text-warning-100">
                      <strong>Prontuário pendente:</strong> preencha abaixo antes de concluir.
                    </div>
                  )}
                  <Button onClick={marcarComoConcluidoIndividual} disabled={!prontuario} className="w-full text-lg py-3">
                    {prontuario ? `Concluir Sessão (${item.etapa_label ?? 'sessão'})` : 'Preencha o Prontuário para Concluir'}
                  </Button>
                </>
              ) : (
                <Button onClick={abrirModalEvolucao} className="w-full text-lg py-3">
                  Criar Evolução e Concluir
                </Button>
              )}
            </div>
          )}
          {/* Para itens COM etapas por dente: conclusão é automática */}
          {isMeu && item.status === 'executando' && temEtapas && etapasConcluidas < item.etapas.length && (
            <div className="p-3 bg-info-50 border border-info-200 rounded-lg text-sm text-info-800 dark:bg-info-900/22 dark:border-info-900/35 dark:text-info-100">
              Conclua todas as etapas abaixo para finalizar o procedimento automaticamente.
            </div>
          )}
          {item.status === 'concluido' && (
            <div className="w-full text-center text-muted-foreground py-3 bg-surface-muted rounded-lg">
              Procedimento concluído
            </div>
          )}
        </div>
      </Card>

      {/* ── Etapas por dente/face ── */}
      {temEtapas && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              {temMultiplosDentes ? 'Etapas do Procedimento' : `Faces do Dente ${item.etapas[0]?.dente}`}
            </h2>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                etapasConcluidas === item.etapas.length
                  ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-100'
                  : 'bg-muted/80 dark:bg-muted/40 text-muted-foreground'
              }`}>
                {etapasConcluidas}/{item.etapas.length} concluídas
              </span>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="w-full bg-muted/70 rounded-full h-2 mb-5">
            <div
              className="bg-success-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>

          {temMultiplosDentes ? (
            /* Layout legado: agrupado por dente */
            <div className="space-y-4">
              {Object.entries(etapasPorDente)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([dente, etapas]) => {
                  const concluidas = etapas.filter(e => e.status === 'concluido').length;
                  return (
                    <div key={dente}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full dark:text-primary-100 dark:bg-primary-900/22">
                          Dente {dente}
                        </span>
                        <span className="text-xs text-muted">{concluidas}/{etapas.length}</span>
                      </div>
                      <div className="space-y-1 ml-2">
                        {etapas.map(etapa => renderEtapaItem(etapa))}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            /* Layout simplificado: lista direta de faces */
            <div className="space-y-1">
              {item.etapas.map(etapa => renderEtapaItem(etapa))}
            </div>
          )}
        </Card>
      )}

      {!temEtapas && isMultiSessao && ((isMeu && item.status === 'executando') || prontuario) && (
        <Card className={!prontuario && item.status === 'executando' ? 'ring-2 ring-error-400' : ''}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              Prontuário {!prontuario && item.status === 'executando' && <span className="text-error-600 dark:text-error-100">*</span>}
            </h2>
            {prontuario && (
              <span className="px-3 py-1 text-sm font-semibold rounded bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-100">Preenchido</span>
            )}
          </div>

          {isMeu && item.status === 'executando' ? (
            <div className="space-y-4">
              {erroProntuario && (
                <div className="p-3 bg-error-50 border border-error-200 rounded-lg text-sm text-error-700 dark:bg-error-900/22 dark:border-error-900/35 dark:text-error-100">{erroProntuario}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Descrição do Procedimento *</label>
                <textarea
                  value={descricaoProntuario}
                  onChange={e => setDescricaoProntuario(e.target.value)}
                  placeholder="Descreva o procedimento realizado, materiais, técnicas..."
                  className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
                    descricaoProntuario.trim().length < MIN_CHARS ? 'border-error-300 dark:border-error-500/50' : 'border-success-300 dark:border-success-500/50'
                  }`}
                  rows={5}
                />
                <span className={`text-xs ${descricaoProntuario.trim().length < MIN_CHARS ? 'text-error-600 dark:text-error-100' : 'text-success-600 dark:text-success-100'}`}>
                  {descricaoProntuario.trim().length}/{MIN_CHARS} mín.
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observações (opcional)</label>
                <textarea
                  value={observacoesProntuario}
                  onChange={e => setObservacoesProntuario(e.target.value)}
                  placeholder="Cuidados pós-procedimento, retornos..."
                  className="w-full border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <Button
                onClick={salvarProntuario}
                disabled={salvandoProntuario || descricaoProntuario.trim().length < MIN_CHARS}
                loading={salvandoProntuario}
                className="w-full"
              >
                <Save className="w-4 h-4 mr-1.5 inline-block" />
                {prontuario ? 'Atualizar Prontuário' : 'Salvar Prontuário'}
              </Button>
            </div>
          ) : prontuario ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Descrição</label>
                <div className="bg-surface-secondary p-4 rounded-lg border">
                  <p className="text-foreground whitespace-pre-wrap">{prontuario.descricao}</p>
                </div>
              </div>
              {prontuario.observacoes && (
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">Observações</label>
                  <div className="bg-surface-secondary p-4 rounded-lg border">
                    <p className="text-foreground whitespace-pre-wrap">{prontuario.observacoes}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted">
                Por <strong>{prontuario.usuario_nome}</strong> em {formatarDataHora(prontuario.created_at)}
              </p>
            </div>
          ) : null}
        </Card>
      )}

      {/* ── Evolução do item concluído ── */}
      {!temEtapas && !isMultiSessao && prontuario && (item.status === 'concluido' || !isMeu) && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Evolução Clínica</h2>
            <span className="px-3 py-1 text-sm font-semibold rounded bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-100">Preenchido</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">Descrição</label>
              <div className="bg-surface-secondary p-4 rounded-lg border">
                <p className="text-foreground whitespace-pre-wrap">{prontuario.descricao}</p>
              </div>
            </div>
            {prontuario.observacoes && (
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Observações</label>
                <div className="bg-surface-secondary p-4 rounded-lg border">
                  <p className="text-foreground whitespace-pre-wrap">{prontuario.observacoes}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted">
              Por <strong>{prontuario.usuario_nome}</strong> em {formatarDataHora(prontuario.created_at)}
            </p>
          </div>
        </Card>
      )}

      {!temEtapas && ((isMeu && item.status === 'executando') || anexos.length > 0) && (
        <Card>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> Anexos do Procedimento
          </h2>
          {isMeu && item.status === 'executando' && (
            <div className="p-4 border-2 border-dashed border-input rounded-lg mb-4">
              <input type="text" value={descricaoAnexo} onChange={e => setDescricaoAnexo(e.target.value)}
                placeholder="Descrição (opcional)" className="w-full border border-input rounded px-3 py-2 text-sm mb-2" />
              <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={enviarAnexo} disabled={enviandoAnexo}
                className="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-900/30 file:text-primary-700 dark:file:text-primary-100" />
              {enviandoAnexo && <p className="mt-2 text-sm text-primary-600 dark:text-primary-100">Enviando...</p>}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {anexos.length > 0 ? anexos.map(anexo => {
              const url = `/api/arquivos/${anexo.caminho}`;
              const isImg = anexo.tipo_arquivo.startsWith('image/');
              const isVid = anexo.tipo_arquivo.startsWith('video/');
              return (
                <div key={anexo.id} className="border rounded-lg overflow-hidden">
                  {isImg ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* Uploads clínicos vêm do R2 via rota dinâmica; next/image não cobre esse caso sem loader extra. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={anexo.nome_arquivo} className="w-full h-32 object-cover hover:opacity-90" />
                    </a>
                  ) : isVid ? (
                    <video src={url} controls className="w-full h-32 object-cover bg-black" />
                  ) : (
                    <a href={`${url}?download=true`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center h-32 bg-surface-muted hover:bg-muted/80">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </a>
                  )}
                  <div className="p-2">
                    <p className="font-medium text-xs truncate">{anexo.nome_arquivo}</p>
                    <p className="text-xs text-muted-foreground">{(anexo.tamanho / 1024 / 1024).toFixed(2)} MB</p>
                    {isMeu && item.status === 'executando' && (
                      <button onClick={() => removerAnexo(anexo.id)} className="mt-1 text-xs text-error-600 dark:text-error-100 hover:text-error-800 dark:hover:text-error-200">
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : <p className="text-muted text-xs col-span-2">Nenhum anexo</p>}
          </div>
        </Card>
      )}

      {/* ── Adicionar procedimento ── */}
      {isMeu && (
        <Card>
          <h2 className="text-lg font-bold mb-4">Ações Adicionais</h2>
          <Button onClick={() => setShowNovoProcedimento(true)} className="w-full">
            Adicionar Procedimento para {item.cliente_nome}
          </Button>
        </Card>
      )}

      {isDisponivel && (
        <div className="bg-warning-50 border border-warning-200 p-4 rounded-lg dark:bg-warning-900/22 dark:border-warning-900/35">
          <p className="text-sm text-warning-800 dark:text-warning-100">
            Este procedimento está disponível. <strong>Pegue-o primeiro</strong> para adicionar novos procedimentos.
          </p>
        </div>
      )}

      {/* ── Modal: Adicionar procedimento ── */}
      <Modal isOpen={showNovoProcedimento} onClose={() => { setShowNovoProcedimento(false); setNovoProcId(''); }}
        size="lg"
        className="sm:h-[80vh]"
        title="Adicionar Procedimento">
        <p className="text-sm text-muted-foreground mb-4">Para: <strong>{item.cliente_nome}</strong></p>
        <SearchableSelect
          label="Procedimento *"
          name="novo_procedimento_id"
          value={novoProcId}
          onChange={setNovoProcId}
          options={procedimentos.map((procedimento) => ({
            value: String(procedimento.id),
            label: procedimento.nome,
          }))}
          placeholder="Selecione..."
          searchPlaceholder="Buscar procedimento..."
          emptyMessage="Nenhum procedimento encontrado"
          className="mb-4"
          required
        />
        <Alert type="warning">Ao adicionar, a venda e a execução ficarão vinculadas a você. Se houver saldo, o procedimento aparecerá como a cobrar.</Alert>
        <div className="flex gap-2 mt-4">
          <Button onClick={adicionarProcedimento} className="flex-1">Adicionar</Button>
          <Button variant="secondary" onClick={() => { setShowNovoProcedimento(false); setNovoProcId(''); }} className="flex-1">Cancelar</Button>
        </div>
      </Modal>

      <Modal
        isOpen={evolucaoModalOpen}
        onClose={() => {
          if (!concluindoEvolucao) setEvolucaoModalOpen(false);
        }}
        size="lg"
        title="Nova Evolução Clínica"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Procedimentos desta evolução</p>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {(item.itens_elegiveis_evolucao ?? [{
                id: item.id,
                atendimento_id: item.atendimento_id,
                procedimento_nome: item.procedimento_nome,
                etapa_label: item.etapa_label,
                status: item.status,
                concluido_at: item.concluido_at,
              }]).map((elegivel) => {
                const isAtual = elegivel.id === item.id;
                const checked = itensSelecionadosEvolucao.includes(elegivel.id);
                return (
                  <label key={elegivel.id} className="flex items-start gap-3 rounded-md border border-border/70 p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={isAtual || concluindoEvolucao}
                      onChange={(event) => {
                        setItensSelecionadosEvolucao((prev) => {
                          if (event.target.checked) return [...new Set([...prev, elegivel.id])];
                          return prev.filter((id) => id !== elegivel.id || id === item.id);
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {elegivel.etapa_label ? `${elegivel.procedimento_nome} — ${elegivel.etapa_label}` : elegivel.procedimento_nome}
                        {isAtual && <span className="ml-2 text-xs text-muted">(atual)</span>}
                      </span>
                      <span className="block text-xs text-muted">Status: {elegivel.status}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {erroProntuario && (
            <Alert type="error">{erroProntuario}</Alert>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Descrição clínica *</label>
            <textarea
              value={descricaoProntuario}
              onChange={e => setDescricaoProntuario(e.target.value)}
              placeholder="Descreva a evolução, procedimentos realizados, materiais, técnicas e condutas..."
              className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
                descricaoProntuario.trim().length < MIN_CHARS ? 'border-error-300 dark:border-error-500/50' : 'border-success-300 dark:border-success-500/50'
              }`}
              rows={6}
              disabled={concluindoEvolucao}
            />
            <span className={`text-xs ${descricaoProntuario.trim().length < MIN_CHARS ? 'text-error-600 dark:text-error-100' : 'text-success-600 dark:text-success-100'}`}>
              {descricaoProntuario.trim().length}/{MIN_CHARS} mín.
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Observações (opcional)</label>
            <textarea
              value={observacoesProntuario}
              onChange={e => setObservacoesProntuario(e.target.value)}
              placeholder="Cuidados pós-procedimento, retornos, orientações..."
              className="w-full border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              rows={3}
              disabled={concluindoEvolucao}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={concluirEvolucao}
              disabled={concluindoEvolucao || itensSelecionadosEvolucao.length === 0 || descricaoProntuario.trim().length < MIN_CHARS}
              loading={concluindoEvolucao}
              className="flex-1"
            >
              Concluir Selecionados
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEvolucaoModalOpen(false)}
              disabled={concluindoEvolucao}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />

      <ProntuarioDrawer
        clienteId={drawerOpen ? item.cliente_id : null}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
