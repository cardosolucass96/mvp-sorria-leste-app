'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AgendamentoCompleto, Cliente, FollowupTarefaCompleta, TermoCampoDraft, TermoDigital, VinculoCliente } from '@/lib/types';
import {
  User,
  ClipboardList,
  Activity,
  CreditCard,
  Clock,
  FileText,
  Users,
  Plus,
  Trash2,
  Search,
  CalendarDays,
  MessageCircle,
  Paperclip,
  Printer,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { PageHeader, Card, Button, Alert, LoadingState, EmptyState, ConfirmDialog, Tabs, Modal, Input, Textarea } from '@/components/ui';
import { StatusBadge, ClienteForm, ClienteFormData, AnexosGallery } from '@/components/domain';
import { formatarData, formatarDataHora, formatarMoeda, formatarCPF, formatarCNPJ, formatarTelefone, formatarDentes, parseDentesLabels, nomeProcedimentoItem, formatarAgoraDaClinica } from '@/lib/utils/formatters';
import { finalizarJanelaDeImpressao } from '@/lib/utils/print';
import { getOrigemLabel } from '@/lib/constants/origens';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';
import { FOLLOWUP_STATUS_LABELS, FOLLOWUP_TIPO_CONFIG } from '@/lib/constants/followup';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { buildTermoPrintableDocument } from '@/lib/helpers/termosDocumento';
import usePageTitle from '@/lib/utils/usePageTitle';
import { getFormaPagamentoSnapshotLabel } from '@/lib/utils/formasPagamento';
import { PRINT_STYLE_TOKENS_BASE, PRINT_STYLE_TOKENS_CLIENT_HEADER } from '@/lib/printStyles';
import { calculateAgeFromDateOnly, getStoredUtcInstantMillis } from '@/lib/time';
import { isAcrescimoEmExecucaoACobrar } from '@/lib/utils/itemStatus';

const METODOS_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

const HISTORICO_CONFIG: Record<string, { label: string; cor: string }> = {
  atendimento_criado:     { label: 'Atendimento criado',     cor: 'bg-primary-500' },
  liberado:               { label: 'Liberado para execução', cor: 'bg-info-500' },
  finalizado:             { label: 'Finalizado',             cor: 'bg-success-500' },
  pagamento:              { label: 'Pagamento',              cor: 'bg-warning-500' },
  procedimento:           { label: 'Procedimento',           cor: 'bg-muted' },
  etapa_concluida:        { label: 'Etapa concluída',        cor: 'bg-success-400' },
  credito:                { label: 'Crédito de saldo',       cor: 'bg-success-600' },
  debito:                 { label: 'Débito de saldo',        cor: 'bg-error-500' },
  estorno:                { label: 'Estorno',                cor: 'bg-warning-600' },
  transferencia_saida:    { label: 'Transf. enviada',        cor: 'bg-error-400' },
  transferencia_entrada:  { label: 'Transf. recebida',       cor: 'bg-success-400' },
};

const TERMO_DIGITAL_STATUS_LABELS: Record<string, string> = {
  criado: 'Aguardando assinatura',
  visualizado: 'Visualizado',
  assinado: 'Assinado',
  recusado: 'Recusado',
  concluido: 'Concluído',
};

const TERMO_DIGITAL_STATUS_CLASSES: Record<string, string> = {
  criado: 'bg-warning-100 text-warning-800 border-warning-200',
  visualizado: 'bg-info-100 text-info-800 border-info-200',
  assinado: 'bg-success-100 text-success-800 border-success-200',
  recusado: 'bg-error-100 text-error-800 border-error-200',
  concluido: 'bg-success-200 text-success-900 border-success-300',
};

interface Atendimento {
  id: number;
  status: string;
  avaliador_nome: string | null;
  unidade_nome: string | null;
  unidade_razao_social: string | null;
  unidade_cnpj: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
  unidade_email: string | null;
  unidade_responsavel: string | null;
  unidade_recibo_rodape: string | null;
  created_at: string;
  finalizado_at: string | null;
  total: number;
  total_pago: number;
}

interface ItemProcedimento {
  id: number;
  atendimento_id: number;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  criado_por_nome: string | null;
  valor: number;
  valor_final: number | null;
  valor_pago: number;
  adicionado_em_execucao: number | null;
  status: string;
  dentes: string | null;
  dente_unico?: string | null;
  group_id?: string | null;
  quantidade: number;
  observacoes: string | null;
  created_at: string;
  concluido_at: string | null;
}

interface Pagamento {
  id: number;
  atendimento_id: number;
  valor: number;
  metodo: string;
  forma_pagamento_id: number | null;
  forma_pagamento_grupo_snapshot: string | null;
  forma_pagamento_subgrupo_snapshot: string | null;
  taxa_percentual_snapshot: number | null;
  taxa_fixa_snapshot: number | null;
  valor_taxa: number | null;
  valor_liquido: number | null;
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  recebido_por_nome: string | null;
  unidade_id: number | null;
  unidade_nome: string | null;
  unidade_razao_social: string | null;
  unidade_cnpj: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
  unidade_email: string | null;
  unidade_responsavel: string | null;
  unidade_recibo_rodape: string | null;
  created_at: string;
}

interface PagamentoAlocacao {
  id: number;
  pagamento_id: number;
  pagamento_grupo_id: number | null;
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

interface EventoHistorico {
  tipo: string;
  data: string;
  descricao: string;
  ref_id: number;
}

interface ItemProntuario {
  item_id: number;
  atendimento_id: number;
  concluido_at: string | null;
  dentes: string | null;
  quantidade: number;
  item_observacoes: string | null;
  procedimento_nome: string;
  etapa_label: string | null;
  executor_nome: string | null;
  prontuario_id: number | null;
  prontuario_descricao: string | null;
  prontuario_observacoes: string | null;
  prontuario_data: string | null;
  prontuario_updated_at: string | null;
  prontuario_autor: string | null;
}

interface Movimentacao {
  tipo: string;
  data: string;
  descricao: string | null;
  ref_id: number;
  valor: number;
  saldo_anterior: number;
  saldo_novo: number;
}

interface ClienteTermoLista {
  id: number;
  slug: string;
  titulo: string;
  permite_autentique?: number;
}

interface TermoDraftApi {
  campos: TermoCampoDraft[];
  pendentes: string[];
  placeholdersUsados: string[];
}

interface TermoRenderApiResponse {
  html: string;
  titulo: string;
  slug: string;
  placeholdersNaoEncontrados: string[];
  draft?: TermoDraftApi;
}

interface TermoDigitalGerado {
  documentoId: string;
  signaturePublicId: string;
  shortLink: string;
  status: string;
}

type ModoGeracaoTermo = 'impressao' | 'digital';

interface FichaData {
  atendimentos: Atendimento[];
  procedimentos: ItemProcedimento[];
  pagamentos: Pagamento[];
  pagamentos_alocacoes: PagamentoAlocacao[];
  historico: EventoHistorico[];
  prontuarios: ItemProntuario[];
  movimentacoes: Movimentacao[];
}

interface ProcedimentoGrupoFicha {
  key: string;
  atendimento_id: number;
  procedimento_nome: string;
  grupo_label: string;
  itens: ItemProcedimento[];
  total_valor: number;
  total_pago: number;
  possui_pago: boolean;
  possui_pendente: boolean;
  ultimo_evento_em: string;
  executor_nome: string | null;
}

interface UnidadeImpressao {
  nome: string | null;
  razao_social: string | null;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  responsavel: string | null;
  recibo_rodape: string | null;
  multipla: boolean;
}

interface AnexoClienteApi {
  id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  created_at: string;
  usuario_nome?: string | null;
  descricao?: string | null;
}

interface AnexoExecucaoApi {
  id: number;
  item_atendimento_id: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  caminho: string;
  tamanho: number;
  created_at: string;
  usuario_nome?: string | null;
  descricao?: string | null;
}

interface AnexoClienteItem {
  id: number;
  nome: string;
  url: string;
  tipo: string;
  tamanho: number;
  created_at: string;
  origem: 'cliente' | 'prontuario';
  itemAtendimentoId?: number;
  atendimentoId?: number;
  procedimentoNome?: string;
  etapaLabel?: string | null;
  usuarioNome?: string | null;
  descricao?: string | null;
}

export default function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  usePageTitle('Ficha do Cliente');
  const { id } = use(params);
  const { user } = useAuth();
  const unitFetch = useUnitFetch();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [ficha, setFicha] = useState<FichaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [termoModalError, setTermoModalError] = useState('');
  const [termoModalSuccess, setTermoModalSuccess] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('dados');
  const [modalProcedimento, setModalProcedimento] = useState<ItemProcedimento | null>(null);
  const [modalPagamento, setModalPagamento] = useState<Pagamento | null>(null);
  const [vinculos, setVinculos] = useState<VinculoCliente[]>([]);
  const [agendamentos, setAgendamentos] = useState<AgendamentoCompleto[]>([]);
  const [followups, setFollowups] = useState<FollowupTarefaCompleta[]>([]);
  const [modalAddVinculo, setModalAddVinculo] = useState(false);
  const [vinculoBusca, setVinculoBusca] = useState('');
  const [vinculoBuscaResultados, setVinculoBuscaResultados] = useState<Cliente[]>([]);
  const [vinculoClienteSelecionado, setVinculoClienteSelecionado] = useState<Cliente | null>(null);
  const [vinculoObservacao, setVinculoObservacao] = useState('');
  const [vinculoSaving, setVinculoSaving] = useState(false);
  const [anexosCliente, setAnexosCliente] = useState<AnexoClienteItem[]>([]);
  const [anexosProntuario, setAnexosProntuario] = useState<AnexoClienteItem[]>([]);
  const [anexosLoading, setAnexosLoading] = useState(false);
  const [anexosUploading, setAnexosUploading] = useState(false);
  const [selectedAtendimentos, setSelectedAtendimentos] = useState<number[]>([]);
  const [selectedPagamentos, setSelectedPagamentos] = useState<number[]>([]);

  // Saldo
  const [saldo, setSaldo] = useState({ saldo: 0, saldo_calculado: 0 });
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [transferenciaDestinoId, setTransferenciaDestinoId] = useState<number | null>(null);
  const [transferenciaDestinoNome, setTransferenciaDestinoNome] = useState('');
  const [transferenciaValor, setTransferenciaValor] = useState('');
  const [transferindo, setTransferindo] = useState(false);
  const [transferBusca, setTransferBusca] = useState('');
  const [transferResultados, setTransferResultados] = useState<{ id: number; nome: string; cpf: string | null }[]>([]);
  const [transferBuscando, setTransferBuscando] = useState(false);
  const [estornandoItemId, setEstornandoItemId] = useState<number | null>(null);
  const [termos, setTermos] = useState<ClienteTermoLista[]>([]);
  const [isLoadingTermos, setIsLoadingTermos] = useState(false);
  const [isAbrindoTermo, setIsAbrindoTermo] = useState(false);
  const [isGerandoTermoDigital, setIsGerandoTermoDigital] = useState(false);
  const [isCarregandoPreviewTermo, setIsCarregandoPreviewTermo] = useState(false);
  const [modalTermoAberto, setModalTermoAberto] = useState(false);
  const [termoSelecionado, setTermoSelecionado] = useState('');
  const [modoGeracaoTermo, setModoGeracaoTermo] = useState<ModoGeracaoTermo>('impressao');
  const [termoDraft, setTermoDraft] = useState<TermoDraftApi | null>(null);
  const [termoPlaceholders, setTermoPlaceholders] = useState<Record<string, string>>({});
  const [termoPreviewHtml, setTermoPreviewHtml] = useState('');
  const [termoPreviewTitulo, setTermoPreviewTitulo] = useState('');
  const [termoDigitalGerado, setTermoDigitalGerado] = useState<TermoDigitalGerado | null>(null);
  const [termoTentouGerarDigital, setTermoTentouGerarDigital] = useState(false);
  const [termosDigitais, setTermosDigitais] = useState<TermoDigital[]>([]);
  const [isLoadingTermosDigitais, setIsLoadingTermosDigitais] = useState(false);
  const termoPreviewRequestRef = useRef(0);

  const { push } = useRouter();
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type?: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const parseSafeNumber = (value: number | string | null | undefined) => Number(value ?? 0) || 0;

  const openConfirm = (config: Omit<typeof confirmDialog, 'isOpen'>) => {
    setConfirmDialog({ ...config, isOpen: true });
  };

  const arePlaceholderMapsEqual = useCallback((current: Record<string, string>, next: Record<string, string>) => {
    const currentKeys = Object.keys(current);
    const nextKeys = Object.keys(next);
    if (currentKeys.length !== nextKeys.length) return false;
    return currentKeys.every((key) => (current[key] ?? '') === (next[key] ?? ''));
  }, []);

  const resetTermoDigitalState = useCallback((options?: { keepMode?: boolean }) => {
    termoPreviewRequestRef.current += 1;
    setTermoDraft(null);
    setTermoPlaceholders({});
    setTermoPreviewHtml('');
    setTermoPreviewTitulo('');
    setTermoDigitalGerado(null);
    setTermoTentouGerarDigital(false);
    setTermoModalError('');
    setTermoModalSuccess('');
    setIsCarregandoPreviewTermo(false);
    setIsGerandoTermoDigital(false);
    if (!options?.keepMode) {
      setModoGeracaoTermo('impressao');
    }
  }, []);

  const fecharModalTermo = useCallback(() => {
    setModalTermoAberto(false);
    setTermoSelecionado('');
    resetTermoDigitalState();
  }, [resetTermoDigitalState]);

  const loadVinculos = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/vinculos`);
    if (res.ok) setVinculos(await res.json());
  }, [id]);

  const carregarSaldo = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/saldo`);
    if (res.ok) {
      const data = await res.json();
      setSaldo({ saldo: data.saldo ?? 0, saldo_calculado: data.saldo_calculado ?? 0 });
    }
  }, [id]);

  const carregarTermosCliente = useCallback(async () => {
    setIsLoadingTermos(true);
    try {
      const res = await fetch(`/api/clientes/${id}/termos`);
      if (res.ok) {
        const data = await res.json() as ClienteTermoLista[];
        setTermos(data);
      } else {
        setTermos([]);
      }
    } catch {
      setTermos([]);
    } finally {
      setIsLoadingTermos(false);
    }
  }, [id]);

  const carregarTermosDigitais = useCallback(async () => {
    setIsLoadingTermosDigitais(true);
    try {
      const res = await fetch(`/api/clientes/${id}/termos-digitais`);
      if (res.ok) {
        setTermosDigitais(await res.json() as TermoDigital[]);
      } else {
        setTermosDigitais([]);
      }
    } catch {
      setTermosDigitais([]);
    } finally {
      setIsLoadingTermosDigitais(false);
    }
  }, [id]);

  const carregarPreviewTermoDigital = useCallback(async (
    slug: string,
    placeholders: Record<string, string>,
    options?: { silencioso?: boolean }
  ) => {
    if (!slug) return;

    const requestId = ++termoPreviewRequestRef.current;
    if (!options?.silencioso) {
      setIsCarregandoPreviewTermo(true);
    }

    try {
      const res = await unitFetch(`/api/clientes/${id}/termos/${encodeURIComponent(slug)}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeholders }),
      });
      const payload = await res.json() as TermoRenderApiResponse | { error?: string };

      if (requestId !== termoPreviewRequestRef.current) {
        return;
      }

      if (!res.ok) {
        setTermoModalSuccess('');
        setTermoModalError(('error' in payload && payload.error) || 'Erro ao preparar termo digital.');
        return;
      }

      const data = payload as TermoRenderApiResponse;

      setTermoModalError('');
      setTermoPreviewHtml(String(data.html || '').trim());
      setTermoPreviewTitulo(String(data.titulo || 'Prévia do termo'));

      if (data.draft) {
        setTermoDraft(data.draft);
        const nextPlaceholders = Object.fromEntries(
          data.draft.campos.map((campo: TermoCampoDraft) => [campo.key, campo.value ?? ''])
        );
        setTermoPlaceholders((prev) => (
          arePlaceholderMapsEqual(prev, nextPlaceholders) ? prev : nextPlaceholders
        ));
      } else {
        setTermoDraft(null);
      }
    } catch {
      if (requestId === termoPreviewRequestRef.current) {
        setTermoModalSuccess('');
        setTermoModalError('Erro ao preparar termo digital.');
      }
    } finally {
      if (requestId === termoPreviewRequestRef.current) {
        setIsCarregandoPreviewTermo(false);
      }
    }
  }, [arePlaceholderMapsEqual, id, unitFetch]);

  const carregarAnexos = useCallback(async (prontuarios: ItemProntuario[] = []) => {
    setAnexosLoading(true);
    setAnexosCliente([]);
    setAnexosProntuario([]);
    try {
      const prontuariosMap = new Map<number, ItemProntuario>(
        prontuarios.map((item) => [item.item_id, item])
      );
      const [resCliente, ...resExec] = await Promise.all([
        fetch(`/api/clientes/${id}/anexos`),
        ...Array.from(prontuariosMap.keys()).map((itemId) => fetch(`/api/execucao/item/${itemId}/anexos`)),
      ]);

          if (resCliente.ok) {
        const anexosClienteRaw = await resCliente.json() as AnexoClienteApi[];
          setAnexosCliente(anexosClienteRaw.map(a => ({
          id: a.id,
          nome: a.nome_arquivo,
          url: `/api/arquivos/${a.caminho}`,
          tipo: a.tipo_arquivo,
          tamanho: a.tamanho,
          created_at: a.created_at,
          origem: 'cliente',
          usuarioNome: a.usuario_nome || null,
          descricao: a.descricao || null,
        })));
      }

      if (resExec.length > 0) {
        const anexosExec = await Promise.all(
          resExec.map(async (res) => {
            if (!res.ok) return [];
            const itens = await res.json() as AnexoExecucaoApi[];
            return itens.map((anexo) => {
              const prontuario = prontuariosMap.get(anexo.item_atendimento_id);
              return {
                id: anexo.id,
                nome: anexo.nome_arquivo,
                url: `/api/arquivos/${anexo.caminho}`,
                tipo: anexo.tipo_arquivo,
                tamanho: anexo.tamanho,
                created_at: anexo.created_at,
                origem: 'prontuario' as const,
                itemAtendimentoId: anexo.item_atendimento_id,
                atendimentoId: prontuario?.atendimento_id,
                procedimentoNome: prontuario?.procedimento_nome,
                etapaLabel: prontuario?.etapa_label ?? null,
                usuarioNome: anexo.usuario_nome || null,
                descricao: anexo.descricao || null,
              };
            });
          })
        );

        const todosProntuario = anexosExec
          .flat()
          .sort((a, b) => (getStoredUtcInstantMillis(b.created_at) ?? 0) - (getStoredUtcInstantMillis(a.created_at) ?? 0));
        setAnexosProntuario(todosProntuario);
      }
    } catch {
      setError('Erro ao carregar anexos');
    } finally {
      setAnexosLoading(false);
    }
  }, [id]);

  const carregarFicha = useCallback(async () => {
    const res = await fetch(`/api/clientes/${id}/ficha`);
    if (!res.ok) return;
    const data = await res.json() as FichaData;
    setFicha(data);
    await carregarAnexos(data.prontuarios);
  }, [id, carregarAnexos]);

  const carregarAgendamentos = useCallback(async () => {
    const res = await unitFetch(`/api/agendamentos?cliente_id=${id}&status=pendente,agendado,faltou,realizado,cancelado&order_by=data_agendada&order_dir=asc`);
    if (res.ok) setAgendamentos(await res.json());
  }, [id, unitFetch]);

  const carregarFollowups = useCallback(async () => {
    const res = await unitFetch(`/api/followup?cliente_id=${id}&status=aberta,concluida`);
    if (res.ok) {
      const data = await res.json();
      setFollowups(data.items ?? []);
    }
  }, [id, unitFetch]);

  useEffect(() => {
    const load = async () => {
      try {
        const [resCliente, resFicha] = await Promise.all([
          fetch(`/api/clientes/${id}`),
          fetch(`/api/clientes/${id}/ficha`),
        ]);
        if (!resCliente.ok) { push('/clientes'); return; }
        setCliente(await resCliente.json());
        if (resFicha.ok) {
          const fichaData = await resFicha.json() as FichaData;
          setFicha(fichaData);
          await carregarAnexos(fichaData.prontuarios);
        }
        await Promise.all([
          carregarTermosCliente(),
          carregarTermosDigitais(),
          loadVinculos(),
          carregarSaldo(),
          carregarAgendamentos(),
          carregarFollowups(),
        ]);
      } catch {
        setError('Erro ao carregar cliente');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id, push, loadVinculos, carregarSaldo, carregarAgendamentos, carregarFollowups, carregarAnexos, carregarTermosCliente, carregarTermosDigitais]);

  useEffect(() => {
    if (!vinculoBusca.trim()) { setVinculoBuscaResultados([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clientes?busca=${encodeURIComponent(vinculoBusca)}&limit=8&ordem=nome`);
      if (res.ok) {
        const data = await res.json();
        // filtra o próprio cliente e já vinculados
        const vinculadosIds = new Set(vinculos.map(v => v.outro_cliente_id));
        setVinculoBuscaResultados(
          (data.clientes ?? data).filter((c: Cliente) => c.id !== parseInt(id, 10) && !vinculadosIds.has(c.id))
        );
      }
    }, 300);
    return () => clearTimeout(t);
  }, [vinculoBusca, id, vinculos]);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(''); setSuccess(''); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  useEffect(() => {
    if (!ficha) {
      return;
    }
    const idsValidos = new Set(ficha.atendimentos.map((a) => a.id));
    setSelectedAtendimentos((prev) => prev.filter((id) => idsValidos.has(id)));
    const pagamentosValidos = new Set(ficha.pagamentos.map((pagamento) => pagamento.id));
    setSelectedPagamentos((prev) => prev.filter((id) => pagamentosValidos.has(id)));
  }, [ficha]);

  useEffect(() => {
    if (!transferBusca || transferBusca.length < 2) { setTransferResultados([]); return; }
    setTransferBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?busca=${encodeURIComponent(transferBusca)}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setTransferResultados(
            (data.clientes ?? data).filter((c: { id: number }) => c.id !== parseInt(id, 10))
          );
        }
      } catch { /* silently fail */ } finally {
        setTransferBuscando(false);
      }
    }, 300);
    return () => { clearTimeout(t); setTransferBuscando(false); };
  }, [transferBusca, id]);

  useEffect(() => {
    if (abaAtiva !== 'anexos') return;
    void carregarTermosDigitais();
  }, [abaAtiva, carregarTermosDigitais]);

  useEffect(() => {
    const termoSelecionadoAtual = termos.find((termo) => termo.slug === termoSelecionado);
    const termoPermiteAutentique = termoSelecionadoAtual ? termoSelecionadoAtual.permite_autentique !== 0 : true;

    if (!modalTermoAberto || modoGeracaoTermo !== 'digital' || !termoSelecionado || termoDigitalGerado || !termoPermiteAutentique) {
      return;
    }

    const delay = Object.keys(termoPlaceholders).length > 0 ? 300 : 0;
    const timer = setTimeout(() => {
      void carregarPreviewTermoDigital(termoSelecionado, termoPlaceholders, { silencioso: delay > 0 });
    }, delay);

    return () => clearTimeout(timer);
  }, [
    modalTermoAberto,
    modoGeracaoTermo,
    termoSelecionado,
    termos,
    termoPlaceholders,
    termoDigitalGerado,
    carregarPreviewTermoDigital,
  ]);

  const handleSubmit = async (formData: ClienteFormData) => {
    setError('');
    setIsSaving(true);
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao salvar'); return; }
      setCliente(data);
      setSuccess('Cliente atualizado com sucesso!');
      setIsEditing(false);
    } catch {
      setError('Erro ao salvar cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    const temAtendimentos = (ficha?.atendimentos.length ?? 0) > 0;
    if (temAtendimentos) {
      openConfirm({
        title: 'Não é possível excluir',
        message: `O cliente "${cliente?.nome}" possui ${ficha?.atendimentos.length} atendimento(s) vinculado(s). Não é possível excluir clientes com atendimentos.`,
        confirmLabel: 'Entendi',
        type: 'warning',
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }
    openConfirm({
      title: 'Excluir Cliente',
      message: `Deseja excluir o cliente "${cliente?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao excluir'); return; }
          push('/clientes');
        } catch {
          setError('Erro ao excluir cliente');
        }
      },
    });
  };

  const escapeHtml = (value: unknown) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const abrirModalGerarTermo = async () => {
    if (termos.length === 0 && !isLoadingTermos) {
      await carregarTermosCliente();
    }
    resetTermoDigitalState();
    setTermoSelecionado('');
    setModalTermoAberto(true);
  };

  const handleModoGeracaoTermoChange = (modo: ModoGeracaoTermo) => {
    resetTermoDigitalState({ keepMode: true });
    setModoGeracaoTermo(modo);
  };

  const handleSelecionarTermo = (slug: string) => {
    setTermoSelecionado(slug);
    resetTermoDigitalState({ keepMode: true });
  };

  const handleChangeCampoTermo = (key: string, value: string) => {
    setTermoDigitalGerado(null);
    setTermoModalError('');
    setTermoModalSuccess('');
    setTermoPlaceholders((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const copiarLinkTermoDigital = async (shortLink: string) => {
    try {
      await navigator.clipboard.writeText(shortLink);
      setTermoModalError('');
      setTermoModalSuccess('Link copiado com sucesso.');
    } catch {
      setTermoModalSuccess('');
      setTermoModalError('Não foi possível copiar o link.');
    }
  };

  const gerarTermoImpressao = async () => {
    if (!cliente) return;
    if (!termoSelecionado) {
      setTermoModalSuccess('');
      setTermoModalError('Selecione um termo para gerar.');
      return;
    }

    setIsAbrindoTermo(true);
    setTermoModalError('');
    setTermoModalSuccess('');
    try {
      const res = await unitFetch(`/api/clientes/${id}/termos/${encodeURIComponent(termoSelecionado)}/render`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setTermoModalError(data?.error || 'Erro ao gerar termo.');
        return;
      }

      const html = String(data.html || '').trim();
      if (!html) {
        setTermoModalError('Termo vazio.');
        return;
      }

      const titulo = String(data.titulo || 'Termo');
      const janela = window.open('', '_blank');
      if (!janela) {
        setTermoModalError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
        return;
      }

      janela.document.write(buildTermoPrintableDocument(titulo, html));
      finalizarJanelaDeImpressao(janela);
      fecharModalTermo();
      setSuccess('Termo pronto para impressão.');
    } catch {
      setTermoModalError('Erro ao gerar termo.');
    } finally {
      setIsAbrindoTermo(false);
    }
  };

  const gerarTermoDigital = async () => {
    if (!cliente) return;
    if (!termoSelecionado) {
      setTermoModalSuccess('');
      setTermoModalError('Selecione um termo para gerar.');
      return;
    }

    const termoAtual = termos.find((termo) => termo.slug === termoSelecionado);
    if (termoAtual && termoAtual.permite_autentique === 0) {
      setTermoModalSuccess('');
      setTermoModalError('Este termo está disponível apenas para impressão.');
      return;
    }

    if (!termoDraft) {
      setTermoModalSuccess('');
      setTermoModalError('Aguarde a preparação da revisão do termo.');
      return;
    }

    setTermoTentouGerarDigital(true);
    const pendentes = termoDraft.campos.filter((campo) => !(termoPlaceholders[campo.key] ?? '').trim());
    if (pendentes.length > 0) {
      setTermoModalSuccess('');
      setTermoModalError(`Preencha os campos obrigatórios antes de gerar o link: ${pendentes.map((campo) => campo.label).join(', ')}.`);
      return;
    }

    setIsGerandoTermoDigital(true);
    setTermoModalError('');
    setTermoModalSuccess('');
    try {
      const res = await unitFetch(`/api/clientes/${id}/termos/${encodeURIComponent(termoSelecionado)}/autentique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeholders: termoPlaceholders }),
      });
      const data = await res.json() as TermoDigitalGerado & { error?: string };

      if (!res.ok) {
        setTermoModalError(data?.error || 'Erro ao gerar termo digital.');
        return;
      }

      setTermoDigitalGerado({
        documentoId: data.documentoId,
        signaturePublicId: data.signaturePublicId,
        shortLink: data.shortLink,
        status: data.status,
      });
      setTermoModalSuccess('Link de assinatura gerado com sucesso.');
      await carregarTermosDigitais();
    } catch {
      setTermoModalError('Erro ao gerar termo digital.');
    } finally {
      setIsGerandoTermoDigital(false);
    }
  };

  const toggleSelecionarAtendimento = (atendimentoId: number) => {
    setSelectedAtendimentos((prev) =>
      prev.includes(atendimentoId) ? prev.filter((id) => id !== atendimentoId) : [...prev, atendimentoId]
    );
  };

  const selecionarTodosAtendimentos = () => {
    if (!ficha?.atendimentos.length) return;
    if (selectedAtendimentos.length === ficha.atendimentos.length) {
      setSelectedAtendimentos([]);
      return;
    }
    setSelectedAtendimentos(ficha.atendimentos.map((a) => a.id));
  };

  const getMetodoPagamentoLabel = (pagamento: {
    metodo: string;
    forma_pagamento_grupo_snapshot?: string | null;
    forma_pagamento_subgrupo_snapshot?: string | null;
  }) => getFormaPagamentoSnapshotLabel({
    metodo: pagamento.metodo,
    forma_pagamento_grupo_snapshot: pagamento.forma_pagamento_grupo_snapshot ?? null,
    forma_pagamento_subgrupo_snapshot: pagamento.forma_pagamento_subgrupo_snapshot ?? null,
  }) || METODOS_LABEL[pagamento.metodo] || pagamento.metodo;

  const abrirRelatorioClienteImpressao = ({
    tituloDocumento,
    tituloCabecalho,
    contadorLabel,
    contadorValor,
    resumoHtml,
    conteudoHtml,
  }: {
    tituloDocumento: string;
    tituloCabecalho: string;
    contadorLabel: string;
    contadorValor: number | string;
    resumoHtml: string;
    conteudoHtml: string;
  }) => {
    if (!cliente) return;

    const janela = window.open('', '_blank');
    if (!janela) {
      setError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
      return;
    }

    const logoUrl = `${window.location.origin}/logo-sorria-leste-laranja-fundo-transparente.svg`;

    janela.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>${escapeHtml(tituloDocumento)} - ${escapeHtml(cliente.nome)}</title>
          <style>
            ${PRINT_STYLE_TOKENS_CLIENT_HEADER}
            body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: var(--sorria-ink); font-size: 12px; background: var(--sorria-surface); }
            h1 { font-size: 20px; margin: 0; color: var(--sorria-ink); letter-spacing: 0.2px; }
            h2 { font-size: 14px; margin: 16px 0 8px; color: var(--sorria-orange); }
            h3 { font-size: 12px; margin: 12px 0 6px; }
            .section { margin-top: 16px; border-top: 1px solid var(--sorria-line); padding-top: 12px; page-break-inside: avoid; }
            .header { border: 1px solid var(--sorria-soft-border); padding: 14px 14px 12px; margin-bottom: 14px; background: var(--sorria-soft); border-radius: 6px; }
            .summary { margin: 12px 0; background: var(--sorria-surface); border: 1px solid var(--sorria-soft-border); border-radius: 6px; padding: 10px 12px; }
            .report-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand img { width: 40px; height: 40px; object-fit: contain; }
            .brand-text { color: var(--sorria-orange); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid var(--sorria-line); padding: 5px 8px; text-align: left; vertical-align: top; }
            th { background: var(--sorria-soft-alt); color: var(--sorria-soft-text); }
            ul { padding-left: 16px; margin: 0; }
            .compact-list { padding-left: 14px; margin: 0; }
            .compact-list li { margin-bottom: 3px; }
            .muted { color: var(--sorria-muted); }
          </style>
        </head>
        <body>
          <div class=\"header\">
            <div class=\"report-header\">
              <div class=\"brand\">
                <img src="${logoUrl}" alt="Logo Sorria Leste" />
                <div>
                  <h1>${escapeHtml(tituloCabecalho)}</h1>
                  <div class="brand-text">Sorria Leste</div>
                </div>
              </div>
              <div><strong>${escapeHtml(contadorLabel)}:</strong> ${escapeHtml(contadorValor)}</div>
            </div>
            <div><strong>Cliente:</strong> ${escapeHtml(cliente.nome)}</div>
            <div><strong>CPF:</strong> ${escapeHtml(formatarCPF(cliente.cpf))} <strong>Telefone:</strong> ${escapeHtml(formatarTelefone(cliente.telefone))}</div>
            <div><strong>Email:</strong> ${escapeHtml(cliente.email || '-')} <strong>Plano:</strong> ${escapeHtml(cliente.plano_odontologico || '-')}</div>
            <div><strong>Sexo:</strong> ${escapeHtml(cliente.sexo ? cliente.sexo.charAt(0).toUpperCase() + cliente.sexo.slice(1) : '-')} <strong>Data nascimento:</strong> ${escapeHtml(cliente.data_nascimento ? formatarData(cliente.data_nascimento) : '-')}</div>
            <div><strong>Endereço:</strong> ${escapeHtml(cliente.endereco || '-')}</div>
            <div><strong>Cadastro:</strong> ${formatarDataHora(cliente.created_at)}</div>
          </div>
          <div class=\"summary\">${resumoHtml}</div>
          ${conteudoHtml}
        </body>
      </html>
    `);
    finalizarJanelaDeImpressao(janela);
  };

  const resolverUnidadeImpressaoPagamentos = (pagamentosSelecionadosList: Pagamento[]): UnidadeImpressao => {
    const unidades = new Map<string, UnidadeImpressao>();

    for (const pagamento of pagamentosSelecionadosList) {
      const key = [
        pagamento.unidade_nome || '',
        pagamento.unidade_razao_social || '',
        pagamento.unidade_cnpj || '',
        pagamento.unidade_endereco || '',
        pagamento.unidade_telefone || '',
        pagamento.unidade_email || '',
        pagamento.unidade_responsavel || '',
        pagamento.unidade_recibo_rodape || '',
      ].join('|');

      if (!unidades.has(key)) {
        unidades.set(key, {
          nome: pagamento.unidade_nome,
          razao_social: pagamento.unidade_razao_social,
          cnpj: pagamento.unidade_cnpj,
          endereco: pagamento.unidade_endereco,
          telefone: pagamento.unidade_telefone,
          email: pagamento.unidade_email,
          responsavel: pagamento.unidade_responsavel,
          recibo_rodape: pagamento.unidade_recibo_rodape,
          multipla: false,
        });
      }
    }

    if (unidades.size === 1) {
      return Array.from(unidades.values())[0];
    }

    return {
      nome: 'múltiplas unidades',
      razao_social: null,
      cnpj: null,
      endereco: null,
      telefone: null,
      email: null,
      responsavel: null,
      recibo_rodape: null,
      multipla: true,
    };
  };

  const abrirReciboPagamentosClienteImpressao = ({
    unidade,
    quantidadePagamentos,
    totalPagamentos,
    conteudoHtml,
  }: {
    unidade: UnidadeImpressao;
    quantidadePagamentos: number;
    totalPagamentos: number;
    conteudoHtml: string;
  }) => {
    if (!cliente) return;

    const janela = window.open('', '_blank');
    if (!janela) {
      setError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
      return;
    }

    const logoUrl = `${window.location.origin}/logo-sorria-leste-laranja-fundo-transparente.svg`;
    const emitidoEm = formatarAgoraDaClinica();
    const empresaNome = unidade.multipla ? 'Sorria Leste' : (unidade.razao_social || 'Sorria Leste');
    const unidadeNome = unidade.nome || 'Unidade não informada';
    const empresaEndereco = unidade.multipla ? 'Conforme unidade do pagamento' : unidade.endereco;
    const empresaTelefone = unidade.multipla ? 'Conforme unidade do pagamento' : unidade.telefone;
    const empresaEmail = unidade.multipla ? null : unidade.email;
    const empresaResponsavel = unidade.multipla ? null : unidade.responsavel;
    const empresaCnpj = !unidade.multipla && unidade.cnpj ? formatarCNPJ(unidade.cnpj) : null;
    const rodapeRecibo = unidade.recibo_rodape
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

    janela.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Recibo de Pagamento - ${escapeHtml(cliente.nome)}</title>
          <style>
            ${PRINT_STYLE_TOKENS_BASE}
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; }
            html { background: var(--sorria-surface); }
            body { font-family: Arial, Helvetica, sans-serif; padding: 0; margin: 0; color: var(--ink); font-size: 11.5px; line-height: 1.42; background: var(--sorria-surface); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            h1 { font-size: 22px; line-height: 1.08; margin: 0; color: var(--ink); letter-spacing: -0.35px; }
            h2 { font-size: 11px; margin: 0 0 8px; color: var(--sorria-orange-dark); text-transform: uppercase; letter-spacing: 0.7px; }
            .receipt-page { width: 186mm; max-width: 100%; margin: 0 auto; }
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
            .summary { margin: 10px 0; border: 1px solid var(--sorria-orange-border-strong); background: var(--sorria-soft); border-radius: 6px; padding: 10px 12px; break-inside: avoid; page-break-inside: avoid; }
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
                <div><span>Pagamentos</span><strong>${escapeHtml(String(quantidadePagamentos))}</strong></div>
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
                <div class="info-line"><span>Nome</span><strong>${escapeHtml(cliente.nome)}</strong></div>
                <div class="info-line"><span>CPF</span><strong>${escapeHtml(formatarCPF(cliente.cpf))}</strong></div>
              </section>
            </div>

            <div class="summary">
              <div class="summary-grid">
                <div class="summary-item">
                  <span>Pagamentos</span>
                  <strong>${escapeHtml(String(quantidadePagamentos))}</strong>
                </div>
                <div class="summary-item total">
                  <span>Total recebido</span>
                  <strong>${formatarMoeda(totalPagamentos)}</strong>
                </div>
              </div>
            </div>
            ${conteudoHtml}
            <footer class="receipt-footer">
              <p>${escapeHtml(rodapeRecibo)}</p>
              <div class="signature-row">
                <div>
                  <span></span>
                  <strong>${escapeHtml(empresaResponsavel || 'Responsável pela unidade')}</strong>
                </div>
                <div>
                  <span></span>
                  <strong>${escapeHtml(cliente.nome)}</strong>
                </div>
              </div>
            </footer>
          </main>
        </body>
      </html>
    `);
    finalizarJanelaDeImpressao(janela);
  };

  const imprimirAtendimentosSelecionados = () => {
    if (!ficha || !cliente || selectedAtendimentos.length === 0) return;

    const atendimentoSet = new Set(selectedAtendimentos);
    const atendimentosSelecionadosList = ficha.atendimentos.filter((a) => atendimentoSet.has(a.id));
    if (atendimentosSelecionadosList.length === 0) return;

    const formatMetodo = (pagamento: Pagamento) => escapeHtml(getMetodoPagamentoLabel(pagamento));

    const totalSelecionado = atendimentosSelecionadosList.reduce((acc, item) => acc + parseSafeNumber(item.total), 0);
    const totalPagoSelecionado = atendimentosSelecionadosList.reduce((acc, item) => acc + parseSafeNumber(item.total_pago), 0);
    const pendenciaSelecionada = Math.max(totalSelecionado - totalPagoSelecionado, 0);

    const atendimentoSections = atendimentosSelecionadosList.map((atendimento) => {
      const itens = ficha.procedimentos.filter((p) => p.atendimento_id === atendimento.id);
      const pagamentos = ficha.pagamentos.filter((p) => p.atendimento_id === atendimento.id);
      const prontuarios = ficha.prontuarios.filter((p) => p.atendimento_id === atendimento.id);

      const itensHtml = itens.length
        ? itens.map((item) => `
            <tr>
              <td>${escapeHtml(item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome)}</td>
              <td>${escapeHtml(item.executor_nome || '-')}</td>
              <td>${escapeHtml(item.status)}</td>
              <td style=\"text-align:right\">${formatarMoeda(parseSafeNumber(item.valor))}</td>
              <td style=\"text-align:right\">${formatarMoeda(parseSafeNumber(item.valor_pago))}</td>
              <td>${escapeHtml(formatarDentes(item.dentes) || '-')}</td>
              <td>${escapeHtml(parseSafeNumber(item.quantidade))}</td>
            </tr>
            <tr>
              <td colspan=\"7\" style=\"padding-top:0; font-size:11px; color:var(--sorria-muted-border);\">
                Observações: ${escapeHtml(item.observacoes || '-')}
              </td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" class="muted">Nenhum procedimento registrado</td></tr>';

      const pagamentosHtml = pagamentos.length
        ? pagamentos.map((pagamento) => `
          <tr>
            <td>${formatarDataHora(pagamento.created_at)}</td>
            <td>${formatMetodo(pagamento)}</td>
            <td style=\"text-align:right;\">${formatarMoeda(parseSafeNumber(pagamento.valor))}</td>
            <td style=\"text-align:right;\">${pagamento.cancelado ? 'Cancelado' : 'Ativo'}</td>
            <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
            <td>${escapeHtml(pagamento.observacoes || '-')}</td>
          </tr>
        `).join('')
        : '<tr><td colspan="6" class="muted">Nenhum pagamento registrado</td></tr>';

      const prontuarioInfo = prontuarios.length
        ? prontuarios.map((item) => {
            const linhas = [
              `<strong>${escapeHtml(item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome)}</strong>`,
              `Executor: ${escapeHtml(item.executor_nome || '-')}, concluído em ${escapeHtml(formatarDataHora(item.concluido_at))}`,
              item.prontuario_descricao ? `Descrição: ${escapeHtml(item.prontuario_descricao)}` : null,
              item.prontuario_observacoes ? `Observações: ${escapeHtml(item.prontuario_observacoes)}` : null,
            ]
              .filter((linha) => Boolean(linha))
              .join('<br />');

            return `
            <li>
              ${linhas}
            </li>
          `;
          }).join('')
        : '<li>Nenhum registro de prontuário concluído.</li>';

      return `
        <section class=\"section\">
          <h2>Atendimento #${atendimento.id}</h2>
          <div style=\"margin: 8px 0 12px;\">
            <div><strong>Data:</strong> ${formatarDataHora(atendimento.created_at)}</div>
            <div><strong>Status:</strong> ${escapeHtml(atendimento.status)}</div>
            <div><strong>Avaliador:</strong> ${escapeHtml(atendimento.avaliador_nome || '-')}</div>
            <div><strong>Total:</strong> ${formatarMoeda(parseSafeNumber(atendimento.total))}</div>
            <div><strong>Pago:</strong> ${formatarMoeda(parseSafeNumber(atendimento.total_pago))}</div>
          </div>
          <h3>Procedimentos realizados</h3>
          <table>
            <thead>
              <tr>
                <th>Procedimento</th>
                <th>Executor</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Valor pago</th>
                <th>Dentes</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>${itensHtml}</tbody>
          </table>
          <h3>Pagamentos</h3>
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
          <h3>Prontuário / Execução</h3>
          <ul>${prontuarioInfo}</ul>
        </section>
      `;
    }).join('');

    abrirRelatorioClienteImpressao({
      tituloDocumento: 'Relatório de Atendimentos',
      tituloCabecalho: 'Relatório de Atendimentos',
      contadorLabel: 'Atendimentos',
      contadorValor: atendimentosSelecionadosList.length,
      resumoHtml: `
        <strong>Total dos atendimentos selecionados:</strong> ${formatarMoeda(totalSelecionado)}<br />
        <strong>Total pago:</strong> ${formatarMoeda(totalPagoSelecionado)}<br />
        <strong>Saldo pendente:</strong> ${formatarMoeda(pendenciaSelecionada)}
      `,
      conteudoHtml: atendimentoSections,
    });
  };

  const toggleSelecionarPagamento = (pagamentoId: number) => {
    setSelectedPagamentos((prev) =>
      prev.includes(pagamentoId) ? prev.filter((id) => id !== pagamentoId) : [...prev, pagamentoId]
    );
  };

  const selecionarTodosPagamentos = () => {
    if (!ficha?.pagamentos.length) return;
    if (selectedPagamentos.length === ficha.pagamentos.length) {
      setSelectedPagamentos([]);
      return;
    }
    setSelectedPagamentos(ficha.pagamentos.map((pagamento) => pagamento.id));
  };

  const imprimirPagamentosSelecionados = () => {
    if (!ficha || !cliente || selectedPagamentos.length === 0) return;

    const pagamentoSet = new Set(selectedPagamentos);
    const pagamentosSelecionadosList = ficha.pagamentos.filter((pagamento) => pagamentoSet.has(pagamento.id));
    if (pagamentosSelecionadosList.length === 0) return;

    const formatMetodo = (pagamento: Pagamento) => escapeHtml(getMetodoPagamentoLabel(pagamento));
    const alocacoesPorPagamento = new Map<number, PagamentoAlocacao[]>();
    for (const alocacao of ficha.pagamentos_alocacoes ?? []) {
      const lista = alocacoesPorPagamento.get(alocacao.pagamento_id) ?? [];
      lista.push(alocacao);
      alocacoesPorPagamento.set(alocacao.pagamento_id, lista);
    }

    const formatarReferenciasPagamento = (pagamentoId: number) => {
      const alocacoes = alocacoesPorPagamento.get(pagamentoId) ?? [];
      if (alocacoes.length === 0) {
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

    const unidadeImpressao = resolverUnidadeImpressaoPagamentos(pagamentosSelecionadosList);
    const mostrarColunaUnidade = unidadeImpressao.multipla;
    const totalSelecionado = pagamentosSelecionadosList.reduce((acc, pagamento) => (
      pagamento.cancelado ? acc : acc + parseSafeNumber(pagamento.valor)
    ), 0);

    const pagamentosHtml = pagamentosSelecionadosList.map((pagamento) => {
      const detalhesObservacao = [
        pagamento.observacoes || null,
        pagamento.cancelado && pagamento.motivo_cancelamento
          ? `Motivo do cancelamento: ${pagamento.motivo_cancelamento}`
          : null,
      ].filter((valor): valor is string => Boolean(valor));

      return `
        <tr>
          <td>${formatarDataHora(pagamento.created_at)}</td>
          <td>#${escapeHtml(pagamento.atendimento_id)}</td>
          ${mostrarColunaUnidade ? `<td>${escapeHtml(pagamento.unidade_nome || '-')}</td>` : ''}
          <td>${formatarReferenciasPagamento(pagamento.id)}</td>
          <td>${formatMetodo(pagamento)}</td>
          <td style=\"text-align:right;\">${formatarMoeda(parseSafeNumber(pagamento.valor))}</td>
          <td>${escapeHtml(pagamento.recebido_por_nome || '-')}</td>
          <td>${escapeHtml(detalhesObservacao.join(' | ') || '-')}</td>
        </tr>
      `;
    }).join('');

    abrirReciboPagamentosClienteImpressao({
      unidade: unidadeImpressao,
      quantidadePagamentos: pagamentosSelecionadosList.filter((pagamento) => !pagamento.cancelado).length,
      totalPagamentos: totalSelecionado,
      conteudoHtml: `
        <section class=\"section\">
          <h2>Pagamentos selecionados</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Atendimento</th>
                ${mostrarColunaUnidade ? '<th>Unidade</th>' : ''}
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
      `,
    });
  };

  const handleUploadAnexo = async ({ file, titulo, descricao }: { file: File; titulo?: string; descricao?: string }) => {
    if (!user) {
      setError('Sessão expirada. Faça login novamente para anexar arquivos.');
      return;
    }
    setAnexosUploading(true);
    try {
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('usuario_id', user.id.toString());
      if (titulo) formData.append('titulo', titulo);
      if (descricao) formData.append('descricao', descricao);

      const res = await fetch(`/api/clientes/${id}/anexos`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erro ao enviar anexo');
      } else {
        await carregarAnexos(ficha?.prontuarios ?? []);
        setSuccess('Anexo enviado com sucesso!');
      }
    } catch {
      setError('Erro ao enviar anexo');
    } finally {
      setAnexosUploading(false);
    }
  };

  const handleDeleteAnexo = async (anexoData: AnexoClienteItem | { id: number; origem?: string }) => {
    const anexo = anexoData as AnexoClienteItem;
    if (anexo.origem !== 'cliente') {
      setError('Anexos de prontuário não podem ser removidos nesta aba.');
      return;
    }
    const res = await fetch(`/api/clientes/${id}/anexos?anexo_id=${anexo.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Erro ao remover anexo');
      return;
    }
    await carregarAnexos(ficha?.prontuarios ?? []);
  };

  const handleUpdateAnexo = async (
    anexo: { id: number },
    { titulo, descricao }: { titulo?: string; descricao?: string }
  ) => {
    const anexoCliente = anexosCliente.find((item) => item.id === anexo.id);
    if (!anexoCliente) {
      setError('Anexo do cliente não encontrado.');
      return;
    }

    const res = await fetch(`/api/clientes/${id}/anexos`, {
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
      setError(data.error || 'Erro ao atualizar anexo');
      return;
    }

    await carregarAnexos(ficha?.prontuarios ?? []);
    setSuccess('Anexo atualizado com sucesso!');
  };

  const formatarTamanhoArquivo = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImagem = (tipo: string) => tipo.startsWith('image/');

  if (isLoading) return <LoadingState mode="spinner" text="Carregando..." />;
  if (!cliente) return (
    <EmptyState
      icon={<User className="w-7 h-7" />}
      title="Cliente não encontrado"
      actionLabel="Voltar para lista"
      onAction={() => push('/clientes')}
    />
  );

  const totalGasto = ficha?.pagamentos.filter(p => !p.cancelado).reduce((s, p) => s + p.valor, 0) ?? 0;
  const atendimentosPorId = new Map((ficha?.atendimentos ?? []).map((atendimento) => [atendimento.id, atendimento] as const));
  const procedimentosAgrupados: ProcedimentoGrupoFicha[] = (() => {
    const grupos = new Map<string, ProcedimentoGrupoFicha>();

    for (const item of ficha?.procedimentos ?? []) {
      const dentesLabel = formatarDentes(item.dentes) || item.dente_unico || null;
      const grupoBase = item.group_id?.trim()
        || `${item.atendimento_id}:${item.procedimento_nome}:${item.etapa_label || 'sem-etapa'}`;
      const key = `${grupoBase}:${dentesLabel ? 'dentes' : 'livre'}`;
      const grupoLabel = item.etapa_label
        ? `${item.procedimento_nome} — ${item.etapa_label}`
        : item.procedimento_nome;
      const atual = grupos.get(key) ?? {
        key,
        atendimento_id: item.atendimento_id,
        procedimento_nome: item.procedimento_nome,
        grupo_label: grupoLabel,
        itens: [],
        total_valor: 0,
        total_pago: 0,
        possui_pago: false,
        possui_pendente: false,
        ultimo_evento_em: item.concluido_at || item.created_at,
        executor_nome: item.executor_nome || null,
      };

      atual.itens.push(item);
      atual.total_valor += item.valor;
      atual.total_pago += item.valor_pago;
      atual.possui_pago = atual.possui_pago || item.valor_pago > 0;
      atual.possui_pendente = atual.possui_pendente || item.status === 'pendente';
      atual.ultimo_evento_em = (item.concluido_at || item.created_at) > atual.ultimo_evento_em
        ? (item.concluido_at || item.created_at)
        : atual.ultimo_evento_em;
      if (!atual.executor_nome && item.executor_nome) {
        atual.executor_nome = item.executor_nome;
      }

      grupos.set(key, atual);
    }

    return Array.from(grupos.values())
      .map((grupo) => ({
        ...grupo,
        total_valor: Number(grupo.total_valor.toFixed(2)),
        total_pago: Number(grupo.total_pago.toFixed(2)),
        itens: grupo.itens.sort((a, b) => {
          const dataA = a.concluido_at || a.created_at;
          const dataB = b.concluido_at || b.created_at;
          return dataA > dataB ? -1 : dataA < dataB ? 1 : a.id - b.id;
        }),
      }))
      .sort((a, b) => {
        if (a.atendimento_id !== b.atendimento_id) return b.atendimento_id - a.atendimento_id;
        if (a.ultimo_evento_em !== b.ultimo_evento_em) return a.ultimo_evento_em > b.ultimo_evento_em ? -1 : 1;
        return a.grupo_label.localeCompare(b.grupo_label, 'pt-BR');
      });
  })();

  const handleAddVinculo = async () => {
    if (!vinculoClienteSelecionado) return;
    setVinculoSaving(true);
    try {
      const res = await fetch(`/api/clientes/${id}/vinculos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_vinculado_id: vinculoClienteSelecionado.id, observacao: vinculoObservacao }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao adicionar vínculo'); return; }
      await loadVinculos();
      setModalAddVinculo(false);
      setVinculoBusca('');
      setVinculoClienteSelecionado(null);
      setVinculoObservacao('');
      setSuccess('Vínculo adicionado com sucesso!');
    } catch {
      setError('Erro ao adicionar vínculo');
    } finally {
      setVinculoSaving(false);
    }
  };

  const handleRemoveVinculo = (vinculo: VinculoCliente) => {
    openConfirm({
      title: 'Remover Vínculo',
      message: `Deseja remover o vínculo com "${vinculo.outro_cliente_nome}"?`,
      confirmLabel: 'Remover',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/clientes/${id}/vinculos/${vinculo.id}`, { method: 'DELETE' });
          if (!res.ok) { setError('Erro ao remover vínculo'); return; }
          await loadVinculos();
          setSuccess('Vínculo removido.');
        } catch {
          setError('Erro ao remover vínculo');
        }
      },
    });
  };

  const handleEstornarProcedimento = async (item: ItemProcedimento) => {
    openConfirm({
      title: 'Gerar estorno',
      message: `Converter ${formatarMoeda(item.valor_pago)} de "${item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}" em saldo disponível para este cliente?`,
      confirmLabel: 'Gerar estorno',
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setEstornandoItemId(item.id);
        try {
          const res = await fetch(`/api/clientes/${id}/saldo/estornar-procedimento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_atendimento_id: item.id }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Erro ao gerar estorno'); return; }
          setSuccess(`Estorno de ${formatarMoeda(data.valor_creditado)} gerado com sucesso!`);
          await Promise.all([carregarSaldo(), carregarFicha()]);
        } catch {
          setError('Erro ao gerar estorno');
        } finally {
          setEstornandoItemId(null);
        }
      },
    });
  };

  const handleTransferir = async () => {
    if (!transferenciaDestinoId || !transferenciaValor) return;
    setTransferindo(true);
    try {
      const res = await fetch(`/api/clientes/${id}/saldo/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_destino_id: transferenciaDestinoId,
          valor: parseFloat(transferenciaValor),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao transferir'); setTransferindo(false); return; }
      setModalTransferencia(false);
      setTransferenciaDestinoId(null);
      setTransferenciaDestinoNome('');
      setTransferenciaValor('');
      setTransferBusca('');
      setTransferResultados([]);
      setSuccess('Saldo transferido com sucesso!');
      await Promise.all([carregarSaldo(), carregarFicha()]);
    } catch {
      setError('Erro ao transferir saldo');
    } finally {
      setTransferindo(false);
    }
  };

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'atendimentos', label: 'Atendimentos', count: ficha?.atendimentos.length },
    { key: 'procedimentos', label: 'Procedimentos', count: ficha?.procedimentos.length },
    { key: 'pagamentos', label: 'Pagamentos', count: ficha?.pagamentos.filter(p => !p.cancelado).length },
    { key: 'agendamentos', label: 'Agendamentos', count: agendamentos.length },
    { key: 'followups', label: 'Followups', count: followups.length },
    { key: 'prontuario', label: 'Prontuário', count: ficha?.prontuarios.length },
    { key: 'anexos', label: 'Anexos', count: anexosCliente.length + anexosProntuario.length + termosDigitais.length },
    { key: 'historico', label: 'Histórico', count: ficha?.historico.length },
    { key: 'vinculados', label: 'Vinculados', count: vinculos.length },
  ];

  const camposPendentesTermo = termoDraft?.campos.filter((campo) => !(termoPlaceholders[campo.key] ?? '').trim()) ?? [];
  const camposPendentesResumoTermo = camposPendentesTermo.map((campo) => campo.label).join(', ');
  const termoPreviewDocumento = termoPreviewHtml
    ? buildTermoPrintableDocument(termoPreviewTitulo || 'Prévia do termo', termoPreviewHtml)
    : '';
  const termoSelecionadoAtual = termos.find((termo) => termo.slug === termoSelecionado) ?? null;
  const termoSelecionadoPermiteAutentique = termoSelecionadoAtual ? termoSelecionadoAtual.permite_autentique !== 0 : true;

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        icon={<User className="w-7 h-7" />}
        description={`Cadastrado em ${formatarData(cliente.created_at)} • Total gasto: ${formatarMoeda(totalGasto)}`}
        breadcrumb={[
          { label: 'Clientes', href: '/clientes' },
          { label: cliente.nome },
        ]}
        actions={
          !isEditing ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={abrirModalGerarTermo}
                loading={isLoadingTermos}
                disabled={isLoadingTermos}
              >
                Gerar termo
              </Button>
              <Link href={`/atendimentos/novo?cliente=${id}`}>
                <Button variant="secondary">Novo Atendimento</Button>
              </Link>
              <Button onClick={() => setIsEditing(true)}>Editar</Button>
              <Button variant="danger" onClick={handleDelete}>Excluir</Button>
            </div>
          ) : undefined
        }
      />

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert type="success" dismissible onDismiss={() => setSuccess('')}>{success}</Alert>}

      <Tabs tabs={abas} activeTab={abaAtiva} onTabChange={setAbaAtiva} variant="underline" />

      {/* ABA: DADOS */}
      {abaAtiva === 'dados' && (
        <Card>
          {isEditing ? (
            <ClienteForm
              initialData={{
                nome: cliente.nome || '',
                cpf: cliente.cpf || '',
                telefone: cliente.telefone || '',
                email: cliente.email || '',
                data_nascimento: cliente.data_nascimento || '',
                endereco: cliente.endereco || '',
                origem: cliente.origem || '',
                sexo: cliente.sexo || '',
                plano_odontologico: cliente.plano_odontologico || '',
                observacoes: cliente.observacoes || '',
              }}
              onSubmit={handleSubmit}
              onCancel={() => { setIsEditing(false); setError(''); }}
              loading={isSaving}
              error={error}
              submitLabel="Salvar Alterações"
            />
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Dados Pessoais</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted">Nome Completo</p><p className="font-medium">{cliente.nome}</p></div>
                  <div><p className="text-xs text-muted">CPF</p><p className="font-medium">{cliente.cpf ? formatarCPF(cliente.cpf) : '-'}</p></div>
                  <div>
                    <p className="text-xs text-muted">Data de Nascimento</p>
                    <p className="font-medium">
                      {cliente.data_nascimento ? formatarData(cliente.data_nascimento) : '-'}
                      {cliente.data_nascimento && (() => {
                        const idade = calculateAgeFromDateOnly(cliente.data_nascimento);
                        return idade !== null ? <span className="text-sm text-muted ml-1">({idade} anos)</span> : null;
                      })()}
                    </p>
                  </div>
                  <div><p className="text-xs text-muted">Sexo</p><p className="font-medium">{cliente.sexo ? cliente.sexo.charAt(0).toUpperCase() + cliente.sexo.slice(1) : '-'}</p></div>
                  <div><p className="text-xs text-muted">Origem</p><p className="font-medium">{getOrigemLabel(cliente.origem)}</p></div>
                  <div><p className="text-xs text-muted">Plano Odontológico</p><p className="font-medium">{cliente.plano_odontologico || '-'}</p></div>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Contato</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted">Telefone</p><p className="font-medium">{cliente.telefone ? formatarTelefone(cliente.telefone) : '-'}</p></div>
                  <div><p className="text-xs text-muted">Email</p><p className="font-medium">{cliente.email || '-'}</p></div>
                  <div className="md:col-span-2"><p className="text-xs text-muted">Endereço</p><p className="font-medium">{cliente.endereco || '-'}</p></div>
                </div>
              </div>
              {cliente.observacoes && (
                <div>
                  <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Observações</h2>
                  <p className="whitespace-pre-wrap text-foreground/90">{cliente.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Card de Saldo — sempre visível no topo quando na aba dados */}
      {abaAtiva === 'dados' && !isEditing && (
        <Card>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Saldo do Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">Crédito em procedimentos</p>
              <p className="font-semibold text-lg">{formatarMoeda(saldo.saldo_calculado)}</p>
              <p className="text-xs text-muted mt-0.5">Soma dos valores pagos em procedimentos não concluídos</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saldo disponível</p>
              <p className={`text-lg font-semibold ${saldo.saldo > 0 ? 'text-success-700 dark:text-success-300' : ''}`}>{formatarMoeda(saldo.saldo)}</p>
              <p className="text-xs text-muted mt-0.5">Saldo real gerado por estornos</p>
            </div>
          </div>
          {saldo.saldo > 0 && (
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setModalTransferencia(true);
                  setTransferenciaDestinoId(null);
                  setTransferenciaDestinoNome('');
                  setTransferenciaValor('');
                  setTransferBusca('');
                  setTransferResultados([]);
                }}
              >
                Transferir saldo →
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ABA: ATENDIMENTOS */}
      {abaAtiva === 'atendimentos' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Atendimentos
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">
                {selectedAtendimentos.length} atendimento(s) selecionado(s)
              </span>
              <Button variant="secondary" onClick={selecionarTodosAtendimentos}>
                Selecionar todos
              </Button>
              <Button
                onClick={imprimirAtendimentosSelecionados}
                disabled={selectedAtendimentos.length === 0}
                variant="secondary"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Imprimir PDF
              </Button>
            </div>
          </div>
          {!ficha?.atendimentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum atendimento registrado</p>
          ) : (
            <table className="detail-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Selecionar</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Avaliador</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Pago</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ficha.atendimentos.map(a => (
                  <tr key={a.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedAtendimentos.includes(a.id)}
                        onChange={() => toggleSelecionarAtendimento(a.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">#{a.id}</td>
                    <td className="px-4 py-3 text-sm text-muted">{formatarDataHora(a.created_at)}</td>
                    <td className="px-4 py-3"><StatusBadge type="atendimento" status={a.status} /></td>
                    <td className="px-4 py-3 text-sm">{a.avaliador_nome || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatarMoeda(a.total ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-success-600 font-medium">{formatarMoeda(a.total_pago ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/atendimentos/${a.id}`} className="text-sm text-info-600 hover:text-info-800">Ver →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: PROCEDIMENTOS */}
      {abaAtiva === 'procedimentos' && (
        <Card>
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5" /> Procedimentos
              </h2>
              <p className="text-sm text-muted mt-1">
                Agora a leitura fica por grupo clínico dentro do atendimento, com os itens por dente/sessão abertos só quando necessário.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span>{procedimentosAgrupados.length} grupo(s)</span>
              <span>{ficha?.procedimentos.length ?? 0} item(ns)</span>
            </div>
          </div>
          {!ficha?.procedimentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum procedimento registrado</p>
          ) : (
            <div className="space-y-4">
              {procedimentosAgrupados.map((grupo) => {
                const atendimento = atendimentosPorId.get(grupo.atendimento_id);
                const itemPrincipal = grupo.itens[0];
                const statusGrupo = grupo.itens.every((item) => item.status === 'concluido')
                  ? 'concluido'
                  : grupo.itens.some((item) => item.status === 'executando')
                    ? 'executando'
                    : grupo.itens.some((item) => item.status === 'pago')
                      ? 'pago'
                      : 'pendente';
                const grupoACobrar = grupo.itens.some(isAcrescimoEmExecucaoACobrar);
                const dentesGrupo = Array.from(new Set(
                  grupo.itens
                    .flatMap((item) => parseDentesLabels(item.dentes))
                    .concat(grupo.itens.map((item) => item.dente_unico || '').filter(Boolean))
                ));

                return (
                  <details
                    key={grupo.key}
                    className="rounded-xl border border-border/70 bg-surface-secondary/35 open:bg-surface-secondary/55"
                    open={grupo.itens.length <= 2}
                  >
                    <summary className="cursor-pointer list-none px-4 py-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{grupo.grupo_label}</h3>
                            <StatusBadge
                              type="item"
                              status={statusGrupo}
                              item={grupoACobrar && statusGrupo === 'pago'
                                ? { status: 'pago', adicionado_em_execucao: 1, valor_pago: 0, valor_final: 1 }
                                : itemPrincipal}
                            />
                            <span className="rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              {grupo.itens.length} item(ns)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                            <span>
                              Atendimento{' '}
                              <Link href={`/atendimentos/${grupo.atendimento_id}`} className="text-info-600 hover:text-info-800">
                                #{grupo.atendimento_id}
                              </Link>
                            </span>
                            <span>Executor: {grupo.executor_nome || itemPrincipal.executor_nome || '-'}</span>
                            <span>Pago: <span className="font-medium text-foreground">{formatarMoeda(grupo.total_pago)}</span></span>
                            <span>Total: <span className="font-medium text-foreground">{formatarMoeda(grupo.total_valor)}</span></span>
                          </div>
                          {(dentesGrupo.length > 0 || atendimento) && (
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                              {dentesGrupo.length > 0 && (
                                <span>Dentes: {dentesGrupo.join(', ')}</span>
                              )}
                              {atendimento?.unidade_nome && <span>Unidade: {atendimento.unidade_nome}</span>}
                              <span>Último movimento: {formatarDataHora(grupo.ultimo_evento_em)}</span>
                            </div>
                          )}
                        </div>
                        {grupo.itens.length === 1 && (
                          <div className="flex items-center gap-3 xl:pl-6">
                            {itemPrincipal.valor_pago > 0 && itemPrincipal.status !== 'concluido' && (
                              <button
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleEstornarProcedimento(itemPrincipal);
                                }}
                                disabled={estornandoItemId === itemPrincipal.id}
                                className="text-sm text-warning-600 hover:text-warning-800 font-medium disabled:opacity-50"
                              >
                                {estornandoItemId === itemPrincipal.id ? 'Gerando...' : 'Gerar estorno'}
                              </button>
                            )}
                            <button
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setModalProcedimento(itemPrincipal);
                              }}
                              className="text-sm text-info-600 hover:text-info-800"
                            >
                              Ver →
                            </button>
                          </div>
                        )}
                      </div>
                    </summary>

                    <div className="border-t border-border/60 px-4 py-3">
                      <div className="overflow-x-auto">
                        <table className="detail-table">
                          <thead>
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Item</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Criado por</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Executor</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Pago</th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.itens.map((item) => {
                              const podeEstornar = item.valor_pago > 0 && item.status !== 'concluido';
                              const nomeItem = nomeProcedimentoItem({
                                procedimento_nome: item.procedimento_nome,
                                etapa_label: item.etapa_label,
                                dentes: item.dentes,
                                dente_unico: item.dente_unico,
                              });
                              return (
                                <tr key={item.id} className="hover:bg-surface-secondary">
                                  <td className="px-4 py-3">
                                    <div className="font-medium">{nomeItem}</div>
                                    {item.observacoes && (
                                      <p className="mt-1 text-xs text-muted line-clamp-2">{item.observacoes}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-sm">{item.criado_por_nome || '-'}</td>
                                  <td className="px-4 py-3 text-sm">{item.executor_nome || '-'}</td>
                                  <td className="px-4 py-3 text-right font-medium">{formatarMoeda(item.valor)}</td>
                                  <td className="px-4 py-3 text-right font-medium">{formatarMoeda(item.valor_pago)}</td>
                                  <td className="px-4 py-3 text-center"><StatusBadge type="item" status={item.status} item={item} /></td>
                                  <td className="px-4 py-3 text-sm text-muted">
                                    {formatarData(item.concluido_at || item.created_at)}
                                  </td>
                                  <td className="px-4 py-3 text-right space-x-3">
                                    {podeEstornar && (
                                      <button
                                        onClick={() => handleEstornarProcedimento(item)}
                                        disabled={estornandoItemId === item.id}
                                        className="text-sm text-warning-600 hover:text-warning-800 font-medium disabled:opacity-50"
                                      >
                                        {estornandoItemId === item.id ? 'Gerando...' : 'Gerar estorno'}
                                      </button>
                                    )}
                                    <button onClick={() => setModalProcedimento(item)} className="text-sm text-info-600 hover:text-info-800">
                                      Ver →
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ABA: PAGAMENTOS */}
      {abaAtiva === 'pagamentos' && (
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Pagamentos
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted">
                  {selectedPagamentos.length} pagamento(s) selecionado(s)
                </span>
                <Button variant="secondary" onClick={selecionarTodosPagamentos}>
                  Selecionar todos
                </Button>
                <Button
                  onClick={imprimirPagamentosSelecionados}
                  disabled={selectedPagamentos.length === 0}
                  variant="secondary"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Imprimir PDF
                </Button>
                <span className="text-sm font-semibold text-success-700 dark:text-success-300">
                  Total: {formatarMoeda(totalGasto)}
                </span>
              </div>
            </div>
            {!ficha?.pagamentos.length ? (
              <p className="text-center py-8 text-muted">Nenhum pagamento registrado</p>
            ) : (
              <table className="detail-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Selecionar</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atend.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Método</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Recebido por</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.pagamentos.map(p => (
                    <tr key={p.id} className={p.cancelado ? 'bg-muted/35 opacity-50' : undefined}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar pagamento ${p.id}`}
                          checked={selectedPagamentos.includes(p.id)}
                          onChange={() => toggleSelecionarPagamento(p.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">{formatarDataHora(p.created_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/atendimentos/${p.atendimento_id}`} className="text-info-600 hover:text-info-800">#{p.atendimento_id}</Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{getMetodoPagamentoLabel(p)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${p.cancelado ? 'text-muted-foreground line-through' : 'text-success-600 dark:text-success-300'}`}>
                        {formatarMoeda(p.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm">{p.recebido_por_nome || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setModalPagamento(p)} className="text-sm text-info-600 hover:text-info-800">Ver →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {ficha?.movimentacoes && ficha.movimentacoes.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5" /> Movimentações de Saldo
              </h2>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Descrição</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Saldo após</th>
                  </tr>
                </thead>
                <tbody>
                  {ficha.movimentacoes.map((m, i) => {
                    const isEntrada = ['credito', 'transferencia_entrada'].includes(m.tipo);
                    const cfg = HISTORICO_CONFIG[m.tipo] ?? { label: m.tipo, cor: 'bg-muted' };
                    return (
                      <tr key={i} className="hover:bg-surface-secondary">
                        <td className="px-4 py-3 text-sm text-muted">{formatarDataHora(m.data)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.cor}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted">{m.descricao || '-'}</td>
                        <td className={`px-4 py-3 text-right font-medium ${isEntrada ? 'text-success-600' : 'text-error-600'}`}>
                          {isEntrada ? '+' : '-'}{formatarMoeda(m.valor)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{formatarMoeda(m.saldo_novo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ABA: AGENDAMENTOS */}
      {abaAtiva === 'agendamentos' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" /> Agendamentos
            </h2>
            <Button
              onClick={() => push(`/agenda?open=1&cliente_id=${id}`)}
              variant="secondary"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Novo Agendamento
            </Button>
          </div>
          {!agendamentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum agendamento registrado</p>
          ) : (
            <table className="detail-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Procedimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Executor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atendimento</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map((agendamento) => {
                  const statusConfig = AGENDAMENTO_STATUS_CONFIG[agendamento.status];
                  return (
                    <tr key={agendamento.id} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3 text-sm">
                        {agendamento.data_agendada ? formatarDataHora(agendamento.data_agendada) : 'Sem data'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {agendamento.etapa_modelo_nome
                            ? `${agendamento.procedimento_nome} — ${agendamento.etapa_modelo_nome}`
                            : agendamento.procedimento_nome}
                        </div>
                        {agendamento.observacoes && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{agendamento.observacoes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{agendamento.executor_nome || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.bgCor} ${statusConfig.cor}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {agendamento.atendimento_origem_id ? (
                          <Link href={`/atendimentos/${agendamento.atendimento_origem_id}`} className="text-info-600 hover:text-info-800">
                            #{agendamento.atendimento_origem_id}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ABA: FOLLOWUPS */}
      {abaAtiva === 'followups' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5" /> Followups
            </h2>
            <Button
              onClick={() => push(`/followup?open=1&cliente_id=${id}`)}
              variant="secondary"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Nova Followup
            </Button>
          </div>
          {!followups.length ? (
            <p className="text-center py-8 text-muted">Nenhum followup registrado</p>
          ) : (
            <div className="space-y-3">
              {followups.map((followup) => {
                const tipoConfig = FOLLOWUP_TIPO_CONFIG[followup.tipo];
                return (
                  <div key={followup.id} className="rounded-lg border border-border p-4 hover:bg-surface-secondary">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{followup.titulo}</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tipoConfig.borderColor} border`}>
                            {tipoConfig.label}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${followup.status === 'concluida' ? 'bg-success-500/10 text-success-800 dark:text-success-200' : 'bg-warning-500/10 text-warning-800 dark:text-warning-200'}`}>
                            {FOLLOWUP_STATUS_LABELS[followup.status]}
                          </span>
                        </div>
                        {followup.descricao && (
                          <p className="mt-2 text-sm text-muted whitespace-pre-wrap">{followup.descricao}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                          <span>Vencimento: {formatarDataHora(followup.vencimento_em)}</span>
                          <span>Responsável: {followup.responsavel_usuario_nome}</span>
                          <span>Criado por: {followup.criado_por_nome}</span>
                          {followup.concluida_em && <span>Concluído em: {formatarDataHora(followup.concluida_em)}</span>}
                        </div>
                        {followup.nota_conclusao && (
                          <p className="mt-3 rounded-md bg-muted/35 px-3 py-2 text-sm text-foreground">
                            {followup.nota_conclusao}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ABA: PRONTUÁRIO */}
      {abaAtiva === 'prontuario' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" /> Prontuários de Execução
            </h2>
            <span className="text-sm text-muted">
              {ficha?.prontuarios.length ?? 0} procedimento(s) concluído(s)
            </span>
          </div>
          {!ficha?.prontuarios.length ? (
            <Card>
              <p className="text-center py-8 text-muted">Nenhum procedimento concluído</p>
            </Card>
          ) : (
            ficha.prontuarios.map(item => {
              const dentes = formatarDentes(item.dentes);
              return (
                <Card key={item.item_id}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-base">
                        {item.etapa_label ? `${item.procedimento_nome} — ${item.etapa_label}` : item.procedimento_nome}
                      </h3>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted">
                        {item.executor_nome && <span>Executor: <span className="text-foreground">{item.executor_nome}</span></span>}
                        {dentes && <span>Dentes: <span className="text-foreground">{dentes}</span></span>}
                        {item.quantidade > 1 && <span>Qtd: <span className="text-foreground">{item.quantidade}</span></span>}
                        <Link href={`/atendimentos/${item.atendimento_id}`} className="text-info-600 hover:text-info-800">
                          Atend. #{item.atendimento_id} →
                        </Link>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {item.concluido_at && (
                        <p className="text-xs text-muted">Concluído em</p>
                      )}
                      {item.concluido_at && (
                        <p className="text-sm font-medium">{formatarDataHora(item.concluido_at)}</p>
                      )}
                    </div>
                  </div>

                  {item.prontuario_descricao ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border-l-4 border-primary-400 bg-surface-secondary p-4">
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Descrição do Procedimento</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.prontuario_descricao}</p>
                      </div>
                      {item.prontuario_observacoes && (
                        <div className="rounded-lg border-l-4 border-warning-400 bg-warning-500/10 p-4">
                          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Observações</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{item.prontuario_observacoes}</p>
                        </div>
                      )}
                      {item.item_observacoes && (
                        <div className="rounded-lg border border-border p-4">
                          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Observações do Item</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{item.item_observacoes}</p>
                        </div>
                      )}
                      <div className="flex justify-end text-xs text-muted">
                        Prontuário preenchido por <span className="font-medium ml-1">{item.prontuario_autor}</span>
                        {item.prontuario_data && <span className="ml-2">em {formatarDataHora(item.prontuario_data)}</span>}
                        {item.prontuario_updated_at && item.prontuario_updated_at !== item.prontuario_data && (
                          <span className="ml-2">(atualizado em {formatarDataHora(item.prontuario_updated_at)})</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center">
                      <p className="text-sm text-muted">Prontuário não preenchido</p>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ABA: ANEXOS */}
      {abaAtiva === 'anexos' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Paperclip className="w-5 h-5" /> Anexos do Cliente
              </h2>
              <span className="text-sm text-muted">
                {anexosCliente.length} arquivo(s)
              </span>
            </div>
            <AnexosGallery
              anexos={anexosCliente}
              onUpload={handleUploadAnexo}
              onDelete={handleDeleteAnexo}
              onUpdate={handleUpdateAnexo}
              loading={anexosLoading}
              uploading={anexosUploading}
              maxSizeMB={10}
              acceptTypes="image/*,.pdf,.doc,.docx,.mp4,.webm,.mov"
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" /> Termos Digitais
              </h2>
              <span className="text-sm text-muted">
                {termosDigitais.length} termo(s)
              </span>
            </div>

            {isLoadingTermosDigitais ? (
              <LoadingState mode="spinner" text="Carregando termos digitais..." />
            ) : termosDigitais.length === 0 ? (
              <p className="text-center py-8 text-muted">Nenhum termo digital gerado para este cliente.</p>
            ) : (
              <div className="space-y-3">
                {termosDigitais.map((termoDigital) => (
                  <div key={termoDigital.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{termoDigital.termo_titulo}</p>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${TERMO_DIGITAL_STATUS_CLASSES[termoDigital.status] || 'bg-muted text-foreground border-border'}`}>
                            {TERMO_DIGITAL_STATUS_LABELS[termoDigital.status] || termoDigital.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted">
                          Signatário: <span className="text-foreground">{termoDigital.signatario_nome}</span>
                        </p>
                        <p className="text-xs text-muted">
                          Criado em {formatarDataHora(termoDigital.created_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Copy className="w-3.5 h-3.5" />}
                          onClick={() => copiarLinkTermoDigital(termoDigital.autentique_short_link)}
                        >
                          Copiar link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<ExternalLink className="w-3.5 h-3.5" />}
                          onClick={() => window.open(termoDigital.autentique_short_link, '_blank', 'noopener,noreferrer')}
                        >
                          Abrir link
                        </Button>
                        {termoDigital.pdf_assinado_url && (
                          <Button
                            size="sm"
                            icon={<ExternalLink className="w-3.5 h-3.5" />}
                            onClick={() => window.open(termoDigital.pdf_assinado_url!, '_blank', 'noopener,noreferrer')}
                          >
                            PDF assinado
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted mb-1">Slug</p>
                        <p>{termoDigital.termo_slug}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted mb-1">Visualizado em</p>
                        <p>{termoDigital.viewed_at ? formatarDataHora(termoDigital.viewed_at) : 'Ainda não'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted mb-1">Assinado em</p>
                        <p>{termoDigital.signed_at ? formatarDataHora(termoDigital.signed_at) : 'Ainda não'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted mb-1">Concluído em</p>
                        <p>{termoDigital.finished_at ? formatarDataHora(termoDigital.finished_at) : 'Aguardando'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5" /> Fotos e Arquivos dos Prontuários
              </h2>
              <span className="text-sm text-muted">
                {anexosProntuario.length} arquivo(s)
              </span>
            </div>

            {anexosLoading ? (
              <LoadingState mode="spinner" text="Carregando anexos..." />
            ) : anexosProntuario.length === 0 ? (
              <p className="text-center py-8 text-muted">Nenhum arquivo encontrado nos prontuários.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {anexosProntuario.map((anexo) => (
                  <div key={`${anexo.origem}-${anexo.itemAtendimentoId}-${anexo.id}`} className="rounded-lg border border-border overflow-hidden">
                    {isImagem(anexo.tipo) ? (
                      <a href={anexo.url} target="_blank" rel="noopener noreferrer">
                        {/* URL dinâmica de upload/prontuário; next/image não cobre esse caso sem configuração extra de domínio. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={anexo.url}
                          alt={anexo.nome}
                          className="w-full h-32 object-cover hover:opacity-90"
                        />
                      </a>
                    ) : (
                      <a href={anexo.url} target="_blank" rel="noopener noreferrer">
                        <div className="w-full h-32 flex items-center justify-center bg-muted">
                          <span className="text-3xl">📄</span>
                        </div>
                      </a>
                    )}

                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium text-foreground truncate">{anexo.nome}</p>
                      <p className="text-xs text-muted">
                        {anexo.procedimentoNome ? (
                          <span>{anexo.procedimentoNome}
                            {anexo.etapaLabel ? ` — ${anexo.etapaLabel}` : ''}</span>
                        ) : (
                          'Registro de prontuário'
                        )}
                      </p>
                      {anexo.atendimentoId && (
                        <p className="text-xs text-muted">
                          Atend. #{anexo.atendimentoId}
                        </p>
                      )}
                      {anexo.usuarioNome && (
                        <p className="text-xs text-muted">Enviado por {anexo.usuarioNome}</p>
                      )}
                      {anexo.descricao && (
                        <p className="text-xs text-muted line-clamp-2">{anexo.descricao}</p>
                      )}
                      <p className="text-xs text-muted">{formatarTamanhoArquivo(anexo.tamanho)} · {formatarDataHora(anexo.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ABA: HISTÓRICO */}
      {abaAtiva === 'historico' && (
        <Card>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5" /> Histórico de Eventos
          </h2>
          {!ficha?.historico.length ? (
            <p className="text-center py-8 text-muted">Nenhum evento registrado</p>
          ) : (() => {
            const TIPOS_SALDO = new Set(['credito', 'debito', 'estorno', 'transferencia_saida', 'transferencia_entrada']);
            const eventosAtendimento = ficha.historico.filter(ev => !TIPOS_SALDO.has(ev.tipo));
            const eventosSaldo = ficha.historico.filter(ev => TIPOS_SALDO.has(ev.tipo));
            const renderTimeline = (eventos: EventoHistorico[]) => (
              <div className="relative">
                <div className="absolute bottom-0 left-4 top-0 w-0.5 bg-border" />
                <div className="space-y-4">
                  {eventos.map((ev, i) => {
                    const cfg = HISTORICO_CONFIG[ev.tipo] ?? { label: ev.tipo, cor: 'bg-muted' };
                    return (
                      <div key={i} className="flex gap-4 relative">
                        <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 z-10 ${cfg.cor}`} style={{ marginLeft: '10px' }} />
                        <div className="flex-1 pb-2">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{cfg.label}</span>
                              <p className="text-sm text-foreground mt-0.5">{ev.descricao}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted">{formatarDataHora(ev.data)}</p>
                              {ev.ref_id > 0 && (
                                <Link href={`/atendimentos/${ev.ref_id}`} className="text-xs text-info-600 hover:text-info-800">
                                  Ver atend. →
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            return (
              <div className="space-y-6">
                {eventosAtendimento.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-4">Atendimentos & Procedimentos</h3>
                    {renderTimeline(eventosAtendimento)}
                  </div>
                )}
                {eventosSaldo.length > 0 && (
                  <div>
                    <h3 className="border-t border-border pt-2 text-xs font-semibold uppercase tracking-wide text-muted mb-4">Movimentações de Saldo</h3>
                    {renderTimeline(eventosSaldo)}
                  </div>
                )}
              </div>
            );
          })()}
        </Card>
      )}

      {/* ABA: VINCULADOS */}
      {abaAtiva === 'vinculados' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" /> Clientes Vinculados
            </h2>
            <Button onClick={() => { setModalAddVinculo(true); setVinculoBusca(''); setVinculoClienteSelecionado(null); setVinculoObservacao(''); }}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Vínculo
            </Button>
          </div>
          {!vinculos.length ? (
            <p className="text-center py-8 text-muted">Nenhum vínculo cadastrado</p>
          ) : (
            <div className="space-y-3">
              {vinculos.map(v => (
                <div key={v.id} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 hover:bg-surface-secondary">
                  <div className="flex-1 min-w-0">
                    <Link href={`/clientes/${v.outro_cliente_id}`} className="font-medium text-info-600 hover:text-info-800 hover:underline">
                      {v.outro_cliente_nome}
                    </Link>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted">
                      {v.outro_cliente_cpf && <span>CPF: {v.outro_cliente_cpf}</span>}
                      {v.outro_cliente_telefone && <span>Tel: {v.outro_cliente_telefone}</span>}
                    </div>
                    {v.observacao && (
                      <p className="mt-2 whitespace-pre-wrap rounded bg-muted/35 px-3 py-2 text-sm text-foreground">{v.observacao}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveVinculo(v)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-error-600"
                    title="Remover vínculo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* MODAL: Adicionar Vínculo */}
      {modalAddVinculo && (
        <Modal
          isOpen={modalAddVinculo}
          onClose={() => setModalAddVinculo(false)}
          title="Adicionar Vínculo"
          size="md"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModalAddVinculo(false)}>Cancelar</Button>
              <Button onClick={handleAddVinculo} disabled={!vinculoClienteSelecionado || vinculoSaving}>
                {vinculoSaving ? 'Salvando...' : 'Vincular'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Buscar cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="text"
                  className="field-control w-full py-2 pl-9 pr-3 text-sm"
                  placeholder="Nome, CPF ou telefone..."
                  value={vinculoBusca}
                  onChange={e => { setVinculoBusca(e.target.value); setVinculoClienteSelecionado(null); }}
                  autoFocus
                />
              </div>
              {vinculoBuscaResultados.length > 0 && !vinculoClienteSelecionado && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {vinculoBuscaResultados.map(c => (
                    <button
                      key={c.id}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary"
                      onClick={() => { setVinculoClienteSelecionado(c); setVinculoBusca(c.nome); setVinculoBuscaResultados([]); }}
                    >
                      <span className="font-medium">{c.nome}</span>
                      {c.cpf && <span className="text-muted ml-2">{c.cpf}</span>}
                      {c.telefone && <span className="text-muted ml-2">{c.telefone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {vinculoClienteSelecionado && (
                <div className="tone-primary mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">{vinculoClienteSelecionado.nome}</span>
                  <button onClick={() => { setVinculoClienteSelecionado(null); setVinculoBusca(''); }} className="ml-auto text-primary hover:text-primary/80 text-xs">Trocar</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Observação <span className="text-muted font-normal">(opcional)</span></label>
              <textarea
                className="field-control w-full resize-none px-3 py-2 text-sm"
                rows={3}
                placeholder="Descreva o vínculo entre eles..."
                value={vinculoObservacao}
                onChange={e => setVinculoObservacao(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Procedimento */}
      {modalProcedimento && (
        <Modal
          isOpen={!!modalProcedimento}
          onClose={() => setModalProcedimento(null)}
          title={modalProcedimento.etapa_label ? `${modalProcedimento.procedimento_nome} — ${modalProcedimento.etapa_label}` : modalProcedimento.procedimento_nome}
          size="md"
          footer={
            <Link href={`/atendimentos/${modalProcedimento.atendimento_id}`}>
              <Button variant="secondary" onClick={() => setModalProcedimento(null)}>
                Abrir Atendimento #{modalProcedimento.atendimento_id} →
              </Button>
            </Link>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusBadge type="item" status={modalProcedimento.status} item={modalProcedimento} />
              {modalProcedimento.concluido_at && (
                <span className="text-xs text-muted">Concluído em {formatarDataHora(modalProcedimento.concluido_at)}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor</p>
                <p className="font-semibold text-lg">{formatarMoeda(modalProcedimento.valor)}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor Pago</p>
                <p className={`font-semibold text-lg ${modalProcedimento.valor_pago >= modalProcedimento.valor ? 'text-success-600' : 'text-warning-600'}`}>
                  {formatarMoeda(modalProcedimento.valor_pago)}
                </p>
              </div>
              {modalProcedimento.executor_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Executor</p>
                  <p className="font-medium">{modalProcedimento.executor_nome}</p>
                </div>
              )}
              {modalProcedimento.criado_por_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Vendido por</p>
                  <p className="font-medium">{modalProcedimento.criado_por_nome}</p>
                </div>
              )}
              {modalProcedimento.quantidade > 1 && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Quantidade</p>
                  <p className="font-medium">{modalProcedimento.quantidade}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Adicionado em</p>
                <p className="font-medium">{formatarDataHora(modalProcedimento.created_at)}</p>
              </div>
            </div>

            {modalProcedimento.dentes && (() => {
              const dentes = parseDentesLabels(modalProcedimento.dentes);
              return dentes.length > 0 ? (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide mb-1">Dentes</p>
                  <div className="flex flex-wrap gap-1">
                    {dentes.map(d => (
                      <span key={d} className="px-2 py-0.5 bg-surface-secondary rounded text-sm font-mono">{d}</span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {modalProcedimento.observacoes && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">{modalProcedimento.observacoes}</p>
              </div>
            )}

          </div>
        </Modal>
      )}

      {/* MODAL: Pagamento */}
      {modalPagamento && (
        <Modal
          isOpen={!!modalPagamento}
          onClose={() => setModalPagamento(null)}
          title={`Pagamento — ${formatarMoeda(modalPagamento.valor)}`}
          size="sm"
          footer={
            <Link href={`/atendimentos/${modalPagamento.atendimento_id}`}>
              <Button variant="secondary" onClick={() => setModalPagamento(null)}>
                Abrir Atendimento #{modalPagamento.atendimento_id} →
              </Button>
            </Link>
          }
        >
          <div className="space-y-4">
            {modalPagamento.cancelado ? (
              <div className="tone-error rounded-lg p-3">
                <p className="text-sm font-semibold text-error-700">Pagamento Cancelado</p>
                {modalPagamento.motivo_cancelamento && (
                  <p className="text-sm text-error-600 mt-1">Motivo: {modalPagamento.motivo_cancelamento}</p>
                )}
              </div>
            ) : (
              <div className="tone-success rounded-lg p-3">
                <p className="text-sm font-semibold text-success-700 dark:text-success-300">Pagamento Confirmado</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Valor</p>
                <p className={`text-lg font-semibold ${modalPagamento.cancelado ? 'text-muted-foreground line-through' : 'text-success-600 dark:text-success-300'}`}>
                  {formatarMoeda(modalPagamento.valor)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Método</p>
                <p className="font-medium">{getMetodoPagamentoLabel(modalPagamento)}</p>
              </div>
              {modalPagamento.recebido_por_nome && (
                <div>
                  <p className="text-xs text-muted uppercase tracking-wide">Recebido por</p>
                  <p className="font-medium">{modalPagamento.recebido_por_nome}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Data</p>
                <p className="font-medium">{formatarDataHora(modalPagamento.created_at)}</p>
              </div>
            </div>

            {modalPagamento.observacoes && !modalPagamento.cancelado && (
              <div>
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Observações</p>
                <p className="text-sm whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">{modalPagamento.observacoes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      <Modal
        isOpen={modalTermoAberto}
        onClose={fecharModalTermo}
        title="Gerar termo"
        size={modoGeracaoTermo === 'digital' ? 'xl' : 'md'}
        footer={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-h-[20px] flex-1">
              {termoModalError ? (
                <p className="text-sm font-medium text-error-600">{termoModalError}</p>
              ) : termoModalSuccess ? (
                <p className="text-sm font-medium text-success-700">{termoModalSuccess}</p>
              ) : null}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={fecharModalTermo}>
                Fechar
              </Button>
              {modoGeracaoTermo === 'digital' && termoDigitalGerado ? (
                <>
                  <Button variant="outline" onClick={() => copiarLinkTermoDigital(termoDigitalGerado.shortLink)}>
                    Copiar link
                  </Button>
                  <Button onClick={() => window.open(termoDigitalGerado.shortLink, '_blank', 'noopener,noreferrer')}>
                    Abrir link
                  </Button>
                </>
              ) : modoGeracaoTermo === 'digital' ? (
                <Button
                  onClick={gerarTermoDigital}
                  disabled={
                    isGerandoTermoDigital
                    || !termoSelecionado
                    || !termoSelecionadoPermiteAutentique
                    || isCarregandoPreviewTermo
                    || !termoDraft
                  }
                >
                  {!termoSelecionadoPermiteAutentique
                    ? 'Disponível só para impressão'
                    : isGerandoTermoDigital
                    ? 'Gerando link...'
                    : !termoDraft && termoSelecionado
                      ? 'Preparando revisão...'
                      : 'Gerar link no Autentique'}
                </Button>
              ) : (
                <Button onClick={gerarTermoImpressao} disabled={isAbrindoTermo || !termoSelecionado}>
                  {isAbrindoTermo ? 'Gerando...' : 'Gerar e abrir'}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Escolha se você quer gerar a versão para impressão ou montar o termo digital com revisão antes de enviar ao Autentique.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={modoGeracaoTermo === 'impressao' ? 'primary' : 'outline'}
              onClick={() => handleModoGeracaoTermoChange('impressao')}
            >
              Impressão
            </Button>
            <Button
              variant={modoGeracaoTermo === 'digital' ? 'primary' : 'outline'}
              onClick={() => handleModoGeracaoTermoChange('digital')}
            >
              Digital no Autentique
            </Button>
          </div>

          {termos.length === 0 && !isLoadingTermos ? (
            <p className="text-sm text-muted">Nenhum termo ativo disponível no momento.</p>
          ) : (
            <>
              <label className="block">
                <span className="block text-sm font-medium mb-1">Termo</span>
                <select
                  value={termoSelecionado}
                  onChange={(e) => handleSelecionarTermo(e.target.value)}
                  className="field-control w-full"
                  required
                >
                  <option value="">Selecione...</option>
                  {termos.map((termo) => (
                    <option key={termo.id} value={termo.slug}>
                      {termo.titulo}{termo.permite_autentique === 0 ? ' (somente impressão)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {modoGeracaoTermo === 'impressao' ? (
                <p className="text-sm text-muted">A impressão usa o mesmo fluxo atual em PDF, pronto para abrir e imprimir.</p>
              ) : termoDigitalGerado ? (
                <div className="rounded-xl tone-success p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-success-700 dark:text-success-200">Link de assinatura criado</p>
                    <p className="text-sm text-foreground">
                      O termo digital foi enviado para o Autentique e já está disponível para assinatura por link.
                    </p>
                  </div>
                  <div className="rounded-lg border border-success-500/25 bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-success-700 dark:text-success-300 mb-1">Link</p>
                    <p className="text-sm break-all text-foreground">{termoDigitalGerado.shortLink}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O acompanhamento desse termo ficará disponível na aba Anexos, na seção Termos digitais.
                  </p>
                </div>
              ) : termoSelecionado && !termoSelecionadoPermiteAutentique ? (
                <div className="rounded-xl border border-warning-400/35 bg-warning-100/70 p-4 space-y-2">
                  <p className="text-sm font-medium text-warning-900">Este termo é somente para impressão</p>
                  <p className="text-sm text-warning-900/90">
                    A referência de implante permanece com linhas e tabela para preenchimento manual, então ela não entra no fluxo digital do Autentique.
                  </p>
                </div>
              ) : termoSelecionado ? (
                <div className="space-y-4">
                  {isCarregandoPreviewTermo && !termoPreviewHtml ? (
                    <LoadingState mode="spinner" text="Preparando revisão do termo..." />
                  ) : (
                    <>
                      <div className="rounded-xl border border-border bg-surface-secondary/60 p-4 space-y-2">
                        <p className="text-sm font-medium">Revisão antes do envio</p>
                        <p className="text-sm text-muted">
                          Revise os campos abaixo. Só aparecem os placeholders usados neste termo específico.
                        </p>
                        <p className="text-xs text-muted">
                          {camposPendentesTermo.length > 0
                            ? `${camposPendentesTermo.length} campo(s) pendente(s): ${camposPendentesResumoTermo}.`
                            : 'Todos os campos necessários já estão preenchidos.'}
                        </p>
                      </div>

                      {termoDraft?.campos.length ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {termoDraft.campos.map((campo) => {
                            const value = termoPlaceholders[campo.key] ?? '';
                            const campoError = termoTentouGerarDigital && campo.required && !value.trim()
                              ? 'Campo obrigatório.'
                              : undefined;
                            const hint = campo.source === 'cliente'
                              ? 'Valor puxado do cadastro do paciente.'
                              : campo.source === 'unidade'
                                ? 'Valor puxado da unidade atual.'
                                : 'Campo manual deste termo.';

                            if (campo.tipo === 'textarea') {
                              return (
                                <Textarea
                                  key={campo.key}
                                  label={campo.label}
                                  name={campo.key}
                                  value={value}
                                  onChange={(nextValue) => handleChangeCampoTermo(campo.key, nextValue)}
                                  required={campo.required}
                                  error={campoError}
                                  hint={campoError ? undefined : hint}
                                  rows={4}
                                />
                              );
                            }

                            return (
                              <Input
                                key={campo.key}
                                label={campo.label}
                                name={campo.key}
                                value={value}
                                onChange={(nextValue) => handleChangeCampoTermo(campo.key, nextValue)}
                                required={campo.required}
                                error={campoError}
                                hint={campoError ? undefined : hint}
                                type={campo.tipo === 'email' ? 'email' : campo.tipo === 'tel' ? 'tel' : 'text'}
                                mask={campo.tipo === 'cpf' ? 'cpf' : campo.tipo === 'tel' ? 'telefone' : undefined}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Esse termo não possui campos variáveis para revisão manual.</p>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Prévia que será enviada ao Autentique</p>
                          {isCarregandoPreviewTermo && (
                            <p className="text-xs text-muted">Atualizando prévia...</p>
                          )}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                          {termoPreviewDocumento ? (
                            <div className="overflow-hidden rounded-lg border border-border/70 bg-white shadow-sm">
                              <iframe
                                title="Prévia do termo digital"
                                srcDoc={termoPreviewDocumento}
                                className="h-[760px] w-full bg-white"
                              />
                            </div>
                          ) : (
                            <div className="p-6 text-sm text-muted">Selecione um termo para carregar a prévia.</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">Selecione um termo para abrir a revisão digital.</p>
              )}
            </>
          )}
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

      {/* MODAL: Transferir Saldo */}
      <Modal
        isOpen={modalTransferencia}
        onClose={() => setModalTransferencia(false)}
        title="Transferir saldo"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModalTransferencia(false)}>Cancelar</Button>
            <Button
              onClick={handleTransferir}
              disabled={!transferenciaDestinoId || !transferenciaValor || transferindo}
            >
              {transferindo ? 'Transferindo...' : 'Confirmar transferência'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Saldo disponível: <span className="font-semibold">{formatarMoeda(saldo.saldo)}</span>
          </p>

          <div>
            <label className="block text-sm font-medium mb-1">Cliente destino *</label>
            {transferenciaDestinoId ? (
              <div className="tone-success flex items-center gap-2 rounded-lg p-2">
                <span className="flex-1 text-sm font-medium text-foreground">{transferenciaDestinoNome}</span>
                <button
                  onClick={() => { setTransferenciaDestinoId(null); setTransferenciaDestinoNome(''); setTransferBusca(''); setTransferResultados([]); }}
                  className="text-sm text-error-600 hover:text-error-800"
                >
                  Alterar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={transferBusca}
                  onChange={(e) => setTransferBusca(e.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  className="input w-full"
                  autoFocus
                />
                {transferResultados.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {transferResultados.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setTransferenciaDestinoId(c.id); setTransferenciaDestinoNome(c.nome); setTransferBusca(''); setTransferResultados([]); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent/40"
                      >
                        {c.nome}
                        {c.cpf && <span className="text-muted ml-2">({c.cpf})</span>}
                      </button>
                    ))}
                  </div>
                )}
                {transferBuscando && <p className="text-xs text-muted mt-1">Buscando...</p>}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Valor a transferir (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldo.saldo}
              value={transferenciaValor}
              onChange={(e) => setTransferenciaValor(e.target.value)}
              placeholder="0,00"
              className="input w-full"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
