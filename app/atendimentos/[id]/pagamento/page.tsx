'use client';

import React, { useState, useEffect, use } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora, nomeProcedimentoItem } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/domain';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import { Input, Select, Card, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import usePageTitle from '@/lib/utils/usePageTitle';
import type { Usuario } from '@/lib/types';
import {
  montarSelecaoPagamentoPayload,
  type AcaoItemPagamento,
} from '@/lib/utils/pagamentoSelecao';

interface Etapa {
  id: number;
  item_atendimento_id: number;
  status: string;
  nome?: string;
  valor?: number | null;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_label?: string | null;
  valor: number;
  valor_original: number | null;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dentes?: string | null;
  dente_unico: string | null;
  executor_id: number | null;
  adicionado_em_execucao: number;
  concluido_at: string | null;
  etapas?: Etapa[];
}

interface Pagamento {
  id: number;
  valor: number;
  metodo: string;
  observacoes: string | null;
  recebido_por_nome?: string;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  status: string;
  agendamento_id: number | null;
  tipo: string;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

function calcularValorItemPagamento(item: ItemAtendimento, etapasPag: Set<number>): number {
  const modeloEtapas = item.etapas ?? [];
  if (modeloEtapas.length === 0) return item.valor;
  const selecionadas = modeloEtapas.filter(e => etapasPag.has(e.id));
  if (selecionadas.length === modeloEtapas.length) return item.valor;
  if (selecionadas.length === 0) return 0;
  if (!selecionadas.every(e => e.valor != null)) return item.valor;
  return selecionadas.reduce((sum, e) => sum + (e.valor ?? 0), 0);
}

const METODOS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
  { value: 'crediario', label: 'Crediário' },
  { value: 'afins_sorria', label: 'Afins Sorria' },
];

function nomeProcedimento(item: ItemAtendimento): string {
  return nomeProcedimentoItem(item);
}

