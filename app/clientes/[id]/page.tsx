'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AgendamentoCompleto, Cliente, FollowupTarefaCompleta, VinculoCliente } from '@/lib/types';
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
} from 'lucide-react';
import { PageHeader, Card, Button, Alert, LoadingState, EmptyState, ConfirmDialog, Tabs, Modal } from '@/components/ui';
import { StatusBadge, ClienteForm, ClienteFormData, AnexosGallery } from '@/components/domain';
import { formatarData, formatarDataHora, formatarMoeda, formatarCPF, formatarTelefone, formatarDentes, parseDentesLabels, nomeProcedimentoItem } from '@/lib/utils/formatters';
import { finalizarJanelaDeImpressao } from '@/lib/utils/print';
import { getOrigemLabel } from '@/lib/constants/origens';
import { AGENDAMENTO_STATUS_CONFIG } from '@/lib/constants/agendamentos';
import { FOLLOWUP_STATUS_LABELS, FOLLOWUP_TIPO_CONFIG } from '@/lib/constants/followup';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { buildTermoPrintableDocument } from '@/lib/helpers/termosDocumento';
import usePageTitle from '@/lib/utils/usePageTitle';

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
  procedimento:           { label: 'Procedimento',           cor: 'bg-neutral-400' },
  etapa_concluida:        { label: 'Etapa concluída',        cor: 'bg-success-400' },
  credito:                { label: 'Crédito de saldo',       cor: 'bg-success-600' },
  debito:                 { label: 'Débito de saldo',        cor: 'bg-error-500' },
  estorno:                { label: 'Estorno',                cor: 'bg-warning-600' },
  transferencia_saida:    { label: 'Transf. enviada',        cor: 'bg-error-400' },
  transferencia_entrada:  { label: 'Transf. recebida',       cor: 'bg-success-400' },
};

interface Atendimento {
  id: number;
  status: string;
  avaliador_nome: string | null;
  unidade_nome: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
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
  valor_pago: number;
  status: string;
  dentes: string | null;
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
  observacoes: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  recebido_por_nome: string | null;
  unidade_id: number | null;
  unidade_nome: string | null;
  unidade_endereco: string | null;
  unidade_telefone: string | null;
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
}

interface FichaData {
  atendimentos: Atendimento[];
  procedimentos: ItemProcedimento[];
  pagamentos: Pagamento[];
  pagamentos_alocacoes: PagamentoAlocacao[];
  historico: EventoHistorico[];
  prontuarios: ItemProntuario[];
  movimentacoes: Movimentacao[];
}

interface UnidadeImpressao {
  nome: string | null;
  endereco: string | null;
  telefone: string | null;
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
  const [modalTermoAberto, setModalTermoAberto] = useState(false);
  const [termoSelecionado, setTermoSelecionado] = useState('');

