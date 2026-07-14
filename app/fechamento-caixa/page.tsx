'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Lock,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import usePageTitle from '@/lib/utils/usePageTitle';
import { getFormaPagamentoSnapshotLabel } from '@/lib/utils/formasPagamento';
import { formatarCPF, formatarData, formatarDataHora, formatarMoeda, formatarTelefone } from '@/lib/utils/formatters';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  StatCard,
  Table,
  type TableColumn,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  applyFechamentoCaixaDraft,
  calculateFechamentoFormaLiquido,
  calculateFechamentoPagamentoTotais,
  createEmptyFechamentoCaixaDraft,
} from '@/lib/fechamento-caixa/compute';
import { addDaysToClinicDateKey, getClinicDateKey, parseStoredUtcInstant } from '@/lib/time';
import type {
  FechamentoCaixaDraft,
  FechamentoCaixaLancamentoManual,
  FechamentoCaixaMeta,
  FechamentoCaixaRecente,
  FechamentoCaixaResponse,
  FechamentoCaixaVisao,
} from '@/lib/fechamento-caixa/types';
import { PRINT_STYLE_TOKENS_BASE } from '@/lib/printStyles';

const METODO_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão Débito',
  cartao_credito: 'Cartão Crédito',
  crediario: 'Crediário',
  afins_sorria: 'Afins Sorria',
};

function getPagamentoFormaLabel(forma: {
  metodo: string;
  forma_pagamento_grupo_snapshot?: string | null;
  forma_pagamento_subgrupo_snapshot?: string | null;
}) {
  return getFormaPagamentoSnapshotLabel(forma) || METODO_LABELS[forma.metodo] || forma.metodo;
}

function todayIso(): string {
  return getClinicDateKey();
}

function addDaysIso(value: string, delta: number): string {
  return addDaysToClinicDateKey(value, delta);
}

function getStoredInstantTime(value: string | null | undefined): number {
  const parsed = parseStoredUtcInstant(value);
  return parsed ? parsed.getTime() : 0;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  return Number(normalized || '0');
}

function formatNumberInput(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

function draftHasContent(entry: Record<string, unknown> | undefined) {
  return Boolean(entry && Object.keys(entry).length > 0);
}

function maxOrOne(values: number[]): number {
  const max = values.reduce((current, value) => Math.max(current, value), 0);
  return max > 0 ? max : 1;
}

function joinPrintLines(lines: Array<string | null | undefined>): string {
  const filtered = lines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean);

  if (filtered.length === 0) {
    return '-';
  }

  return filtered.map((line) => escapeHtml(line)).join('<br />');
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard indisponível');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Falha ao copiar');
  }
}

interface CopyInlineButtonProps {
  label: string;
  onCopy: () => void;
  disabled?: boolean;
}

function CopyInlineButton({ label, onCopy, disabled = false }: CopyInlineButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onCopy}
      icon={<Copy className="w-3 h-3" />}
    />
  );
}

interface EditProfessionalModalState {
  open: boolean;
  usuarioId: number | null;
  valorDiaria: string;
  comissaoAvaliacao: string;
  motivo: string;
}

interface EditProcedureModalState {
  open: boolean;
  itemKey: string | null;
  valor: string;
  motivo: string;
}

interface ManualLaunchModalState {
  open: boolean;
  usuarioId: number | null;
  descricao: string;
  valor: string;
  motivo: string;
}

interface ReasonModalState {
  open: boolean;
  tipo: 'profissional' | 'procedimento' | 'reabrir' | null;
  usuarioId: number | null;
  itemKey: string | null;
  motivo: string;
}

interface AvaliacaoProcedimentoListItem {
  key: string;
  procedimento_label: string;
  cliente_nome: string;
  pago_em: string | null;
  valor_base: number;
  valor_comissao: number;
  origem: 'avaliacao' | 'acrescimo';
  included: boolean;
  manualmente_editado: boolean;
  ajustes: FechamentoCaixaVisao['avaliacoes_pagas_dia'][number]['ajustes'];
}

type ProcedimentoExecutadoListItem = FechamentoCaixaVisao['dentistas'][number]['procedimentos_executados'][number];
type ProcedimentoAjustavelListItem = ProcedimentoExecutadoListItem | FechamentoCaixaVisao['avaliacoes_pagas_dia'][number];
type PagamentoRecebidoListItem = FechamentoCaixaVisao['pagamentos_recebidos_dia'][number];

function buildAvaliadosPorDentista(
  fechamento: FechamentoCaixaVisao | null
): Map<number, AvaliacaoProcedimentoListItem[]> {
  const grouped = new Map<number, Map<string, AvaliacaoProcedimentoListItem>>();
  if (!fechamento) return new Map<number, AvaliacaoProcedimentoListItem[]>();

  fechamento.dentistas.forEach((dentista) => {
    grouped.set(dentista.usuario_id, new Map());
  });

  fechamento.avaliacoes_pagas_dia.forEach((avaliacao) => {
    const current = grouped.get(avaliacao.usuario_id);
    if (!current) return;

    current.set(avaliacao.key, {
      key: avaliacao.key,
      procedimento_label: avaliacao.procedimento_label,
      cliente_nome: avaliacao.cliente_nome,
      pago_em: avaliacao.pago_em,
      valor_base: roundMoney(avaliacao.valor_base),
      valor_comissao: roundMoney(avaliacao.valor_comissao),
      origem: avaliacao.origem,
      included: avaliacao.included,
      manualmente_editado: avaliacao.manualmente_editado,
      ajustes: avaliacao.ajustes,
    });
  });

  const result = new Map<number, AvaliacaoProcedimentoListItem[]>();

  grouped.forEach((itemsByKey, usuarioId) => {
    const sortedItems = Array.from(itemsByKey.values()).sort((a, b) => {
      const dateA = getStoredInstantTime(a.pago_em);
      const dateB = getStoredInstantTime(b.pago_em);
      if (dateB !== dateA) return dateB - dateA;
      return a.procedimento_label.localeCompare(b.procedimento_label, 'pt-BR');
    });

    result.set(usuarioId, sortedItems);
  });

  return result;
}