export default function PagamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  usePageTitle('Pagamento do Atendimento');
  const { id } = use(params);
  const router = useRouter();
  const unitFetch = useUnitFetch();

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulário de pagamento
  const [valorPagamento, setValorPagamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [registrando, setRegistrando] = useState(false);

  // Cancelar pagamento
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');

  // Saldo do cliente (informativo)
  const [saldoInfo, setSaldoInfo] = useState(0);

  // Seleção de itens/etapas para pagar (coluna esquerda — apenas pendentes)
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());
  const [etapasPagamento, setEtapasPagamento] = useState<Set<number>>(new Set());

  // Ação por procedimento (coluna direita)
  // Itens sem etapas modelo → acaoItens keyed by item.id
  // Itens com etapas modelo → acaoEtapas keyed by virtual etapa.id (item_id * 100000 + etapa_modelo_id)
  const [acaoItens, setAcaoItens] = useState<Record<number, AcaoItemPagamento>>({});
  const [datasAgendamento, setDatasAgendamento] = useState<Record<number, string>>({});
  const [executoresAgendamento, setExecutoresAgendamento] = useState<Record<number, string>>({});
  const [acaoEtapas, setAcaoEtapas] = useState<Record<number, AcaoItemPagamento>>({});
  const [datasEtapasAgendamento, setDatasEtapasAgendamento] = useState<Record<number, string>>({});
  const [executoresEtapasAgendamento, setExecutoresEtapasAgendamento] = useState<Record<number, string>>({});
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Edição de valor (desconto)
  const [editandoValorItemId, setEditandoValorItemId] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState('');
  const [salvandoValor, setSalvandoValor] = useState(false);
  const [erroEdicaoValor, setErroEdicaoValor] = useState('');

  // Edição de valor per-etapa (override JSON em etapas_valores)
  // editandoEtapaId armazena o ID virtual da etapa (item.id * 100000 + etapa_modelo_id)
  const [editandoEtapaId, setEditandoEtapaId] = useState<number | null>(null);
  const [valorEditandoEtapa, setValorEditandoEtapa] = useState('');
  const [salvandoEtapa, setSalvandoEtapa] = useState(false);
  const [erroEdicaoEtapa, setErroEdicaoEtapa] = useState('');

  useEffect(() => {
    carregarDados();
    carregarExecutores();
  }, [id]);

  const carregarExecutores = async () => {
    try {
      const res = await fetch('/api/usuarios');
      if (!res.ok) return;
      const data: Usuario[] = await res.json();
      setExecutores(data.filter(u => u.role === 'executor' || u.role === 'admin'));
    } catch {
      /* silently fail */
    }
  };

  const carregarDados = async () => {
    try {
      const resAtend = await unitFetch(`/api/atendimentos/${id}`);
      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);

      // Pré-popula executor de agendamento com o executor já definido no item (vindo da avaliação),
      // sem sobrescrever caso o usuário já tenha mexido manualmente nesta sessão.
      const itensAtend = atendData.itens as ItemAtendimento[];
      setExecutoresAgendamento(prev => {
        const next = { ...prev };
        for (const item of itensAtend) {
          if (next[item.id] === undefined && item.executor_id != null) {
            next[item.id] = String(item.executor_id);
          }
        }
        return next;
      });
      setExecutoresEtapasAgendamento(prev => {
        const next = { ...prev };
        for (const item of itensAtend) {
          if (item.executor_id == null) continue;
          const modeloEtapas = (item.etapas ?? []);
          for (const etapa of modeloEtapas) {
            if (next[etapa.id] === undefined) {
              next[etapa.id] = String(item.executor_id);
            }
          }
        }
        return next;
      });

      // Atualiza seleção de pagamento com os itens ainda pendentes de cobrança
      // (status='pendente' OR valor_pago<valor — este último cobre os adicionados em execução).
      // Itens com etapa_label parcialmente pago: seleciona apenas as sessões NÃO pagas.
      const pendentes = itensAtend.filter(i => i.status === 'pendente' || i.valor_pago < i.valor);
      setItensSelecionados(new Set(pendentes.map(i => i.id)));
      const etapasParaPagar = pendentes.flatMap(i => {
        const modeloEtapas = i.etapas ?? [];
        if (!i.etapa_label) return modeloEtapas.map(e => e.id);
        const jaPageas = new Set(i.etapa_label.split(', ').map(s => s.trim()));
        return modeloEtapas.filter(e => !jaPageas.has(e.nome ?? '')).map(e => e.id);
      });
      setEtapasPagamento(new Set(etapasParaPagar));

      // Saldo do cliente
      if (atendData.cliente_id) {
        try {
          const resSaldo = await fetch(`/api/clientes/${atendData.cliente_id}/saldo`);
          if (resSaldo.ok) {
            const saldoData = await resSaldo.json();
            setSaldoInfo(saldoData.saldo ?? 0);
          }
        } catch { /* silently fail */ }
      }

      const resPag = await unitFetch(`/api/atendimentos/${id}/pagamentos`);
      const pagData = await resPag.json();
      setPagamentos(pagData);
    } catch (err) {
      setError('Erro ao carregar dados');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // === Edição de valor (desconto) ===

  const abrirEdicaoValor = (item: ItemAtendimento) => {
    setEditandoValorItemId(item.id);
    setValorEditando(item.valor.toFixed(2));
    setErroEdicaoValor('');
  };

  const cancelarEdicaoValor = () => {
    setEditandoValorItemId(null);
    setValorEditando('');
    setErroEdicaoValor('');
  };

  const salvarValor = async (itemId: number, novoValor: number) => {
    setSalvandoValor(true);
    setErroEdicaoValor('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: novoValor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErroEdicaoValor(data.error || 'Erro ao salvar valor');
        return;
      }
      cancelarEdicaoValor();
      await carregarDados();
    } catch (err) {
      console.error(err);
      setErroEdicaoValor('Erro ao salvar valor');
    } finally {
      setSalvandoValor(false);
    }
  };

  const confirmarEdicaoValor = async (itemId: number) => {
    const num = parseFloat(valorEditando.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      setErroEdicaoValor('Valor inválido');
      return;
    }
    await salvarValor(itemId, num);
  };

  const restaurarValorOriginal = async (item: ItemAtendimento) => {
    if (item.valor_original == null) return;
    await salvarValor(item.id, item.valor_original);
  };

  // === Edição de valor per-etapa ===

  const abrirEdicaoEtapa = (etapaVirtualId: number, valorAtual: number | null, itemValor: number, totalEtapas: number) => {
    setEditandoEtapaId(etapaVirtualId);
    // Se a etapa ainda não tem override, sugere split igualitário do item.valor
    const valorInicial = valorAtual != null ? valorAtual : itemValor / totalEtapas;
    setValorEditandoEtapa(valorInicial.toFixed(2));
    setErroEdicaoEtapa('');
  };

  const cancelarEdicaoEtapa = () => {
    setEditandoEtapaId(null);
    setValorEditandoEtapa('');
    setErroEdicaoEtapa('');
  };

  const confirmarEdicaoEtapa = async (itemId: number, etapaVirtualId: number) => {
    const num = parseFloat(valorEditandoEtapa.replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) {
      setErroEdicaoEtapa('Valor inválido');
      return;
    }
    setSalvandoEtapa(true);
    setErroEdicaoEtapa('');
    try {
      // Decodifica etapa_modelo_id do ID virtual: virtualId = item.id * 100000 + etapa_modelo_id
      const etapaModeloId = etapaVirtualId - itemId * 100000;
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapa_modelo_id: etapaModeloId, etapa_valor: num }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErroEdicaoEtapa(data.error || 'Erro ao salvar valor da sessão');
        return;
      }
      cancelarEdicaoEtapa();
      await carregarDados();
    } catch (err) {
      console.error(err);
      setErroEdicaoEtapa('Erro ao salvar valor da sessão');
    } finally {
      setSalvandoEtapa(false);
    }
  };

  const handleRegistrarPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valorPagamento || !atendimento) return;
    const valorNum = parseFloat(valorPagamento);
    setRegistrando(true);
    setError('');
    try {
      // Para itens com sessões (modelo), se o usuário pagou apenas algumas sessões,
      // passa etapas_pagas_por_item para a API atualizar etapa_label e valor no item.
      // As sessões não pagas ficam visíveis no painel de procedimentos (bloqueadas para
      // "Fazer hoje") e serão agendadas em "Enviar para Execução".
      const etapasPagasPorItem: Record<string, string[]> = {};
      for (const itemId of itensSelecionados) {
        const item = atendimento.itens.find(i => i.id === itemId);
        if (!item) continue;
        const modeloEtapas = (item.etapas ?? []);
        if (modeloEtapas.length === 0) continue;
        const pagas = modeloEtapas.filter(e => etapasPagamento.has(e.id));
        if (pagas.length > 0 && pagas.length < modeloEtapas.length) {
          etapasPagasPorItem[itemId.toString()] = pagas.map(e => e.nome ?? '');
        }
      }

      const res = await unitFetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: valorNum,
          metodo: metodoPagamento,
          observacoes: observacoesPagamento || null,
          item_ids: itensSelecionados.size > 0 ? Array.from(itensSelecionados) : undefined,
          etapas_pagas_por_item: Object.keys(etapasPagasPorItem).length > 0 ? etapasPagasPorItem : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar');
      }
      setValorPagamento('');
      setObservacoesPagamento('');
      // acaoItens é preservado — itens pagos ficam com a ação já escolhida
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar');
    } finally {
      setRegistrando(false);
    }
  };

  const handleEnviarParaExecucao = async () => {
    if (!atendimento) return;
    setEnviando(true);
    setError('');
    try {
      const { itensHoje, itensAgendar, etapasAgendar } = montarSelecaoPagamentoPayload(
        atendimento.itens,
        acaoItens,
        acaoEtapas,
        datasAgendamento,
        datasEtapasAgendamento,
        executoresAgendamento,
        executoresEtapasAgendamento
      );

      if (itensAgendar.length > 0 || etapasAgendar.length > 0) {
        const res = await unitFetch(`/api/atendimentos/${id}/selecionar-hoje`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens_hoje: itensHoje, itens_agendar: itensAgendar, etapas_agendar: etapasAgendar }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao processar agendamentos');
        }
      }

      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'em_execucao' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao avançar status');
      }
      router.push(`/atendimentos/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar para execução');
    } finally {
      setEnviando(false);
    }
  };

  const handleFinalizarAtendimento = async () => {
    if (!atendimento) return;
    setEnviando(true);
    setError('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'finalizado' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao finalizar atendimento');
      }
      router.push(`/atendimentos/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar atendimento');
    } finally {
      setEnviando(false);
    }
  };

  const handleCancelarPagamento = async (pagamentoId: number) => {
    if (!motivoCancelamento.trim()) return;
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/pagamentos/${pagamentoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoCancelamento }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao cancelar');
      }
      setCancelandoId(null);
      setMotivoCancelamento('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  };

  const toggleItemPagamento = (itemId: number) => {
    const item = atendimento!.itens.find(i => i.id === itemId);
    const modeloEtapas = item?.etapas ?? [];
    const estaSelecionado = itensSelecionados.has(itemId);
    // Para itens com pagamento parcial, só alterna as sessões ainda não pagas
    const jaPageas = item?.etapa_label
      ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
      : null;
    const etapasAToggle = jaPageas
      ? modeloEtapas.filter(e => !jaPageas.has(e.nome ?? ''))
      : modeloEtapas;
    setItensSelecionados(prev => {
      const next = new Set(prev);
      if (estaSelecionado) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    if (etapasAToggle.length > 0) {
      setEtapasPagamento(prev => {
        const next = new Set(prev);
        if (estaSelecionado) etapasAToggle.forEach(e => next.delete(e.id));
        else etapasAToggle.forEach(e => next.add(e.id));
        return next;
      });
    }
  };

  if (loading) return <LoadingState text="Carregando pagamento..." />;

  if (!atendimento) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Atendimento não encontrado</p>
        <Link href="/atendimentos" className="text-primary hover:text-primary-700">← Voltar para lista</Link>
      </div>
    );
  }

  const totalPago = pagamentos.filter(p => !p.cancelado).reduce((acc, p) => acc + p.valor, 0);
  const temPagamentoAtivo = pagamentos.some(p => !p.cancelado);
  // Itens que precisam ser cobrados: pendentes do fluxo normal + executados na hora ainda não pagos
  const itensPendentes = atendimento.itens.filter(i => i.status === 'pendente' || i.valor_pago < i.valor);
  // Quando todos os itens já estão concluídos e só falta pagamento (caso de procedimentos
  // adicionados em execução), mostramos botão "Finalizar" em vez de "Enviar para Execução"
  const todosItensConcluidos = atendimento.itens.length > 0 && atendimento.itens.every(i => i.status === 'concluido');
  const valorSelecionado = atendimento.itens
    .filter(i => itensSelecionados.has(i.id))
    .reduce((sum, i) => sum + calcularValorItemPagamento(i, etapasPagamento), 0);
  const hojeCount = atendimento.itens.reduce((acc, item) => {
    const modeloEtapas = (item.etapas ?? []);
    if (modeloEtapas.length > 0) return acc + modeloEtapas.filter(e => acaoEtapas[e.id] === 'hoje').length;
    return acc + (acaoItens[item.id] === 'hoje' ? 1 : 0);
  }, 0);
  const agendarCount = atendimento.itens.reduce((acc, item) => {
    const modeloEtapas = (item.etapas ?? []);
    if (modeloEtapas.length > 0) return acc + modeloEtapas.filter(e => acaoEtapas[e.id] === 'agendar').length;
    return acc + (acaoItens[item.id] === 'agendar' ? 1 : 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/atendimentos/${id}`} className="text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pagamento</h1>
          <p className="text-muted-foreground">{atendimento.cliente_nome} — Atendimento #{atendimento.id}</p>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Dados do Cliente */}
      <Card className="bg-primary-500/10 border border-primary-500/20">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-primary-600 dark:text-primary-400">Cliente</p>
            <p className="font-semibold text-foreground">{atendimento.cliente_nome}</p>
          </div>
          {atendimento.cliente_cpf && (
            <div>
              <p className="text-sm text-primary-600 dark:text-primary-400">CPF</p>
              <p className="font-medium text-foreground">{atendimento.cliente_cpf}</p>
            </div>
          )}
          {atendimento.cliente_telefone && (
            <div>
              <p className="text-sm text-primary-600 dark:text-primary-400">Telefone</p>
              <p className="font-medium text-foreground">{atendimento.cliente_telefone}</p>
            </div>
          )}
          {saldoInfo > 0 && (
            <div className="ml-auto">
              <p className="text-sm text-primary-600 dark:text-primary-400">Saldo disponível</p>
              <p className="font-semibold text-foreground">{formatarMoeda(saldoInfo)}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ─── ESQUERDA: Pagar ─── */}
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold mb-3">Pagar</h2>

            {/* Seleção de itens pendentes */}
            {itensPendentes.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Selecione o que será cobrado nesta cobrança, até o nível de sessão.
                </p>

                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden mb-4">
                  {itensPendentes.map((item) => {
                    const selecionado = itensSelecionados.has(item.id);
                    const modeloEtapas = item.etapas ?? [];
                    const valorExibido = calcularValorItemPagamento(item, etapasPagamento);
                    const label = item.dente_unico
                      ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                      : item.procedimento_nome;
                    // Sessões já pagas em pagamentos anteriores (etapa_label = pagamento parcial)
                    const sessoesParcialmentePagas = item.etapa_label
                      ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
                      : null;
                    const temDescontoPag = item.valor_original != null && item.valor_original > item.valor;
                    const editandoPag = editandoValorItemId === item.id;

                    return (
                      <div key={item.id} className={selecionado ? 'bg-primary-500/10' : 'bg-muted'}>
                        <div className="px-4 py-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => toggleItemPagamento(item.id)}
                              className="custom-checkbox shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={cn("text-sm font-medium", selecionado ? "text-foreground" : "text-muted-foreground")}>
                                {label}
                              </span>
                              {temDescontoPag && (
                                <span className="ml-2 text-xs font-semibold text-warning-600 bg-warning-500/10 border border-warning-500/30 px-1.5 py-0.5 rounded-full">
                                  Com desconto
                                </span>
                              )}
                              {sessoesParcialmentePagas && (
                                <span className="ml-2 text-xs text-success-600 font-medium">
                                  · {item.etapa_label} já pago
                                </span>
                              )}
                              {selecionado && modeloEtapas.length > 0 && !sessoesParcialmentePagas && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({modeloEtapas.filter(e => etapasPagamento.has(e.id)).length}/{modeloEtapas.length} sessão/ões)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {temDescontoPag && (
                                <span className="text-xs text-muted-foreground line-through">
                                  {formatarMoeda(item.valor_original!)}
                                </span>
                              )}
                              <span className={cn("text-sm font-semibold", selecionado ? "text-foreground" : "text-muted-foreground")}>
                                {formatarMoeda(valorExibido)}
                              </span>
                            </div>
                          </label>
                          {!editandoPag && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); abrirEdicaoValor(item); }}
                              className="ml-7 mt-1 text-xs text-primary-600 hover:underline font-medium"
                              title="Editar valor (aplicar desconto)"
                            >
                              editar valor
                            </button>
                          )}
                          {editandoPag && (
                            <div className="ml-7 mt-2 bg-background border border-border rounded p-2">
                              <label className="block text-xs font-medium text-muted-foreground mb-1">
                                Novo valor total{item.valor_original != null && ` (original: ${formatarMoeda(item.valor_original)})`}
                              </label>
                              <div className="flex gap-2 items-start">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={valorEditando}
                                  onChange={e => setValorEditando(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  className="flex-1 px-2 py-1 border border-input rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); confirmarEdicaoValor(item.id); }}
                                  disabled={salvandoValor}
                                  className="text-xs px-3 py-1 rounded bg-primary-600 text-white font-medium disabled:opacity-50"
                                >
                                  {salvandoValor ? '...' : 'Salvar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); cancelarEdicaoValor(); }}
                                  disabled={salvandoValor}
                                  className="text-xs px-3 py-1 rounded border border-input text-muted-foreground"
                                >
                                  Cancelar
                                </button>
                              </div>
                              {item.valor_original != null && item.valor !== item.valor_original && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); restaurarValorOriginal(item); }}
                                  disabled={salvandoValor}
                                  className="mt-2 text-xs text-primary-600 hover:underline"
                                >
                                  Restaurar valor original ({formatarMoeda(item.valor_original)})
                                </button>
                              )}
                              {erroEdicaoValor && (
                                <div className="mt-2 text-xs text-error-600 dark:text-error-400">{erroEdicaoValor}</div>
                              )}
                            </div>
                          )}
                          {temDescontoPag && !editandoPag && (
                            <div className="ml-7 mt-1 text-xs text-warning-600 dark:text-warning-400">
                              Desconto: {formatarMoeda(item.valor_original! - item.valor)}
                            </div>
                          )}
                        </div>

                        {/* Sessões (modelo etapas) — mostra todas; já pagas bloqueadas */}
                        {selecionado && modeloEtapas.length > 0 && (
                          <div className="ml-7 mr-4 mb-3 border border-border rounded-lg overflow-hidden">
                            {modeloEtapas.map((etapa) => {
                              const jaFoiPaga = sessoesParcialmentePagas?.has(etapa.nome ?? '') ?? false;
                              const etapaSel = etapasPagamento.has(etapa.id);
                              const editandoEstaEtapa = editandoEtapaId === etapa.id;
                              return (
                                <div key={etapa.id} className={cn("px-3 py-2 border-b border-border last:border-b-0", jaFoiPaga ? "bg-success-500/10" : etapaSel ? "" : "bg-muted")}>
                                  <label className={cn("flex items-center gap-2", jaFoiPaga ? "cursor-default" : "cursor-pointer")}>
                                    <input
                                      type="checkbox"
                                      checked={jaFoiPaga || etapaSel}
                                      disabled={jaFoiPaga}
                                      onChange={() => {
                                        if (jaFoiPaga) return;
                                        setEtapasPagamento(prev => {
                                          const next = new Set(prev);
                                          if (next.has(etapa.id)) next.delete(etapa.id);
                                          else next.add(etapa.id);
                                          return next;
                                        });
                                      }}
                                      className="custom-checkbox custom-checkbox-sm shrink-0"
                                    />
                                    <span className={cn("text-xs font-medium flex-1", jaFoiPaga ? "text-success-600 dark:text-success-400" : etapaSel ? "text-foreground" : "text-muted-foreground")}>
                                      {etapa.nome ?? `Sessão ${modeloEtapas.indexOf(etapa) + 1}`}
                                    </span>
                                    {jaFoiPaga && (
                                      <span className="text-xs font-medium text-success-600 bg-success-500/10 px-1.5 py-0.5 rounded">Pago</span>
                                    )}
                                    {etapa.valor != null && !jaFoiPaga && (
                                      <span className={cn("text-xs font-semibold", etapaSel ? "text-foreground" : "text-muted-foreground")}>
                                        {formatarMoeda(etapa.valor)}
                                      </span>
                                    )}
                                    {!jaFoiPaga && !editandoEstaEtapa && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          abrirEdicaoEtapa(etapa.id, etapa.valor ?? null, item.valor, modeloEtapas.length);
                                        }}
                                        className="text-[11px] text-primary-600 hover:underline font-medium shrink-0"
                                        title="Editar valor da sessão"
                                      >
                                        editar
                                      </button>
                                    )}
                                  </label>
                                  {editandoEstaEtapa && (
                                    <div className="mt-2 bg-background border border-border rounded p-2">
                                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                                        Valor desta sessão
                                      </label>
                                      <div className="flex gap-2 items-start">
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={valorEditandoEtapa}
                                          onChange={e => setValorEditandoEtapa(e.target.value)}
                                          onClick={e => e.stopPropagation()}
                                          className="flex-1 px-2 py-1 border border-input rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); confirmarEdicaoEtapa(item.id, etapa.id); }}
                                          disabled={salvandoEtapa}
                                          className="text-xs px-3 py-1 rounded bg-primary-600 text-white font-medium disabled:opacity-50"
                                        >
                                          {salvandoEtapa ? '...' : 'Salvar'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); cancelarEdicaoEtapa(); }}
                                          disabled={salvandoEtapa}
                                          className="text-xs px-3 py-1 rounded border border-input text-muted-foreground"
                                        >
                                          Cancelar
                                        </button>
                                      </div>
                                      {erroEdicaoEtapa && (
                                        <div className="mt-2 text-xs text-error-600 dark:text-error-400">{erroEdicaoEtapa}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-sm border-t border-border pt-3 mb-4">
                  <span className="text-muted-foreground">{itensSelecionados.size} item(s) selecionado(s)</span>
                  <span className="font-bold text-lg">{formatarMoeda(valorSelecionado)}</span>
                </div>
              </>
            ) : (
              <div className="py-4 text-center text-sm text-success-600 dark:text-success-400 bg-success-500/10 rounded-lg mb-4">
                Todos os procedimentos já foram cobertos.
              </div>
            )}

            {/* Formulário de pagamento */}
            {atendimento.status === 'aguardando_pagamento' && (
              <form onSubmit={handleRegistrarPagamento} className="space-y-4 border-t border-border pt-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Valor recebido (R$) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={valorPagamento}
                      onChange={(e) => setValorPagamento(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent flex-1"
                      required
                    />
                    {valorSelecionado > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setValorPagamento(valorSelecionado.toFixed(2))}
                        className="whitespace-nowrap"
                      >
                        Usar seleção
                      </Button>
                    )}
                  </div>
                </div>

                <Select
                  label="Forma de pagamento"
                  name="metodoPagamento"
                  options={METODOS_PAGAMENTO}
                  value={metodoPagamento}
                  onChange={setMetodoPagamento}
                  required
                />

                <Input
                  label="Observações"
                  name="observacoesPagamento"
                  value={observacoesPagamento}
                  onChange={setObservacoesPagamento}
                  placeholder="Ex: Entrada do tratamento"
                  hint="opcional"
                />

                <Button
                  type="submit"
                  disabled={!valorPagamento || registrando}
                  loading={registrando}
                  className="w-full"
                >
                  Confirmar Pagamento
                </Button>
              </form>
            )}
          </Card>

          {/* Histórico de pagamentos */}
          {pagamentos.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Pagamentos Registrados</h2>
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Data/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Método</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Valor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-background divide-y divide-border">
                  {pagamentos.map((pag) => (
                    <React.Fragment key={pag.id}>
                      <tr className={pag.cancelado ? 'opacity-50 bg-muted' : ''}>
                        <td className="px-4 py-3 text-muted-foreground text-sm">{formatarDataHora(pag.created_at)}</td>
                        <td className="px-4 py-3 text-sm">
                          {METODOS_PAGAMENTO.find(m => m.value === pag.metodo)?.label || pag.metodo}
                          {pag.observacoes && (
                            <span className="ml-1 text-muted-foreground text-xs">— {pag.observacoes}</span>
                          )}
                        </td>
                        <td className={cn("px-4 py-3 text-right font-medium", pag.cancelado ? "line-through text-muted-foreground" : "text-success-600")}>
                          {formatarMoeda(pag.valor)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {pag.cancelado ? (
                            <span className="text-xs font-medium text-error-600 bg-error-500/10 px-2 py-1 rounded">
                              Cancelado
                            </span>
                          ) : (
                            <button
                              onClick={() => { setCancelandoId(pag.id); setMotivoCancelamento(''); }}
                              className="text-sm text-error-600 hover:text-error-600 dark:text-error-400"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                      {!!pag.cancelado && pag.motivo_cancelamento && (
                        <tr className="bg-error-500/10">
                          <td colSpan={4} className="px-4 py-2 text-xs text-error-600 dark:text-error-400">
                            <span className="font-medium">Motivo:</span> {pag.motivo_cancelamento}
                          </td>
                        </tr>
                      )}
                      {cancelandoId === pag.id && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 bg-warning-500/10 border-l-4 border-warning-500/40">
                            <p className="text-sm font-medium text-warning-600 dark:text-warning-400 mb-2">Informe o motivo:</p>
                            <div className="flex gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={motivoCancelamento}
                                onChange={(e) => setMotivoCancelamento(e.target.value)}
                                placeholder="Ex: Digitação errada, pagamento duplicado..."
                                className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleCancelarPagamento(pag.id)}
                                disabled={!motivoCancelamento.trim()}
                              >
                                Confirmar
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setCancelandoId(null)}>
                                Voltar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot className="bg-success-500/10">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-semibold text-success-600 dark:text-success-400">Total Pago</td>
                    <td className="px-4 py-3 text-right font-bold text-lg text-success-600 dark:text-success-400">
                      {formatarMoeda(totalPago)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}
        </div>

        {/* ─── DIREITA: Procedimentos ─── */}
        <Card>
          <h2 className="text-lg font-semibold mb-1">Procedimentos</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Defina o que será feito hoje, agendado para outra sessão ou deixado pendente.
            Somente procedimentos pagos podem ser feitos hoje.
          </p>

          <div className="space-y-2">
            {atendimento.itens.map((item) => {
              const pago = item.status === 'pago';
              const modeloEtapas = (item.etapas ?? []);

              // Procedimento com sessões: exibe cada sessão como linha independente
              if (modeloEtapas.length > 0) {
                const nomeBase = item.dente_unico
                  ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                  : item.procedimento_nome;
                const jaConcluidoMulti = item.status === 'concluido';
                const realizadoEmExecucaoMulti = item.adicionado_em_execucao === 1;
                const faltaCobrarMulti = item.valor_pago < item.valor;

                // Se o item já foi concluído (voltou de em_execucao), colapsa sem botões
                if (jaConcluidoMulti) {
                  return (
                    <div
                      key={item.id}
                      className="border border-success-500/30 bg-success-500/10 rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <StatusBadge type="item" status={item.status} />
                          <span className="text-sm font-medium">{nomeBase}</span>
                          {realizadoEmExecucaoMulti && (
                            <span className="text-xs font-semibold text-primary-600 bg-primary-500/10 border border-primary-500/30 px-2 py-0.5 rounded-full">
                              Realizado em execução
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-semibold shrink-0">{formatarMoeda(item.valor)}</span>
                      </div>
                      {item.etapa_label && (
                        <div className="text-xs text-muted-foreground mb-1">
                          Sessão(ões): {item.etapa_label}
                        </div>
                      )}
                      <div className="text-xs text-success-600 dark:text-success-400 font-medium">
                        {faltaCobrarMulti
                          ? `Procedimento já concluído — falta cobrar ${formatarMoeda(item.valor - item.valor_pago)}.`
                          : 'Procedimento já concluído e pago.'}
                      </div>
                    </div>
                  );
                }

                const temDescontoMulti = item.valor_original != null && item.valor_original > item.valor;
                const editandoMulti = editandoValorItemId === item.id;
                return (
                  <div key={item.id} className="border border-border rounded-lg overflow-hidden">
                    {/* Cabeçalho do procedimento */}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted border-b border-border">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge type="item" status={item.status} />
                        <span className="text-xs font-semibold text-foreground">{nomeBase}</span>
                        {temDescontoMulti && (
                          <span className="text-xs font-semibold text-warning-600 bg-warning-500/10 border border-warning-500/30 px-2 py-0.5 rounded-full">
                            Com desconto
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {temDescontoMulti && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatarMoeda(item.valor_original!)}
                          </span>
                        )}
                        <span className="text-xs font-semibold">{formatarMoeda(item.valor)}</span>
                        {!editandoMulti && (
                          <button
                            type="button"
                            onClick={() => abrirEdicaoValor(item)}
                            className="text-xs text-primary-600 hover:underline font-medium"
                            title="Editar valor (aplicar desconto)"
                          >
                            editar
                          </button>
                        )}
                        <span className="text-xs text-muted-foreground">· {modeloEtapas.length} sessão/ões</span>
                      </div>
                    </div>
                    {editandoMulti && (
                      <div className="p-2 border-b border-border bg-background">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                          Novo valor total {item.valor_original != null && `(original: ${formatarMoeda(item.valor_original)})`}
                        </label>
                        <div className="flex gap-2 items-start">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={valorEditando}
                            onChange={e => setValorEditando(e.target.value)}
                            className="flex-1 px-2 py-1 border border-input rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => confirmarEdicaoValor(item.id)}
                            disabled={salvandoValor}
                            className="text-xs px-3 py-1 rounded bg-primary-600 text-white font-medium disabled:opacity-50"
                          >
                            {salvandoValor ? '...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelarEdicaoValor}
                            disabled={salvandoValor}
                            className="text-xs px-3 py-1 rounded border border-input text-muted-foreground"
                          >
                            Cancelar
                          </button>
                        </div>
                        {item.valor_original != null && item.valor !== item.valor_original && (
                          <button
                            type="button"
                            onClick={() => restaurarValorOriginal(item)}
                            disabled={salvandoValor}
                            className="mt-2 text-xs text-primary-600 hover:underline"
                          >
                            Restaurar valor original ({formatarMoeda(item.valor_original)})
                          </button>
                        )}
                        {erroEdicaoValor && (
                          <div className="mt-2 text-xs text-error-600 dark:text-error-400">{erroEdicaoValor}</div>
                        )}
                      </div>
                    )}
                    {temDescontoMulti && !editandoMulti && (
                      <div className="px-3 py-1.5 text-xs text-warning-600 dark:text-warning-400 bg-warning-500/5 border-b border-border">
                        Desconto aplicado: {formatarMoeda(item.valor_original! - item.valor)}
                      </div>
                    )}
                    {/* Sessões */}
                    {(() => {
                      // Sessões pagas: se há etapa_label (pagamento total ou parcial),
                      // apenas as sessões listadas estão pagas. Sem etapa_label → todas pagas se pago=true.
                      const sessoesPagas = item.etapa_label
                        ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
                        : (pago ? null : new Set<string>()); // null = todas pagas; empty set = nenhuma
                      return (
                        <div className="divide-y divide-border">
                          {modeloEtapas.map((etapa) => {
                            const acao = acaoEtapas[etapa.id] ?? 'pendente';
                            // null = todas pagas; set = verifica por nome
                            const sessaoPaga = sessoesPagas === null
                              ? true
                              : sessoesPagas.has(etapa.nome ?? '');
                            const editandoEstaEtapaDir = editandoEtapaId === etapa.id;
                            const podeEditarEtapaValor = !sessaoPaga && atendimento.status === 'aguardando_pagamento';
                            return (
                              <div
                                key={etapa.id}
                                className={cn(
                                  "px-3 py-2.5 transition-colors",
                                  acao === 'hoje'
                                    ? "bg-success-500/10"
                                    : acao === 'agendar'
                                    ? "bg-warning-500/10"
                                    : sessaoPaga
                                    ? "bg-muted/50"
                                    : "bg-background"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium">{etapa.nome ?? `Sessão ${modeloEtapas.indexOf(etapa) + 1}`}</span>
                                    {pago && !sessaoPaga && (
                                      <span className="text-xs text-warning-600 font-medium shrink-0">· não pago</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {etapa.valor != null && (
                                      <span className="text-sm font-semibold">{formatarMoeda(etapa.valor)}</span>
                                    )}
                                    {podeEditarEtapaValor && !editandoEstaEtapaDir && (
                                      <button
                                        type="button"
                                        onClick={() => abrirEdicaoEtapa(etapa.id, etapa.valor ?? null, item.valor, modeloEtapas.length)}
                                        className="text-[11px] text-primary-600 hover:underline font-medium"
                                        title="Editar valor da sessão"
                                      >
                                        editar
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {editandoEstaEtapaDir && (
                                  <div className="mb-2 bg-background border border-border rounded p-2">
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                                      Valor desta sessão
                                    </label>
                                    <div className="flex gap-2 items-start">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={valorEditandoEtapa}
                                        onChange={e => setValorEditandoEtapa(e.target.value)}
                                        className="flex-1 px-2 py-1 border border-input rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => confirmarEdicaoEtapa(item.id, etapa.id)}
                                        disabled={salvandoEtapa}
                                        className="text-xs px-3 py-1 rounded bg-primary-600 text-white font-medium disabled:opacity-50"
                                      >
                                        {salvandoEtapa ? '...' : 'Salvar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelarEdicaoEtapa}
                                        disabled={salvandoEtapa}
                                        className="text-xs px-3 py-1 rounded border border-input text-muted-foreground"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                    {erroEdicaoEtapa && (
                                      <div className="mt-2 text-xs text-error-600 dark:text-error-400">{erroEdicaoEtapa}</div>
                                    )}
                                  </div>
                                )}
                                <div className="flex gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'hoje' }))}
                                    disabled={!sessaoPaga}
                                    className={cn(
                                      "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                                      acao === 'hoje'
                                        ? "bg-success-600 border-success-600 text-white"
                                        : sessaoPaga
                                        ? "border-success-500/40 text-success-600 dark:text-success-400 hover:bg-success-500/10"
                                        : "border-border text-muted-foreground cursor-not-allowed"
                                    )}
                                  >
                                    Fazer hoje
                                  </button>
                                  <button
                                    onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'agendar' }))}
                                    className={cn(
                                      "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                                      acao === 'agendar'
                                        ? "bg-warning-500 border-warning-500 text-white"
                                        : "border-warning-500/40 text-warning-600 dark:text-warning-400 hover:bg-warning-500/10"
                                    )}
                                  >
                                    Agendar
                                  </button>
                                  <button
                                    onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'pendente' }))}
                                    className={cn(
                                      "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                                      acao === 'pendente'
                                        ? "bg-muted border-border text-foreground"
                                        : "border-input text-muted-foreground hover:bg-muted"
                                    )}
                                  >
                                    Deixar pendente
                                  </button>
                                </div>
                                {acao === 'agendar' && (
                                  <div className="mt-2 space-y-2">
                                    <input
                                      type="date"
                                      value={datasEtapasAgendamento[etapa.id] ?? ''}
                                      onChange={e => setDatasEtapasAgendamento(prev => ({ ...prev, [etapa.id]: e.target.value }))}
                                      className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm py-1"
                                    />
                                    <select
                                      value={executoresEtapasAgendamento[etapa.id] ?? ''}
                                      onChange={e => setExecutoresEtapasAgendamento(prev => ({ ...prev, [etapa.id]: e.target.value }))}
                                      className="w-full px-3 py-1 border border-input rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                    >
                                      <option value="">Executor (opcional)</option>
                                      {executores.map(ex => (
                                        <option key={ex.id} value={ex.id}>{ex.nome}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              }

              // Procedimento simples (sem sessões): linha única
              const acao = acaoItens[item.id] ?? 'pendente';
              const jaConcluido = item.status === 'concluido';
              const realizadoEmExecucao = item.adicionado_em_execucao === 1;
              const faltaCobrar = item.valor_pago < item.valor;
              const temDesconto = item.valor_original != null && item.valor_original > item.valor;
              const podeEditarValor = !jaConcluido;
              const editando = editandoValorItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "border rounded-lg p-3 transition-colors",
                    jaConcluido
                      ? "border-success-500/30 bg-success-500/10"
                      : acao === 'hoje'
                      ? "border-success-500/30 bg-success-500/10"
                      : acao === 'agendar'
                      ? "border-warning-500/30 bg-warning-500/10"
                      : pago
                      ? "border-border bg-muted/50"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <StatusBadge type="item" status={item.status} />
                      <span className="text-sm font-medium">{nomeProcedimento(item)}</span>
                      {realizadoEmExecucao && jaConcluido && (
                        <span className="text-xs font-semibold text-primary-600 bg-primary-500/10 border border-primary-500/30 px-2 py-0.5 rounded-full">
                          Realizado em execução
                        </span>
                      )}
                      {temDesconto && (
                        <span className="text-xs font-semibold text-warning-600 bg-warning-500/10 border border-warning-500/30 px-2 py-0.5 rounded-full">
                          Com desconto
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {temDesconto && (
                        <span className="text-xs text-muted-foreground line-through">
                          {formatarMoeda(item.valor_original!)}
                        </span>
                      )}
                      <span className="text-sm font-semibold">{formatarMoeda(item.valor)}</span>
                      {podeEditarValor && !editando && (
                        <button
                          type="button"
                          onClick={() => abrirEdicaoValor(item)}
                          className="text-xs text-primary-600 hover:underline font-medium"
                          title="Editar valor (aplicar desconto)"
                        >
                          editar
                        </button>
                      )}
                    </div>
                  </div>
                  {temDesconto && !editando && (
                    <div className="text-xs text-warning-600 dark:text-warning-400 mb-2">
                      Desconto aplicado: {formatarMoeda(item.valor_original! - item.valor)}
                    </div>
                  )}
                  {editando && (
                    <div className="mb-3 p-2 border border-input rounded-lg bg-background">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Novo valor {item.valor_original != null && `(original: ${formatarMoeda(item.valor_original)})`}
                      </label>
                      <div className="flex gap-2 items-start">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={valorEditando}
                          onChange={e => setValorEditando(e.target.value)}
                          className="flex-1 px-2 py-1 border border-input rounded text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => confirmarEdicaoValor(item.id)}
                          disabled={salvandoValor}
                          className="text-xs px-3 py-1 rounded bg-primary-600 text-white font-medium disabled:opacity-50"
                        >
                          {salvandoValor ? '...' : 'Salvar'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelarEdicaoValor}
                          disabled={salvandoValor}
                          className="text-xs px-3 py-1 rounded border border-input text-muted-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                      {item.valor_original != null && item.valor !== item.valor_original && (
                        <button
                          type="button"
                          onClick={() => restaurarValorOriginal(item)}
                          disabled={salvandoValor}
                          className="mt-2 text-xs text-primary-600 hover:underline"
                        >
                          Restaurar valor original ({formatarMoeda(item.valor_original)})
                        </button>
                      )}
                      {erroEdicaoValor && (
                        <div className="mt-2 text-xs text-error-600 dark:text-error-400">{erroEdicaoValor}</div>
                      )}
                    </div>
                  )}
                  {jaConcluido ? (
                    <div className="text-xs text-success-600 dark:text-success-400 font-medium">
                      {faltaCobrar
                        ? `Procedimento já concluído — falta cobrar ${formatarMoeda(item.valor - item.valor_pago)}.`
                        : 'Procedimento já concluído e pago.'}
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'hoje' }))}
                          disabled={!pago}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                            acao === 'hoje'
                              ? "bg-success-600 border-success-600 text-white"
                              : pago
                              ? "border-success-500/40 text-success-600 dark:text-success-400 hover:bg-success-500/10"
                              : "border-border text-muted-foreground cursor-not-allowed"
                          )}
                        >
                          Fazer hoje
                        </button>
                        <button
                          onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'agendar' }))}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                            acao === 'agendar'
                              ? "bg-warning-500 border-warning-500 text-white"
                              : "border-warning-500/40 text-warning-600 dark:text-warning-400 hover:bg-warning-500/10"
                          )}
                        >
                          Agendar
                        </button>
                        <button
                          onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'pendente' }))}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full font-medium border transition-colors",
                            acao === 'pendente'
                              ? "bg-muted border-border text-foreground"
                              : "border-input text-muted-foreground hover:bg-muted"
                          )}
                        >
                          Deixar pendente
                        </button>
                      </div>
                      {acao === 'agendar' && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="date"
                            value={datasAgendamento[item.id] ?? ''}
                            onChange={e => setDatasAgendamento(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-sm py-1"
                          />
                          <select
                            value={executoresAgendamento[item.id] ?? ''}
                            onChange={e => setExecutoresAgendamento(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full px-3 py-1 border border-input rounded-lg text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                          >
                            <option value="">Executor (opcional)</option>
                            {executores.map(ex => (
                              <option key={ex.id} value={ex.id}>{ex.nome}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumo */}
          {(hojeCount > 0 || agendarCount > 0) && (
            <div className="mt-4 flex gap-4 text-sm border-t border-border pt-3">
              {hojeCount > 0 && (
                <span className="text-success-600 dark:text-success-400 font-medium">{hojeCount} para fazer hoje</span>
              )}
              {agendarCount > 0 && (
                <span className="text-warning-600 dark:text-warning-400 font-medium">{agendarCount} para agendar</span>
              )}
            </div>
          )}

          {/* Enviar para execução / Finalizar */}
          {atendimento.status === 'aguardando_pagamento' && temPagamentoAtivo && (
            <div className="mt-4 pt-4 border-t border-border">
              {todosItensConcluidos ? (
                <>
                  <Button
                    onClick={handleFinalizarAtendimento}
                    disabled={enviando || itensPendentes.length > 0}
                    loading={enviando}
                    className="w-full"
                  >
                    Finalizar Atendimento →
                  </Button>
                  {itensPendentes.length > 0 && (
                    <p className="text-xs text-warning-600 dark:text-warning-400 text-center mt-2">
                      Existem procedimentos pendentes de pagamento.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Button
                    onClick={handleEnviarParaExecucao}
                    disabled={enviando}
                    loading={enviando}
                    className="w-full"
                  >
                    Enviar para Execução →
                  </Button>
                  {hojeCount === 0 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Nenhum procedimento marcado para hoje — apenas os agendamentos serão processados.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {atendimento.status === 'em_execucao' && (
            <div className="mt-4 p-3 bg-success-500/10 border border-success-500/20 rounded-lg text-sm text-success-600 dark:text-success-400 text-center">
              Atendimento em execução.{' '}
              <Link href={`/atendimentos/${id}`} className="font-medium underline">
                Ver atendimento →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