  const router = useRouter();
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
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
        if (!resCliente.ok) { router.push('/clientes'); return; }
        setCliente(await resCliente.json());
        if (resFicha.ok) {
          const fichaData = await resFicha.json() as FichaData;
          setFicha(fichaData);
          await carregarAnexos(fichaData.prontuarios);
        }
        await Promise.all([
          carregarTermosCliente(),
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
  }, [id, router, loadVinculos, carregarSaldo, carregarAgendamentos, carregarFollowups, carregarAnexos, carregarTermosCliente]);

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
          router.push('/clientes');
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
    setTermoSelecionado('');
    setModalTermoAberto(true);
  };

  const gerarTermo = async () => {
    if (!cliente) return;
    if (!termoSelecionado) {
      setError('Selecione um termo para gerar.');
      return;
    }

    setIsAbrindoTermo(true);
    try {
      const res = await fetch(`/api/clientes/${id}/termos/${encodeURIComponent(termoSelecionado)}/render`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Erro ao gerar termo.');
        return;
      }

      const html = String(data.html || '').trim();
      if (!html) {
        setError('Termo vazio.');
        return;
      }

      const titulo = String(data.titulo || 'Termo');
      const janela = window.open('', '_blank');
      if (!janela) {
        setError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-up está ativo.');
        return;
      }

      janela.document.write(buildTermoPrintableDocument(titulo, html));
      finalizarJanelaDeImpressao(janela);
      setModalTermoAberto(false);
      setSuccess('Termo pronto para impressão.');
    } catch {
      setError('Erro ao gerar termo.');
    } finally {
      setIsAbrindoTermo(false);
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

  const getMetodoPagamentoLabel = (metodo: string) => METODOS_LABEL[metodo] || metodo;

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
            :root { --sorria-orange: #ea580c; }
            body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #0f172a; font-size: 12px; background: #ffffff; }
            h1 { font-size: 20px; margin: 0; color: #0f172a; letter-spacing: 0.2px; }
            h2 { font-size: 14px; margin: 16px 0 8px; color: var(--sorria-orange); }
            h3 { font-size: 12px; margin: 12px 0 6px; }
            .section { margin-top: 16px; border-top: 1px solid #cbd5e1; padding-top: 12px; page-break-inside: avoid; }
            .header { border: 1px solid #fed7aa; padding: 14px 14px 12px; margin-bottom: 14px; background: #fff7ed; border-radius: 6px; }
            .summary { margin: 12px 0; background: #fff; border: 1px solid #fed7aa; border-radius: 6px; padding: 10px 12px; }
            .report-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand img { width: 40px; height: 40px; object-fit: contain; }
            .brand-text { color: var(--sorria-orange); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
            th { background: #ffedd5; color: #7c2d12; }
            ul { padding-left: 16px; margin: 0; }
            .compact-list { padding-left: 14px; margin: 0; }
            .compact-list li { margin-bottom: 3px; }
            .muted { color: #64748b; }
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
        pagamento.unidade_endereco || '',
        pagamento.unidade_telefone || '',
      ].join('|');

      if (!unidades.has(key)) {
        unidades.set(key, {
          nome: pagamento.unidade_nome,
          endereco: pagamento.unidade_endereco,
          telefone: pagamento.unidade_telefone,
          multipla: false,
        });
      }
    }

    if (unidades.size === 1) {
      return Array.from(unidades.values())[0];
    }

    return {
      nome: 'múltiplas unidades',
      endereco: null,
      telefone: null,
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

    const emitidoEm = new Date().toLocaleString('pt-BR');
    const empresaTitulo = unidade.nome ? `Sorria Leste - ${unidade.nome}` : 'Sorria Leste';
    const empresaEndereco = unidade.multipla ? 'Endereço conforme unidade do pagamento' : (unidade.endereco || 'Endereço não informado');
    const empresaTelefone = unidade.multipla ? 'Telefone conforme unidade do pagamento' : (unidade.telefone || 'Telefone não informado');

    janela.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Recibo de Pagamento - ${escapeHtml(cliente.nome)}</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #0f172a; font-size: 12px; background: #ffffff; }
            h2 { font-size: 14px; margin: 16px 0 8px; color: #ea580c; }
            .receipt-page { max-width: 980px; margin: 0 auto; }
            .coupon-header { border: 1px dashed #94a3b8; padding: 12px; text-align: center; font-family: "Courier New", Courier, monospace; line-height: 1.35; }
            .coupon-company { font-size: 15px; font-weight: 700; text-transform: uppercase; }
            .coupon-title { margin-top: 6px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
            .coupon-separator { border-top: 1px dashed #94a3b8; margin: 8px 0; }
            .customer-box { border: 1px dashed #cbd5e1; border-top: 0; padding: 10px 12px; font-family: "Courier New", Courier, monospace; }
            .summary { margin: 12px 0; background: #fff; border: 1px dashed #94a3b8; border-radius: 6px; padding: 10px 12px; }
            .summary-row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; font-family: "Courier New", Courier, monospace; }
            .summary-row.total { border-top: 1px dashed #94a3b8; margin-top: 6px; padding-top: 8px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; vertical-align: top; }
            th { background: #ffedd5; color: #7c2d12; }
            ul { padding-left: 16px; margin: 0; }
            .compact-list { padding-left: 14px; margin: 0; }
            .compact-list li { margin-bottom: 3px; }
            .muted { color: #64748b; }
          </style>
        </head>
        <body>
          <main class="receipt-page">
            <div class="coupon-header">
              <div class="coupon-company">${escapeHtml(empresaTitulo)}</div>
              <div>${escapeHtml(empresaEndereco)}</div>
              <div>Telefone: ${escapeHtml(empresaTelefone)}</div>
              <div class="coupon-separator"></div>
              <div class="coupon-title">RECIBO DE PAGAMENTO</div>
              <div class="muted">Documento não fiscal</div>
              <div>Emissão: ${escapeHtml(emitidoEm)}</div>
            </div>
            <div class="customer-box">
              <div><strong>Cliente:</strong> ${escapeHtml(cliente.nome)}</div>
              <div><strong>CPF:</strong> ${escapeHtml(formatarCPF(cliente.cpf))}</div>
            </div>
            <div class="summary">
              <div class="summary-row"><span>Pagamentos</span><strong>${escapeHtml(String(quantidadePagamentos))}</strong></div>
              <div class="summary-row total"><span>Total recebido</span><strong>${formatarMoeda(totalPagamentos)}</strong></div>
            </div>
            ${conteudoHtml}
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

    const formatMetodo = (metodo: string) => escapeHtml(getMetodoPagamentoLabel(metodo));

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
              <td colspan=\"7\" style=\"padding-top:0; font-size:11px; color:#64748b;\">
                Observações: ${escapeHtml(item.observacoes || '-')}
              </td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" class="muted">Nenhum procedimento registrado</td></tr>';

      const pagamentosHtml = pagamentos.length
        ? pagamentos.map((pagamento) => `
          <tr>
            <td>${formatarDataHora(pagamento.created_at)}</td>
            <td>${formatMetodo(pagamento.metodo)}</td>
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

    const formatMetodo = (metodo: string) => escapeHtml(getMetodoPagamentoLabel(metodo));
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
          <td>${formatMetodo(pagamento.metodo)}</td>
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
      onAction={() => router.push('/clientes')}
    />
  );

  const totalGasto = ficha?.pagamentos.filter(p => !p.cancelado).reduce((s, p) => s + p.valor, 0) ?? 0;

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
    { key: 'anexos', label: 'Anexos', count: anexosCliente.length + anexosProntuario.length },
    { key: 'historico', label: 'Histórico', count: ficha?.historico.length },
    { key: 'vinculados', label: 'Vinculados', count: vinculos.length },
  ];

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
                        const hoje = new Date();
                        const nasc = new Date(cliente.data_nascimento);
                        let idade = hoje.getFullYear() - nasc.getFullYear();
                        const m = hoje.getMonth() - nasc.getMonth();
                        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
                        return idade >= 0 ? <span className="text-sm text-muted ml-1">({idade} anos)</span> : null;
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
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5" /> Procedimentos
          </h2>
          {!ficha?.procedimentos.length ? (
            <p className="text-center py-8 text-muted">Nenhum procedimento registrado</p>
          ) : (
            <table className="detail-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Procedimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Atend.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Executor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor Pago</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ficha.procedimentos.map(p => {
                  const podeEstornar = p.valor_pago > 0 && p.status !== 'concluido';
                  return (
                  <tr key={p.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3 font-medium">
                      {p.etapa_label ? `${p.procedimento_nome} — ${p.etapa_label}` : p.procedimento_nome}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/atendimentos/${p.atendimento_id}`} className="text-info-600 hover:text-info-800">#{p.atendimento_id}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{p.executor_nome || '-'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatarMoeda(p.valor_pago)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge type="item" status={p.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted">{formatarData(p.created_at)}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      {podeEstornar && (
                        <button
                          onClick={() => handleEstornarProcedimento(p)}
                          disabled={estornandoItemId === p.id}
                          className="text-sm text-warning-600 hover:text-warning-800 font-medium disabled:opacity-50"
                        >
                          {estornandoItemId === p.id ? 'Gerando...' : 'Gerar estorno'}
                        </button>
                      )}
                      <button onClick={() => setModalProcedimento(p)} className="text-sm text-info-600 hover:text-info-800">Ver →</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
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
                      <td className="px-4 py-3 text-sm">{METODOS_LABEL[p.metodo] || p.metodo}</td>
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
                    const cfg = HISTORICO_CONFIG[m.tipo] ?? { label: m.tipo, cor: 'bg-neutral-400' };
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
              onClick={() => router.push(`/agenda?open=1&cliente_id=${id}`)}
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
              onClick={() => router.push(`/followup?open=1&cliente_id=${id}`)}
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
                    const cfg = HISTORICO_CONFIG[ev.tipo] ?? { label: ev.tipo, cor: 'bg-neutral-400' };
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
              <StatusBadge type="item" status={modalProcedimento.status} />
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
                <p className="font-medium">{METODOS_LABEL[modalPagamento.metodo] || modalPagamento.metodo}</p>
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
        onClose={() => {
          setModalTermoAberto(false);
          setTermoSelecionado('');
        }}
        title="Gerar termo"
        size="md"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => {
              setModalTermoAberto(false);
              setTermoSelecionado('');
            }}>
              Fechar
            </Button>
            <Button onClick={gerarTermo} disabled={isAbrindoTermo || !termoSelecionado}>
              {isAbrindoTermo ? 'Gerando...' : 'Gerar e abrir'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">Selecione um termo abaixo para gerar a versão do cliente em PDF.</p>
          {termos.length === 0 && !isLoadingTermos ? (
            <p className="text-sm text-muted">Nenhum termo ativo disponível no momento.</p>
          ) : (
            <label className="block">
              <span className="block text-sm font-medium mb-1">Termo</span>
              <select
                value={termoSelecionado}
                onChange={(e) => setTermoSelecionado(e.target.value)}
                className="field-control w-full"
                required
              >
                <option value="">Selecione...</option>
                {termos.map((termo) => (
                  <option key={termo.id} value={termo.slug}>
                    {termo.titulo}
                  </option>
                ))}
              </select>
            </label>
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