export default function FechamentoCaixaPage() {
  usePageTitle('Fechamento de Caixa');
  const router = useRouter();
  const { user, isLoading: authLoading, hasRole } = useAuth();
  const unitFetch = useUnitFetch();
  const { toast } = useToast();
  const canAccess = hasRole(['admin', 'atendente']);

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState('');

  const [meta, setMeta] = useState<FechamentoCaixaMeta | null>(null);
  const [base, setBase] = useState<FechamentoCaixaVisao | null>(null);
  const [resultado, setResultado] = useState<FechamentoCaixaVisao | null>(null);
  const [recentes, setRecentes] = useState<FechamentoCaixaRecente[]>([]);
  const [draft, setDraft] = useState<FechamentoCaixaDraft>(createEmptyFechamentoCaixaDraft());
  const [savedDraftJson, setSavedDraftJson] = useState(JSON.stringify(createEmptyFechamentoCaixaDraft()));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [editProfessionalModal, setEditProfessionalModal] = useState<EditProfessionalModalState>({
    open: false,
    usuarioId: null,
    valorDiaria: '0',
    comissaoAvaliacao: '0',
    motivo: '',
  });
  const [editProcedureModal, setEditProcedureModal] = useState<EditProcedureModalState>({
    open: false,
    itemKey: null,
    valor: '0',
    motivo: '',
  });
  const [manualLaunchModal, setManualLaunchModal] = useState<ManualLaunchModalState>({
    open: false,
    usuarioId: null,
    descricao: '',
    valor: '',
    motivo: '',
  });
  const [reasonModal, setReasonModal] = useState<ReasonModalState>({
    open: false,
    tipo: null,
    usuarioId: null,
    itemKey: null,
    motivo: '',
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmLabel?: string;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const readOnly = meta?.status === 'fechado';
  const dirty = JSON.stringify(draft) !== savedDraftJson;

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await unitFetch(`/api/fechamento-caixa?data=${date}`);
      const data = await response.json() as FechamentoCaixaResponse | { error: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error : 'Erro ao carregar fechamento de caixa');
      }

      const typed = data as FechamentoCaixaResponse;
      setMeta(typed.fechamento);
      setBase(typed.base);
      setResultado(typed.resultado);
      setRecentes(typed.recentes);
      setDraft(typed.draft);
      setSavedDraftJson(JSON.stringify(typed.draft));
      setExpanded(new Set(typed.resultado.dentistas.filter((item) => item.manualmente_editado).map((item) => item.usuario_id)));
    } catch (fetchError) {
      console.error('Erro ao buscar fechamento de caixa:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Erro ao carregar fechamento de caixa');
    } finally {
      setLoading(false);
    }
  }, [unitFetch]);

  useEffect(() => {
    if (!authLoading && (!user || !canAccess)) {
      router.push('/');
    }
  }, [authLoading, user, canAccess, router]);

  useEffect(() => {
    if (!authLoading && user && canAccess) {
      fetchData(selectedDate);
    }
  }, [authLoading, user, canAccess, selectedDate, fetchData]);

  const applyLocalDraft = useCallback((nextDraft: FechamentoCaixaDraft) => {
    setDraft(nextDraft);
    if (base) {
      setResultado(applyFechamentoCaixaDraft(base, nextDraft));
    }
  }, [base]);

  const updateProfessionalDraft = useCallback((usuarioId: number, updater: (entry: Record<string, unknown>) => Record<string, unknown> | null) => {
    const current = draft.profissionais[String(usuarioId)] ?? {};
    const updated = updater({ ...current });
    const nextDraft: FechamentoCaixaDraft = {
      ...draft,
      profissionais: { ...draft.profissionais },
    };

    if (updated && draftHasContent(updated)) {
      nextDraft.profissionais[String(usuarioId)] = updated;
    } else {
      delete nextDraft.profissionais[String(usuarioId)];
    }

    applyLocalDraft(nextDraft);
  }, [draft, applyLocalDraft]);

  const updateProcedureDraft = useCallback((itemKey: string, updater: (entry: Record<string, unknown>) => Record<string, unknown> | null) => {
    const current = draft.procedimentos[itemKey] ?? {};
    const updated = updater({ ...current });
    const nextDraft: FechamentoCaixaDraft = {
      ...draft,
      procedimentos: { ...draft.procedimentos },
    };

    if (updated && draftHasContent(updated)) {
      nextDraft.procedimentos[itemKey] = updated;
    } else {
      delete nextDraft.procedimentos[itemKey];
    }

    applyLocalDraft(nextDraft);
  }, [draft, applyLocalDraft]);

  const addManualLaunch = useCallback((launch: FechamentoCaixaLancamentoManual) => {
    const nextDraft: FechamentoCaixaDraft = {
      ...draft,
      lancamentos_manuais: [...draft.lancamentos_manuais, launch],
    };
    applyLocalDraft(nextDraft);
  }, [draft, applyLocalDraft]);

  const removeManualLaunch = useCallback((launchId: string) => {
    const nextDraft: FechamentoCaixaDraft = {
      ...draft,
      lancamentos_manuais: draft.lancamentos_manuais.filter((item) => item.id !== launchId),
    };
    applyLocalDraft(nextDraft);
  }, [draft, applyLocalDraft]);

  const findBaseDentista = useCallback((usuarioId: number) => {
    return base?.dentistas.find((item) => item.usuario_id === usuarioId) ?? null;
  }, [base]);

  const findBaseProcedure = useCallback((itemKey: string): ProcedimentoAjustavelListItem | null => {
    const procedimentoExecutado = base?.dentistas
      .flatMap((item) => item.procedimentos_executados)
      .find((item) => item.key === itemKey);
    if (procedimentoExecutado) {
      return procedimentoExecutado;
    }
    return base?.avaliacoes_pagas_dia.find((item) => item.key === itemKey) ?? null;
  }, [base]);

  const persistDraft = useCallback(async (customDraft?: FechamentoCaixaDraft) => {
    const draftToPersist = customDraft ?? draft;
    setSaving(true);
    setError('');
    try {
      const response = await unitFetch(`/api/fechamento-caixa?data=${selectedDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: draftToPersist }),
      });
      const data = await response.json() as FechamentoCaixaResponse | { error: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error : 'Erro ao salvar revisão');
      }
      const typed = data as FechamentoCaixaResponse;
      setMeta(typed.fechamento);
      setBase(typed.base);
      setResultado(typed.resultado);
      setRecentes(typed.recentes);
      setDraft(typed.draft);
      setSavedDraftJson(JSON.stringify(typed.draft));
      toast.success('Revisão salva com sucesso.');
      return typed;
    } catch (saveError) {
      console.error('Erro ao salvar revisão do fechamento:', saveError);
      const message = saveError instanceof Error ? saveError.message : 'Erro ao salvar revisão';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, selectedDate, toast, unitFetch]);

  const handleCloseCash = useCallback(async () => {
    setClosing(true);
    setError('');
    try {
      if (dirty) {
        const saved = await persistDraft();
        if (!saved) return;
      }

      const response = await unitFetch('/api/fechamento-caixa/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: selectedDate }),
      });
      const data = await response.json() as FechamentoCaixaResponse | { error: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error : 'Erro ao fechar caixa');
      }
      const typed = data as FechamentoCaixaResponse;
      setMeta(typed.fechamento);
      setBase(typed.base);
      setResultado(typed.resultado);
      setDraft(typed.draft);
      setSavedDraftJson(JSON.stringify(typed.draft));
      setRecentes(typed.recentes);
      toast.success('Caixa fechado com sucesso.');
    } catch (closeError) {
      console.error('Erro ao fechar caixa:', closeError);
      const message = closeError instanceof Error ? closeError.message : 'Erro ao fechar caixa';
      setError(message);
      toast.error(message);
    } finally {
      setClosing(false);
    }
  }, [dirty, persistDraft, selectedDate, toast, unitFetch]);

  const handleReopen = useCallback(async () => {
    setReopening(true);
    setError('');
    try {
      const response = await unitFetch('/api/fechamento-caixa/reabrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: selectedDate, motivo: reasonModal.motivo }),
      });
      const data = await response.json() as FechamentoCaixaResponse | { error: string };
      if (!response.ok) {
        throw new Error('error' in data ? data.error : 'Erro ao reabrir fechamento');
      }
      const typed = data as FechamentoCaixaResponse;
      setMeta(typed.fechamento);
      setBase(typed.base);
      setResultado(typed.resultado);
      setDraft(typed.draft);
      setSavedDraftJson(JSON.stringify(typed.draft));
      setRecentes(typed.recentes);
      setReasonModal({ open: false, tipo: null, usuarioId: null, itemKey: null, motivo: '' });
      toast.success('Fechamento reaberto com sucesso.');
    } catch (reopenError) {
      console.error('Erro ao reabrir fechamento:', reopenError);
      const message = reopenError instanceof Error ? reopenError.message : 'Erro ao reabrir fechamento';
      setError(message);
      toast.error(message);
    } finally {
      setReopening(false);
    }
  }, [reasonModal.motivo, selectedDate, toast, unitFetch]);

  const handlePrint = useCallback(() => {
    if (!resultado || !meta || meta.status !== 'fechado') return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.');
      return;
    }

    const logoUrl = `${window.location.origin}/logo-sorria-leste-laranja-fundo-transparente.svg`;

    const metodoHtml = resultado.resumo.faturamento_por_metodo.length > 0
      ? resultado.resumo.faturamento_por_metodo.map((item) => `
          <tr>
            <td>${escapeHtml(METODO_LABELS[item.metodo] || item.metodo)}</td>
            <td style="text-align:right">${item.quantidade}</td>
            <td style="text-align:right">${formatarMoeda(item.total)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" class="muted">Nenhuma entrada registrada</td></tr>';

    const pagamentosRecebidosHtml = (resultado.pagamentos_recebidos_dia ?? []).length > 0
      ? (resultado.pagamentos_recebidos_dia ?? []).map((item) => {
          const totais = calculateFechamentoPagamentoTotais(item);
          return `
            <tr>
              <td>${escapeHtml(formatarDataHora(item.created_at))}</td>
              <td>${joinPrintLines([
                item.cliente_nome,
                `Telefone: ${formatarTelefone(item.cliente_telefone)}`,
                `CPF: ${formatarCPF(item.cliente_cpf)}`,
              ])}</td>
              <td>${joinPrintLines(
                item.formas.map((forma) => `${getPagamentoFormaLabel(forma)}: ${formatarMoeda(forma.valor)}`)
              )}</td>
              <td>${escapeHtml(item.recebido_por_nome || '-')}</td>
              <td>${joinPrintLines([
                item.observacoes,
                item.cancelado && item.motivo_cancelamento ? `Motivo do cancelamento: ${item.motivo_cancelamento}` : null,
              ])}</td>
              <td style="text-align:right">${formatarMoeda(totais.bruto)}</td>
              <td style="text-align:right">${formatarMoeda(totais.liquido)}</td>
              <td>${escapeHtml(item.cancelado ? `Cancelado${item.motivo_cancelamento ? ` - ${item.motivo_cancelamento}` : ''}` : 'Recebido')}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="8" class="muted">Nenhum pagamento recebido nesse dia</td></tr>';

    const rankingAvaliadoresHtml = resultado.graficos.ranking_avaliadores.length > 0
      ? resultado.graficos.ranking_avaliadores.map((item) => `
          <tr>
            <td>${escapeHtml(item.nome)}</td>
            <td style="text-align:right">${item.quantidade}</td>
            <td style="text-align:right">${formatarMoeda(item.valor_gerado)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" class="muted">Sem dados</td></tr>';

    const rankingExecutoresHtml = resultado.graficos.ranking_executores.length > 0
      ? resultado.graficos.ranking_executores.map((item) => `
          <tr>
            <td>${escapeHtml(item.nome)}</td>
            <td style="text-align:right">${item.quantidade}</td>
            <td style="text-align:right">${formatarMoeda(item.valor_gerado)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" class="muted">Sem dados</td></tr>';

    const procedimentosAvaliadosPorDentista = buildAvaliadosPorDentista(resultado);
    const profissionaisHtml = resultado.dentistas.map((dentista) => {
      const procedimentosAvaliados = procedimentosAvaliadosPorDentista.get(dentista.usuario_id) ?? [];
      const procedimentosAvaliadosHtml = procedimentosAvaliados.length > 0
        ? procedimentosAvaliados.map((procedimento) => `
            <tr>
              <td>${escapeHtml(procedimento.procedimento_label)}</td>
              <td>${escapeHtml(procedimento.cliente_nome)}</td>
              <td>${escapeHtml(formatarDataHora(procedimento.pago_em))}</td>
              <td>${escapeHtml(procedimento.origem === 'acrescimo' ? 'Comissão de acréscimo' : 'Comissão de avaliação')}</td>
              <td style="text-align:right">${formatarMoeda(procedimento.valor_comissao)}</td>
              <td style="text-align:right">${formatarMoeda(procedimento.valor_base)}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="6" class="muted">Sem procedimentos pagos no dia com comissão de avaliação ou acréscimo</td></tr>';

      const procedimentos = dentista.procedimentos_executados.length > 0
        ? dentista.procedimentos_executados.map((procedimento) => `
            <tr>
              <td>${escapeHtml(procedimento.procedimento_label)}</td>
              <td>${escapeHtml(procedimento.cliente_nome)}</td>
              <td>${escapeHtml(formatarDataHora(procedimento.concluido_at))}</td>
              <td style="text-align:right">${formatarMoeda(procedimento.valor)}</td>
              <td>${procedimento.included ? 'Incluído' : 'Excluído'}</td>
              <td>${escapeHtml(procedimento.ajustes.map((item) => item.label).join(' | ') || '-')}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="6" class="muted">Sem procedimentos executados nesse dia</td></tr>';

      const ajustes = [
        ...dentista.ajustes.map((item) => `${item.label}: ${item.motivo}`),
        ...dentista.procedimentos_executados.flatMap((procedimento) =>
          procedimento.ajustes.map((item) => `${procedimento.procedimento_label} — ${item.label}: ${item.motivo}`)
        ),
        ...dentista.lancamentos_manuais.map((item) => `${item.descricao}: ${item.motivo}`),
      ];

      return `
        <section class="section">
          <h2>${escapeHtml(dentista.nome)}</h2>
          <div class="summary-box">
            <div><strong>Status:</strong> ${dentista.included ? 'Incluído' : 'Excluído do fechamento'}</div>
            <div><strong>Diária:</strong> ${formatarMoeda(dentista.valor_diaria)}</div>
            <div><strong>Comissão avaliação + acréscimos:</strong> ${formatarMoeda(dentista.comissao_avaliacao)}</div>
            <div><strong>Lançamentos manuais:</strong> ${formatarMoeda(dentista.lancamentos_manuais.reduce((sum, item) => sum + item.valor, 0))}</div>
            <div><strong>Total do dia:</strong> ${formatarMoeda(dentista.total_dia)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Procedimento pago</th>
                <th>Cliente</th>
                <th>Pago em</th>
                <th>Tipo</th>
                <th>Comissão</th>
                <th>Base</th>
              </tr>
            </thead>
            <tbody>${procedimentosAvaliadosHtml}</tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>Procedimento</th>
                <th>Cliente</th>
                <th>Conclusão</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ajustes</th>
              </tr>
            </thead>
            <tbody>${procedimentos}</tbody>
          </table>
          <p><strong>Ajustes manuais:</strong> ${escapeHtml(ajustes.join(' | ') || 'Nenhum ajuste')}</p>
        </section>
      `;
    }).join('');

    const ajustesGerais = resultado.lancamentos_manuais_gerais.length > 0
      ? resultado.lancamentos_manuais_gerais.map((item) => `
          <tr>
            <td>${escapeHtml(item.descricao)}</td>
            <td style="text-align:right">${formatarMoeda(item.valor)}</td>
            <td>${escapeHtml(item.motivo)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="3" class="muted">Nenhum ajuste manual geral</td></tr>';

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Fechamento de Caixa - ${escapeHtml(resultado.data_referencia)}</title>
          <style>
            ${PRINT_STYLE_TOKENS_BASE}
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: var(--sorria-ink); font-size: 12px; background: var(--sorria-surface); }
            h1 { font-size: 20px; margin: 0; color: var(--sorria-ink); letter-spacing: 0.2px; }
            h2 { font-size: 14px; margin: 16px 0 8px; color: var(--sorria-orange); }
            .header { border: 1px solid var(--sorria-orange-border); padding: 14px 14px 12px; margin-bottom: 14px; background: var(--sorria-orange-soft); border-radius: 6px; }
            .report-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
            .brand { display: flex; align-items: center; gap: 10px; }
            .brand img { width: 40px; height: 40px; object-fit: contain; }
            .brand-text { color: var(--sorria-orange); font-size: 12px; font-weight: 700; letter-spacing: 0.2px; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 18px; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
            .summary-card { border: 1px solid var(--sorria-orange-border); border-radius: 6px; padding: 10px 12px; background: var(--sorria-surface-soft); }
            .summary-card strong { display: block; color: var(--sorria-orange-dark); margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
            .summary-value { color: var(--sorria-orange); font-size: 18px; font-weight: 700; }
            .summary-box { background: var(--sorria-surface-soft); border: 1px solid var(--sorria-orange-border); border-radius: 6px; padding: 10px 12px; }
            table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
            th, td { border: 1px solid var(--sorria-line); padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: var(--sorria-orange-soft-2); color: var(--sorria-orange-dark); }
            .compact-table th, .compact-table td { padding: 5px 6px; font-size: 11px; }
            .multiline-cell { white-space: normal; }
            .muted { color: var(--sorria-line-soft); }
            .section { margin-top: 20px; page-break-inside: avoid; }
            .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--sorria-orange-soft-2); color: var(--sorria-orange-dark); font-weight: 700; font-size: 11px; }
            @media print {
              body { padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="report-header">
              <div class="brand">
                <img src="${logoUrl}" alt="Logo Sorria Leste" />
                <div>
                  <h1>Fechamento de Caixa</h1>
                  <div class="brand-text">Sorria Leste</div>
                </div>
              </div>
              <div class="status-badge">Fechado</div>
            </div>
            <div class="meta-grid">
              <div><strong>Unidade:</strong> ${escapeHtml(resultado.unidade_nome || `Unidade ${resultado.unidade_id}`)}</div>
              <div><strong>Data:</strong> ${escapeHtml(formatarData(resultado.data_referencia))}</div>
              <div><strong>Fechado por:</strong> ${escapeHtml(meta.fechado_por_nome || '-')}</div>
              <div><strong>Fechado em:</strong> ${escapeHtml(formatarDataHora(meta.fechado_em))}</div>
              <div><strong>Ajustes manuais:</strong> ${resultado.ajustes_count}</div>
              <div><strong>Procedimentos executados:</strong> ${resultado.resumo.procedimentos_executados}</div>
            </div>
          </div>

          <div class="summary-grid">
            <div class="summary-card"><strong>Total bruto</strong><div class="summary-value">${formatarMoeda(resultado.resumo.total_bruto)}</div></div>
            <div class="summary-card"><strong>Total líquido</strong><div class="summary-value">${formatarMoeda(resultado.resumo.total_liquido)}</div></div>
            <div class="summary-card"><strong>Procedimentos executados</strong><div class="summary-value">${resultado.resumo.procedimentos_executados}</div></div>
            <div class="summary-card"><strong>Resultado final</strong><div class="summary-value">${formatarMoeda(resultado.resumo.total_final)}</div></div>
            <div class="summary-card"><strong>Diárias</strong><div class="summary-value">${formatarMoeda(resultado.resumo.total_diarias)}</div></div>
            <div class="summary-card"><strong>Comissão avaliação + acréscimos</strong><div class="summary-value">${formatarMoeda(resultado.resumo.total_comissao_avaliacao)}</div></div>
          </div>

          <section class="section">
            <h2>Pagamentos recebidos no dia</h2>
            <table class="compact-table">
              <thead>
                <tr>
                  <th>Recebido em</th>
                  <th>Cliente</th>
                  <th>Formas</th>
                  <th>Recebido por</th>
                  <th>Descritivo</th>
                  <th>Total bruto</th>
                  <th>Total líquido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${pagamentosRecebidosHtml}</tbody>
            </table>
          </section>

          <section class="section">
            <h2>Entradas por método</h2>
            <table>
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Qtd.</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>${metodoHtml}</tbody>
            </table>
          </section>

          <section class="section">
            <h2>Ranking de avaliadores</h2>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Qtd.</th>
                  <th>Valor gerado</th>
                </tr>
              </thead>
              <tbody>${rankingAvaliadoresHtml}</tbody>
            </table>
          </section>

          <section class="section">
            <h2>Ranking de executores</h2>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Qtd.</th>
                  <th>Valor gerado</th>
                </tr>
              </thead>
              <tbody>${rankingExecutoresHtml}</tbody>
            </table>
          </section>

          <section class="section">
            <h2>Ajustes manuais realizados</h2>
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>${ajustesGerais}</tbody>
            </table>
          </section>

          ${profissionaisHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 150);
  }, [resultado, meta]);

  const currentDentistas = useMemo(
    () => resultado?.dentistas ?? [],
    [resultado]
  );
  const currentResultado = resultado;
  const procedimentosAvaliadosPorDentista = useMemo(
    () => buildAvaliadosPorDentista(currentResultado),
    [currentResultado]
  );
  const historicoRelevante = useMemo(
    () => recentes.filter((item) => item.data_referencia !== selectedDate),
    [recentes, selectedDate]
  );

  const proceduresMax = useMemo(
    () => maxOrOne((currentResultado?.graficos.procedimentos_por_quantidade ?? []).map((item) => item.quantidade)),
    [currentResultado]
  );
  const rankingAvaliadoresMax = useMemo(
    () => maxOrOne((currentResultado?.graficos.ranking_avaliadores ?? []).map((item) => item.valor_gerado)),
    [currentResultado]
  );
  const rankingExecutoresMax = useMemo(
    () => maxOrOne((currentResultado?.graficos.ranking_executores ?? []).map((item) => item.valor_gerado)),
    [currentResultado]
  );
  const pagamentosRecebidos = useMemo(
    () => currentResultado?.pagamentos_recebidos_dia ?? [],
    [currentResultado]
  );
  const pagamentosRecebidosAtivos = useMemo(
    () => pagamentosRecebidos.filter((item) => !item.cancelado),
    [pagamentosRecebidos]
  );
  const pagamentosRecebidosCancelados = useMemo(
    () => pagamentosRecebidos.filter((item) => item.cancelado),
    [pagamentosRecebidos]
  );
  const handleCopyField = useCallback(async (label: string, value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue || normalizedValue === '-') {
      toast.warning(`${label} indisponível para copiar.`);
      return;
    }

    try {
      await copyTextToClipboard(normalizedValue);
      toast.success(`${label} copiado.`);
    } catch (copyError) {
      console.error(`Erro ao copiar ${label.toLowerCase()}:`, copyError);
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  }, [toast]);

  const pagamentosRecebidosColumns: TableColumn<PagamentoRecebidoListItem>[] = [
    {
      key: 'created_at',
      label: 'Recebido em',
      render: (item) => (
        <div className="space-y-1">
          <p className="font-medium">{formatarDataHora(item.created_at)}</p>
          <p className="text-xs text-muted-foreground">
            {item.formas.length} forma(s)
          </p>
        </div>
      ),
    },
    {
      key: 'cliente',
      label: 'Cliente',
      render: (item) => {
        const nomeCliente = item.cliente_nome?.trim() || '-';
        const telefoneCliente = formatarTelefone(item.cliente_telefone);
        const cpfCliente = formatarCPF(item.cliente_cpf);

        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <Link
                href={`/clientes/${item.cliente_id}`}
                className="block w-fit leading-tight font-medium text-info-600 transition-colors hover:text-info-800 hover:underline"
              >
                {nomeCliente}
              </Link>
              <CopyInlineButton
                label={`Copiar nome de ${nomeCliente}`}
                disabled={nomeCliente === '-'}
                onCopy={() => {
                  void handleCopyField('Nome', nomeCliente);
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <p className="text-xs leading-tight text-muted-foreground">
                Telefone: {telefoneCliente}
              </p>
              <CopyInlineButton
                label={`Copiar telefone de ${nomeCliente}`}
                disabled={telefoneCliente === '-'}
                onCopy={() => {
                  void handleCopyField('Telefone', telefoneCliente);
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <p className="text-xs leading-tight text-muted-foreground">
                CPF: {cpfCliente}
              </p>
              <CopyInlineButton
                label={`Copiar CPF de ${nomeCliente}`}
                disabled={cpfCliente === '-'}
                onCopy={() => {
                  void handleCopyField('CPF', cpfCliente);
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'formas',
      label: 'Formas de pagamento',
      render: (item) => (
        <div className="space-y-1">
          {item.formas.map((forma) => (
            <div key={forma.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{getPagamentoFormaLabel(forma)}</p>
                <p className="text-xs text-muted-foreground">
                  Líquido {formatarMoeda(calculateFechamentoFormaLiquido(forma))}
                </p>
              </div>
              <span className={forma.cancelado ? 'font-semibold text-error-600' : 'font-semibold'}>
                {formatarMoeda(forma.valor)}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'recebido_por_nome',
      label: 'Recebido por',
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.recebido_por_nome || '-'}</span>
      ),
    },
    {
      key: 'observacoes',
      label: 'Observações',
      render: (item) => (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{item.observacoes || '-'}</p>
          {item.cancelado && item.motivo_cancelamento && (
            <p className="text-xs text-error-600">Motivo: {item.motivo_cancelamento}</p>
          )}
        </div>
      ),
    },
    {
      key: 'valor_total',
      label: 'Total bruto',
      align: 'right',
      render: (item) => {
        const totais = calculateFechamentoPagamentoTotais(item);
        return (
          <span className={item.cancelado ? 'font-semibold text-error-600' : 'font-semibold text-success-700'}>
            {formatarMoeda(totais.bruto)}
          </span>
        );
      },
    },
    {
      key: 'valor_liquido',
      label: 'Total líquido',
      align: 'right',
      render: (item) => {
        const totais = calculateFechamentoPagamentoTotais(item);
        return (
          <span className={item.cancelado ? 'font-semibold text-error-600' : 'font-semibold text-primary-700'}>
            {formatarMoeda(totais.liquido)}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <Badge color={item.cancelado ? 'red' : 'green'} size="sm">
          {item.cancelado ? 'Cancelado' : 'Recebido'}
        </Badge>
      ),
    },
  ];

  if (authLoading || !user || !canAccess) {
    return null;
  }

  if (loading || !resultado || !meta) {
    return <LoadingState text="Carregando fechamento de caixa..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {resultado.editado_manual && (
        <Alert type="warning" title="Ajustes manuais detectados">
          Este fechamento contém {resultado.ajustes_count} ajuste(s) manual(is).
        </Alert>
      )}

      {meta.status === 'fechado' && (
        <Alert type="info" title="Fechamento oficial do dia">
          Fechado por {meta.fechado_por_nome || '-'} em {formatarDataHora(meta.fechado_em)}. Esta tela mostra a foto congelada do fechamento.
        </Alert>
      )}

      <PageHeader
        title="Fechamento de Caixa"
        icon={<Wallet className="w-7 h-7" />}
        description="Revisão oficial do dia, com snapshot congelado após o fechamento."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={meta.status === 'fechado' ? 'green' : 'yellow'}>
              {meta.status === 'fechado' ? 'Fechado' : 'Aberto'}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(addDaysIso(selectedDate, -1))} icon={<ArrowLeft className="w-4 h-4" />}>
              Dia anterior
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(todayIso())}>
              Hoje
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDate(addDaysIso(selectedDate, 1))} iconRight={<ArrowRight className="w-4 h-4" />}>
              Próximo dia
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <Card className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Data de referência</p>
                <p className="text-lg font-semibold">{formatarData(selectedDate)}</p>
                <p className="text-sm text-muted-foreground">
                  Unidade: {resultado.unidade_nome || `Unidade ${resultado.unidade_id}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="w-44">
                <Input
                  label="Dia"
                  name="data_referencia"
                  type="date"
                  value={selectedDate}
                  onChange={setSelectedDate}
                />
              </div>
              <Button
                variant="secondary"
                icon={<Save className="w-4 h-4" />}
                disabled={readOnly || !dirty || saving}
                loading={saving}
                onClick={() => void persistDraft()}
              >
                Salvar revisão
              </Button>
              <Button
                variant="primary"
                icon={<ShieldCheck className="w-4 h-4" />}
                disabled={readOnly || closing}
                loading={closing}
                onClick={() => setConfirmDialog({
                  isOpen: true,
                  title: 'Fechar caixa do dia',
                  message: 'Isso vai congelar o snapshot oficial do dia selecionado. Você ainda poderá reabrir com justificativa.',
                  confirmLabel: 'Fechar caixa',
                  type: 'warning',
                  onConfirm: () => {
                    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                    return handleCloseCash();
                  },
                })}
              >
                Fechar caixa
              </Button>
              <Button
                variant="outline"
                icon={<RefreshCcw className="w-4 h-4" />}
                disabled={!readOnly || reopening}
                loading={reopening}
                onClick={() => setReasonModal({
                  open: true,
                  tipo: 'reabrir',
                  usuarioId: null,
                  itemKey: null,
                  motivo: '',
                })}
              >
                Reabrir
              </Button>
              <Button
                variant="outline"
                icon={<Printer className="w-4 h-4" />}
                disabled={meta.status !== 'fechado'}
                onClick={handlePrint}
              >
                Imprimir PDF
              </Button>
            </div>
          </div>
        </Card>

        {historicoRelevante.length > 0 && (
          <Card className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Histórico recente</h2>
                <p className="text-sm text-muted-foreground">
                  Reabra ou reimprima rapidamente os últimos fechamentos desta unidade.
                </p>
              </div>
              <Badge color="gray">{historicoRelevante.length} registro(s)</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {historicoRelevante.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedDate(item.data_referencia)}
                  className="w-full text-left rounded-xl border p-4 transition-colors border-border hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatarData(item.data_referencia)}</span>
                    <Badge color={item.status === 'fechado' ? 'green' : 'yellow'} size="sm">
                      {item.status === 'fechado' ? 'Fechado' : 'Aberto'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Ajustes: {item.ajustes_count}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fechado por {item.fechado_por_nome || '-'}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
          <StatCard icon={<Banknote className="w-6 h-6" />} label="Total bruto" value={formatarMoeda(resultado.resumo.total_bruto)} color="border-success-500" />
          <StatCard icon={<Wallet className="w-6 h-6" />} label="Total líquido" value={formatarMoeda(resultado.resumo.total_liquido)} color="border-info-500" />
          <StatCard icon={<ClipboardList className="w-6 h-6" />} label="Procedimentos executados" value={resultado.resumo.procedimentos_executados} color="border-primary-500" />
          <StatCard icon={<Wallet className="w-6 h-6" />} label="Resultado final" value={formatarMoeda(resultado.resumo.total_final)} color="border-evaluation-500" />
          <StatCard icon={<Lock className="w-6 h-6" />} label="Diárias" value={formatarMoeda(resultado.resumo.total_diarias)} color="border-warning-500" />
          <StatCard icon={<ShieldCheck className="w-6 h-6" />} label="Comissão avaliação + acréscimos" value={formatarMoeda(resultado.resumo.total_comissao_avaliacao)} color="border-success-500" />
        </div>

        <Card className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Pagamentos recebidos no dia</h2>
              <p className="text-sm text-muted-foreground">
                Conferência detalhada de tudo que entrou no caixa no dia, incluindo multi-formas e cancelamentos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge color="blue">{pagamentosRecebidos.length} registro(s)</Badge>
              <Badge color="green">{pagamentosRecebidosAtivos.length} ativo(s)</Badge>
              <Badge color={pagamentosRecebidosCancelados.length > 0 ? 'red' : 'gray'}>
                {pagamentosRecebidosCancelados.length} cancelado(s)
              </Badge>
            </div>
          </div>

          <Table
            columns={pagamentosRecebidosColumns}
            data={pagamentosRecebidos}
            keyExtractor={(item) => item.id}
            emptyMessage="Nenhum pagamento recebido nesse dia."
            caption="Pagamentos recebidos no dia"
            className="[&_table]:min-w-[1100px] [&_td]:py-2 [&_th]:py-2.5"
          />
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Entradas por método</h2>
              <Badge color="blue">{resultado.resumo.faturamento_por_metodo.length} método(s)</Badge>
            </div>
            <div className="space-y-3">
              {resultado.resumo.faturamento_por_metodo.length > 0 ? (
                resultado.resumo.faturamento_por_metodo.map((item) => (
                  <div key={item.metodo} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/55 p-3">
                    <div>
                      <p className="font-medium">{METODO_LABELS[item.metodo] || item.metodo}</p>
                      <p className="text-xs text-muted-foreground">{item.quantidade} lançamento(s)</p>
                    </div>
                    <span className="font-semibold">{formatarMoeda(item.total)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma entrada ativa registrada nesse dia.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Cancelamentos do dia</h2>
              <Badge color={resultado.resumo.pagamentos_cancelados_dia.quantidade > 0 ? 'red' : 'gray'}>
                {resultado.resumo.pagamentos_cancelados_dia.quantidade} cancelamento(s)
              </Badge>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/55 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor cancelado</p>
                <p className="text-2xl font-bold text-error-600 dark:text-error-300">{formatarMoeda(resultado.resumo.pagamentos_cancelados_dia.valor)}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Os pagamentos cancelados ficam visíveis para conferência, mas não entram no faturamento do fechamento.
              </p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-base font-semibold mb-4">Procedimentos por quantidade</h2>
            <div className="space-y-3">
              {resultado.graficos.procedimentos_por_quantidade.length > 0 ? (
                resultado.graficos.procedimentos_por_quantidade.slice(0, 10).map((item) => (
                  <div key={item.nome} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-foreground">{item.nome}</span>
                      <span className="text-xs text-muted-foreground">{item.quantidade}x · {formatarMoeda(item.valor_total)}</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full"
                        style={{ width: `${Math.max((item.quantidade / proceduresMax) * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sem produção executada no período.</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold mb-4">Avaliadores por valor gerado</h2>
            <div className="space-y-3">
              {resultado.graficos.ranking_avaliadores.length > 0 ? (
                resultado.graficos.ranking_avaliadores.slice(0, 10).map((item) => (
                  <div key={`avaliador-${item.usuario_id}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-foreground">{item.nome}</span>
                      <span className="text-xs text-muted-foreground">{item.quantidade} proc. · {formatarMoeda(item.valor_gerado)}</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-success-400 to-success-500 rounded-full"
                        style={{ width: `${Math.max((item.valor_gerado / rankingAvaliadoresMax) * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados de avaliadores nesse dia.</p>
              )}
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <h2 className="text-base font-semibold mb-4">Executores por valor gerado</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {resultado.graficos.ranking_executores.length > 0 ? (
                resultado.graficos.ranking_executores.slice(0, 10).map((item) => (
                  <div key={`executor-${item.usuario_id}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-foreground">{item.nome}</span>
                      <span className="text-xs text-muted-foreground">{item.quantidade} proc. · {formatarMoeda(item.valor_gerado)}</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-info-400 to-info-500 rounded-full"
                        style={{ width: `${Math.max((item.valor_gerado / rankingExecutoresMax) * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sem dados de executores nesse dia.</p>
              )}
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Lançamentos manuais gerais</h2>
              <p className="text-sm text-muted-foreground">
                Ajustes que impactam o total final do fechamento, sem vínculo com um profissional específico.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              disabled={readOnly}
              onClick={() => setManualLaunchModal({
                open: true,
                usuarioId: null,
                descricao: '',
                valor: '',
                motivo: '',
              })}
            >
              Adicionar ajuste geral
            </Button>
          </div>

          {resultado.lancamentos_manuais_gerais.length > 0 ? (
            <div className="space-y-2">
              {resultado.lancamentos_manuais_gerais.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/55 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{item.descricao}</p>
                    <p className="text-xs text-muted-foreground">{item.motivo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={item.valor >= 0 ? 'green' : 'red'}>{formatarMoeda(item.valor)}</Badge>
                    {!readOnly && (
                      <Button variant="ghost" size="icon-sm" onClick={() => removeManualLaunch(item.id)} icon={<Trash2 className="w-4 h-4" />} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum ajuste manual geral lançado.</p>
          )}
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Detalhamento por dentista</h2>
              <p className="text-sm text-muted-foreground">
                Revise inclusão, diárias, comissões e procedimentos antes de fechar o caixa.
              </p>
            </div>
            <Badge color="gray">{currentDentistas.length} profissional(is)</Badge>
          </div>

            {currentDentistas.map((dentista) => {
              const isExpanded = expanded.has(dentista.usuario_id);
              const manualLaunchTotal = dentista.lancamentos_manuais.reduce((sum, item) => sum + item.valor, 0);
              const procedimentosAvaliados = procedimentosAvaliadosPorDentista.get(dentista.usuario_id) ?? [];
              const procedimentosAvaliadosColumns: TableColumn<AvaliacaoProcedimentoListItem>[] = [
                {
                  key: 'procedimento',
                  label: 'Procedimento',
                  render: (procedimento) => (
                    <div className="space-y-1">
                      <p className="font-medium">{procedimento.procedimento_label}</p>
                      {procedimento.manualmente_editado && (
                        <Badge color="amber" size="sm">Editado manualmente</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'cliente',
                  label: 'Cliente',
                  render: (procedimento) => (
                    <span className="text-sm text-muted-foreground">{procedimento.cliente_nome}</span>
                  ),
                },
                {
                  key: 'tipo',
                  label: 'Tipo',
                  render: (procedimento) => (
                    <Badge color={procedimento.origem === 'acrescimo' ? 'amber' : 'blue'} size="sm">
                      {procedimento.origem === 'acrescimo' ? 'Comissão de acréscimo' : 'Comissão de avaliação'}
                    </Badge>
                  ),
                },
                {
                  key: 'pago_em',
                  label: 'Pago em',
                  render: (procedimento) => (
                    <span className="text-sm text-muted-foreground">{formatarDataHora(procedimento.pago_em)}</span>
                  ),
                },
                {
                  key: 'valor_base',
                  label: 'Base',
                  align: 'right',
                  render: (procedimento) => <span className="font-semibold text-primary-600">{formatarMoeda(procedimento.valor_base)}</span>,
                },
                {
                  key: 'valor_comissao',
                  label: 'Comissão',
                  align: 'right',
                  render: (procedimento) => <span className="font-semibold text-success-600">{formatarMoeda(procedimento.valor_comissao)}</span>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (procedimento) => (
                    <div className="flex flex-wrap gap-2">
                      <Badge color={procedimento.included ? 'green' : 'red'} size="sm">
                        {procedimento.included ? 'Incluído' : 'Excluído'}
                      </Badge>
                    </div>
                  ),
                },
                {
                  key: 'acoes',
                  label: 'Ações',
                  align: 'right',
                  render: (procedimento) => (
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Pencil className="w-4 h-4" />}
                        disabled={readOnly}
                          onClick={() => setEditProcedureModal({
                            open: true,
                            itemKey: procedimento.key,
                            valor: formatNumberInput(procedimento.valor_base),
                            motivo: '',
                          })}
                      >
                        Editar valor
                      </Button>
                      <Button
                        variant={procedimento.included ? 'danger' : 'ghost'}
                        size="sm"
                        icon={procedimento.included ? <Trash2 className="w-4 h-4" /> : <RefreshCcw className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => {
                          if (procedimento.included) {
                            setReasonModal({
                              open: true,
                              tipo: 'procedimento',
                              usuarioId: dentista.usuario_id,
                              itemKey: procedimento.key,
                              motivo: '',
                            });
                            return;
                          }

                          updateProcedureDraft(procedimento.key, (entry) => {
                            delete entry.included;
                            delete entry.included_motivo;
                            return draftHasContent(entry) ? entry : null;
                          });
                        }}
                      >
                        {procedimento.included ? 'Excluir' : 'Reincluir'}
                      </Button>
                    </div>
                  ),
                },
              ];
              const procedimentosExecutadosColumns: TableColumn<ProcedimentoExecutadoListItem>[] = [
                {
                  key: 'procedimento',
                  label: 'Procedimento',
                  render: (procedimento) => (
                    <div className="space-y-1">
                      <p className="font-medium">{procedimento.procedimento_label}</p>
                      {procedimento.manualmente_editado && (
                        <Badge color="amber" size="sm">Editado manualmente</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'cliente',
                  label: 'Cliente',
                  render: (procedimento) => (
                    <span className="text-sm text-muted-foreground">{procedimento.cliente_nome}</span>
                  ),
                },
                {
                  key: 'concluido_at',
                  label: 'Concluído em',
                  render: (procedimento) => (
                    <span className="text-sm text-muted-foreground">{formatarDataHora(procedimento.concluido_at)}</span>
                  ),
                },
                {
                  key: 'valor',
                  label: 'Valor',
                  align: 'right',
                  render: (procedimento) => <span className="font-semibold">{formatarMoeda(procedimento.valor)}</span>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (procedimento) => (
                    <div className="flex flex-wrap gap-2">
                      <Badge color={procedimento.included ? 'green' : 'red'} size="sm">
                        {procedimento.included ? 'Incluído' : 'Excluído'}
                      </Badge>
                    </div>
                  ),
                },
                {
                  key: 'acoes',
                  label: 'Ações',
                  align: 'right',
                  render: (procedimento) => (
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Pencil className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => setEditProcedureModal({
                          open: true,
                          itemKey: procedimento.key,
                          valor: formatNumberInput(procedimento.valor),
                          motivo: '',
                        })}
                      >
                        Editar valor
                      </Button>
                      <Button
                        variant={procedimento.included ? 'danger' : 'ghost'}
                        size="sm"
                        icon={procedimento.included ? <Trash2 className="w-4 h-4" /> : <RefreshCcw className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => {
                          if (procedimento.included) {
                            setReasonModal({
                              open: true,
                              tipo: 'procedimento',
                              usuarioId: dentista.usuario_id,
                              itemKey: procedimento.key,
                              motivo: '',
                            });
                            return;
                          }

                          updateProcedureDraft(procedimento.key, (entry) => {
                            delete entry.included;
                            delete entry.included_motivo;
                            return draftHasContent(entry) ? entry : null;
                          });
                        }}
                      >
                        {procedimento.included ? 'Excluir' : 'Reincluir'}
                      </Button>
                    </div>
                  ),
                },
              ];
              return (
                <Card key={dentista.usuario_id} className={dentista.included ? '' : 'border-error-200 bg-error-500/5'}>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => {
                        const next = new Set(expanded);
                        if (next.has(dentista.usuario_id)) next.delete(dentista.usuario_id);
                        else next.add(dentista.usuario_id);
                        setExpanded(next);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold">{dentista.nome}</h3>
                            <Badge color={dentista.included ? 'green' : 'red'}>
                              {dentista.included ? 'Incluído' : 'Excluído'}
                            </Badge>
                            {dentista.manualmente_editado && (
                              <Badge color="amber">Editado manualmente</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Diária {formatarMoeda(dentista.valor_diaria)} · Avaliação + acréscimos {formatarMoeda(dentista.comissao_avaliacao)} · {procedimentosAvaliados.length} comissionado(s) por avaliação · {dentista.procedimentos_executados.length} executado(s) · Ajustes {formatarMoeda(manualLaunchTotal)}
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-right min-w-32">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total do dia</p>
                        <p className="text-xl font-bold">{formatarMoeda(dentista.total_dia)}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Pencil className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => setEditProfessionalModal({
                          open: true,
                          usuarioId: dentista.usuario_id,
                          valorDiaria: formatNumberInput(dentista.valor_diaria),
                          comissaoAvaliacao: formatNumberInput(dentista.comissao_avaliacao),
                          motivo: '',
                        })}
                      >
                        Editar valores
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => setManualLaunchModal({
                          open: true,
                          usuarioId: dentista.usuario_id,
                          descricao: '',
                          valor: '',
                          motivo: '',
                        })}
                      >
                        Ajuste manual
                      </Button>
                      <Button
                        variant={dentista.included ? 'danger' : 'ghost'}
                        size="sm"
                        icon={dentista.included ? <Trash2 className="w-4 h-4" /> : <RefreshCcw className="w-4 h-4" />}
                        disabled={readOnly}
                        onClick={() => {
                          if (dentista.included) {
                            setReasonModal({
                              open: true,
                              tipo: 'profissional',
                              usuarioId: dentista.usuario_id,
                              itemKey: null,
                              motivo: '',
                            });
                            return;
                          }

                          updateProfessionalDraft(dentista.usuario_id, (entry) => {
                            delete entry.included;
                            delete entry.included_motivo;
                            return draftHasContent(entry) ? entry : null;
                          });
                        }}
                      >
                        {dentista.included ? 'Excluir' : 'Reincluir'}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-6 space-y-4">
                      {dentista.ajustes.length > 0 && (
                        <div className="rounded-lg border border-warning-500/20 bg-warning-500/10 p-4">
                          <p className="text-sm font-semibold mb-2">Ajustes no profissional</p>
                          <div className="space-y-1.5">
                            {dentista.ajustes.map((ajuste, index) => (
                              <p key={`${dentista.usuario_id}-ajuste-${index}`} className="text-sm text-muted-foreground">
                                {ajuste.label}: {ajuste.motivo}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {dentista.lancamentos_manuais.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">Lançamentos manuais do profissional</p>
                          {dentista.lancamentos_manuais.map((item) => (
                            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/55 p-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-medium">{item.descricao}</p>
                                <p className="text-xs text-muted-foreground">{item.motivo}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge color={item.valor >= 0 ? 'green' : 'red'}>{formatarMoeda(item.valor)}</Badge>
                                {!readOnly && (
                                  <Button variant="ghost" size="icon-sm" onClick={() => removeManualLaunch(item.id)} icon={<Trash2 className="w-4 h-4" />} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">Procedimentos pagos no dia com comissão de avaliação ou acréscimo</p>
                          <Badge color="gray">{procedimentosAvaliados.length}</Badge>
                        </div>

                        {procedimentosAvaliados.length > 0 ? (
                          <Table
                            columns={procedimentosAvaliadosColumns}
                            data={procedimentosAvaliados}
                            keyExtractor={(procedimento) => procedimento.key}
                            emptyMessage="Sem procedimentos pagos no dia com comissão de avaliação ou acréscimo."
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem procedimentos pagos no dia com comissão de avaliação ou acréscimo.</p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">Procedimentos executados</p>
                          <Badge color="gray">{dentista.procedimentos_executados.length}</Badge>
                        </div>

                        {dentista.procedimentos_executados.length > 0 ? (
                          <Table
                            columns={procedimentosExecutadosColumns}
                            data={dentista.procedimentos_executados}
                            keyExtractor={(procedimento) => procedimento.key}
                            emptyMessage="Sem procedimentos executados nesse dia."
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Sem procedimentos executados nesse dia.</p>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
      </div>

      <Modal
        isOpen={editProfessionalModal.open}
        onClose={() => setEditProfessionalModal((prev) => ({ ...prev, open: false }))}
        title="Editar valores do profissional"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditProfessionalModal((prev) => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editProfessionalModal.usuarioId) return;
                const baseDentista = findBaseDentista(editProfessionalModal.usuarioId);
                if (!baseDentista) return;

                const diaria = parseCurrencyInput(editProfessionalModal.valorDiaria);
                const avaliacao = parseCurrencyInput(editProfessionalModal.comissaoAvaliacao);
                const changed = (
                  roundMoney(diaria) !== roundMoney(baseDentista.valor_diaria)
                  || roundMoney(avaliacao) !== roundMoney(baseDentista.comissao_avaliacao)
                );

                if (changed && !editProfessionalModal.motivo.trim()) {
                  toast.error('Informe o motivo do ajuste manual.');
                  return;
                }

                updateProfessionalDraft(editProfessionalModal.usuarioId, (entry) => {
                  if (roundMoney(diaria) !== roundMoney(baseDentista.valor_diaria)) {
                    entry.valor_diaria_override = roundMoney(diaria);
                    entry.valor_diaria_motivo = editProfessionalModal.motivo.trim();
                  } else {
                    delete entry.valor_diaria_override;
                    delete entry.valor_diaria_motivo;
                  }

                  if (roundMoney(avaliacao) !== roundMoney(baseDentista.comissao_avaliacao)) {
                    entry.comissao_avaliacao_override = roundMoney(avaliacao);
                    entry.comissao_avaliacao_motivo = editProfessionalModal.motivo.trim();
                  } else {
                    delete entry.comissao_avaliacao_override;
                    delete entry.comissao_avaliacao_motivo;
                  }

                  return draftHasContent(entry) ? entry : null;
                });

                setEditProfessionalModal({
                  open: false,
                  usuarioId: null,
                  valorDiaria: '0',
                  comissaoAvaliacao: '0',
                  motivo: '',
                });
              }}
            >
              Aplicar ajustes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Valor de diária"
            name="valor_diaria"
            type="number"
            value={editProfessionalModal.valorDiaria}
            onChange={(value) => setEditProfessionalModal((prev) => ({ ...prev, valorDiaria: value }))}
            min={0}
            step="0.01"
          />
          <Input
            label="Comissão de avaliação + acréscimos"
            name="comissao_avaliacao"
            type="number"
            value={editProfessionalModal.comissaoAvaliacao}
            onChange={(value) => setEditProfessionalModal((prev) => ({ ...prev, comissaoAvaliacao: value }))}
            min={0}
            step="0.01"
          />
          <Textarea
            label="Motivo do ajuste"
            name="motivo_profissional"
            value={editProfessionalModal.motivo}
            onChange={(value) => setEditProfessionalModal((prev) => ({ ...prev, motivo: value }))}
            placeholder="Explique por que os valores foram ajustados."
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        isOpen={editProcedureModal.open}
        onClose={() => setEditProcedureModal((prev) => ({ ...prev, open: false }))}
        title="Editar valor do procedimento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditProcedureModal((prev) => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editProcedureModal.itemKey) return;
                const baseProcedure = findBaseProcedure(editProcedureModal.itemKey);
                if (!baseProcedure) return;

                const valor = roundMoney(parseCurrencyInput(editProcedureModal.valor));
                const valorBaseAtual = roundMoney('valor' in baseProcedure ? baseProcedure.valor : baseProcedure.valor_base);
                const changed = valor !== valorBaseAtual;
                if (changed && !editProcedureModal.motivo.trim()) {
                  toast.error('Informe o motivo do ajuste manual.');
                  return;
                }

                updateProcedureDraft(editProcedureModal.itemKey, (entry) => {
                  if (changed) {
                    entry.valor_override = valor;
                    entry.valor_motivo = editProcedureModal.motivo.trim();
                  } else {
                    delete entry.valor_override;
                    delete entry.valor_motivo;
                  }
                  return draftHasContent(entry) ? entry : null;
                });

                setEditProcedureModal({
                  open: false,
                  itemKey: null,
                  valor: '0',
                  motivo: '',
                });
              }}
            >
              Aplicar ajuste
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Valor do procedimento"
            name="valor_procedimento"
            type="number"
            value={editProcedureModal.valor}
            onChange={(value) => setEditProcedureModal((prev) => ({ ...prev, valor: value }))}
            min={0}
            step="0.01"
          />
          <Textarea
            label="Motivo do ajuste"
            name="motivo_procedimento"
            value={editProcedureModal.motivo}
            onChange={(value) => setEditProcedureModal((prev) => ({ ...prev, motivo: value }))}
            placeholder="Explique por que o valor do procedimento foi ajustado."
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        isOpen={manualLaunchModal.open}
        onClose={() => setManualLaunchModal((prev) => ({ ...prev, open: false }))}
        title={manualLaunchModal.usuarioId ? 'Adicionar ajuste manual ao profissional' : 'Adicionar ajuste manual geral'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualLaunchModal((prev) => ({ ...prev, open: false }))}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const descricao = manualLaunchModal.descricao.trim();
                const motivo = manualLaunchModal.motivo.trim();
                const valor = roundMoney(parseCurrencyInput(manualLaunchModal.valor));

                if (!descricao || !motivo) {
                  toast.error('Descrição e motivo são obrigatórios.');
                  return;
                }

                if (!Number.isFinite(valor) || valor === 0) {
                  toast.error('Informe um valor diferente de zero.');
                  return;
                }

                addManualLaunch({
                  id: crypto.randomUUID(),
                  escopo: manualLaunchModal.usuarioId ? 'profissional' : 'geral',
                  usuario_id: manualLaunchModal.usuarioId,
                  descricao,
                  valor,
                  motivo,
                  created_at: new Date().toISOString(),
                });

                setManualLaunchModal({
                  open: false,
                  usuarioId: null,
                  descricao: '',
                  valor: '',
                  motivo: '',
                });
              }}
            >
              Adicionar ajuste
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Descrição"
            name="descricao_lancamento"
            value={manualLaunchModal.descricao}
            onChange={(value) => setManualLaunchModal((prev) => ({ ...prev, descricao: value }))}
            placeholder="Ex.: Acerto externo, desconto operacional, bônus..."
          />
          <Input
            label="Valor"
            name="valor_lancamento"
            type="number"
            value={manualLaunchModal.valor}
            onChange={(value) => setManualLaunchModal((prev) => ({ ...prev, valor: value }))}
            step="0.01"
          />
          <Textarea
            label="Motivo"
            name="motivo_lancamento"
            value={manualLaunchModal.motivo}
            onChange={(value) => setManualLaunchModal((prev) => ({ ...prev, motivo: value }))}
            placeholder="Explique por que o lançamento manual entrou neste fechamento."
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        isOpen={reasonModal.open}
        onClose={() => setReasonModal({ open: false, tipo: null, usuarioId: null, itemKey: null, motivo: '' })}
        title={reasonModal.tipo === 'reabrir' ? 'Reabrir fechamento' : 'Informar motivo'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReasonModal({ open: false, tipo: null, usuarioId: null, itemKey: null, motivo: '' })}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const motivo = reasonModal.motivo.trim();
                if (!motivo) {
                  toast.error('O motivo é obrigatório.');
                  return;
                }

                if (reasonModal.tipo === 'profissional' && reasonModal.usuarioId) {
                  updateProfessionalDraft(reasonModal.usuarioId, (entry) => {
                    entry.included = false;
                    entry.included_motivo = motivo;
                    return entry;
                  });
                  setReasonModal({ open: false, tipo: null, usuarioId: null, itemKey: null, motivo: '' });
                  return;
                }

                if (reasonModal.tipo === 'procedimento' && reasonModal.itemKey) {
                  updateProcedureDraft(reasonModal.itemKey, (entry) => {
                    entry.included = false;
                    entry.included_motivo = motivo;
                    return entry;
                  });
                  setReasonModal({ open: false, tipo: null, usuarioId: null, itemKey: null, motivo: '' });
                  return;
                }

                if (reasonModal.tipo === 'reabrir') {
                  void handleReopen();
                }
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Textarea
          label="Motivo"
          name="motivo_acao"
          value={reasonModal.motivo}
          onChange={(value) => setReasonModal((prev) => ({ ...prev, motivo: value }))}
          placeholder="Explique por que este ajuste ou reabertura está sendo feito."
          rows={4}
        />
      </Modal>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => void confirmDialog.onConfirm()}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        type={confirmDialog.type}
      />
    </div>
  );
}

function roundMoney(value: number): number {
  return Number((value || 0).toFixed(2));
}
