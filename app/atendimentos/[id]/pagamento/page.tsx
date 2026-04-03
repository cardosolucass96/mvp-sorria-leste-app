'use client';

import { useState, useEffect, use } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatarMoeda, formatarDataHora } from '@/lib/utils/formatters';
import { StatusBadge } from '@/components/domain';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import { Input, Select } from '@/components/ui';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Etapa {
  id: number;
  item_atendimento_id: number;
  dente: string;
  face: string;
  status: string;
  nome?: string;
  tipo?: 'face' | 'modelo';
  valor?: number | null;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_label?: string | null;
  valor: number;
  valor_pago: number;
  status: string;
  group_id: string | null;
  dente_unico: string | null;
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

const FACE_LABEL: Record<string, string> = {
  V: 'Vestibular', L: 'Lingual', M: 'Mesial', D: 'Distal', O: 'Oclusal',
};

function calcularValorItemPagamento(item: ItemAtendimento, etapasPag: Set<number>): number {
  const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
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
  let nome = item.procedimento_nome;
  if (item.dente_unico) nome += ` • Dente ${item.dente_unico}`;
  if (item.etapa_label) nome += ` — ${item.etapa_label}`;
  return nome;
}

type AcaoItem = 'hoje' | 'agendar' | 'pendente';

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
  const [acaoItens, setAcaoItens] = useState<Record<number, AcaoItem>>({});
  const [datasAgendamento, setDatasAgendamento] = useState<Record<number, string>>({});
  const [acaoEtapas, setAcaoEtapas] = useState<Record<number, AcaoItem>>({});
  const [datasEtapasAgendamento, setDatasEtapasAgendamento] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    try {
      const resAtend = await unitFetch(`/api/atendimentos/${id}`);
      if (!resAtend.ok) throw new Error('Atendimento não encontrado');
      const atendData = await resAtend.json();
      setAtendimento(atendData);

      // Atualiza seleção de pagamento com os itens ainda pendentes.
      // Itens com etapa_label parcialmente pago: seleciona apenas as sessões NÃO pagas.
      const pendentes = (atendData.itens as ItemAtendimento[]).filter(i => i.status === 'pendente');
      setItensSelecionados(new Set(pendentes.map(i => i.id)));
      const etapasParaPagar = pendentes.flatMap(i => {
        const modeloEtapas = (i.etapas ?? []).filter(e => e.tipo === 'modelo');
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
        const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
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
      const itensHoje: number[] = [];
      const itensAgendar: { item_id: number; data_agendada: string | null }[] = [];
      const etapasAgendar: { etapa_id: number; item_id: number; tipo: 'modelo'; data_agendada?: string | null; pago_override?: 0 | 1 }[] = [];

      for (const item of atendimento.itens) {
        const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
        if (modeloEtapas.length > 0) {
          // Sessões com pagamento parcial: etapa_label indica quais foram pagas neste item.
          // Sessões fora do etapa_label (não pagas) são auto-diferidas com pago=0.
          // null = todas pagas; set = apenas as listadas estão pagas
          const sessoesPagas = item.etapa_label
            ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
            : (item.status === 'pago' ? null : new Set<string>());

          for (const etapa of modeloEtapas) {
            const acao = acaoEtapas[etapa.id] ?? 'pendente';
            const sessaoPaga = sessoesPagas === null ? true : sessoesPagas.has(etapa.nome ?? '');
            if (acao === 'agendar') {
              etapasAgendar.push({
                etapa_id: etapa.id,
                item_id: item.id,
                tipo: 'modelo',
                data_agendada: datasEtapasAgendamento[etapa.id] || null,
                pago_override: sessaoPaga ? 1 : 0,
              });
            } else if (!sessaoPaga && acao !== 'hoje') {
              // Sessão não paga deixada como pendente → auto-difere sem data
              etapasAgendar.push({
                etapa_id: etapa.id,
                item_id: item.id,
                tipo: 'modelo',
                data_agendada: null,
                pago_override: 0,
              });
            }
          }
          // Item fica no atendimento se ao menos 1 sessão paga é 'hoje' ou 'pendente'
          const temHoje = modeloEtapas.some(e => (acaoEtapas[e.id] ?? 'pendente') === 'hoje');
          const temPendentePago = modeloEtapas.some(e => {
            const acao = acaoEtapas[e.id] ?? 'pendente';
            const sessaoPaga = sessoesPagas === null ? true : sessoesPagas.has(e.nome ?? '');
            return acao === 'pendente' && sessaoPaga;
          });
          if (temHoje || temPendentePago) itensHoje.push(item.id);
        } else {
          const acao = acaoItens[item.id] ?? 'pendente';
          if (acao === 'hoje') itensHoje.push(item.id);
          if (acao === 'agendar') {
            itensAgendar.push({ item_id: item.id, data_agendada: datasAgendamento[item.id] || null });
          }
        }
      }

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
    const modeloEtapas = (item?.etapas ?? []).filter(e => e.tipo === 'modelo');
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
        <p className="text-muted mb-4">Atendimento não encontrado</p>
        <Link href="/atendimentos" className="text-info-600">← Voltar para lista</Link>
      </div>
    );
  }

  const totalPago = pagamentos.filter(p => !p.cancelado).reduce((acc, p) => acc + p.valor, 0);
  const temPagamentoAtivo = pagamentos.some(p => !p.cancelado);
  const itensPendentes = atendimento.itens.filter(i => i.status === 'pendente');
  const valorSelecionado = atendimento.itens
    .filter(i => itensSelecionados.has(i.id))
    .reduce((sum, i) => sum + calcularValorItemPagamento(i, etapasPagamento), 0);
  const hojeCount = atendimento.itens.reduce((acc, item) => {
    const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
    if (modeloEtapas.length > 0) return acc + modeloEtapas.filter(e => acaoEtapas[e.id] === 'hoje').length;
    return acc + (acaoItens[item.id] === 'hoje' ? 1 : 0);
  }, 0);
  const agendarCount = atendimento.itens.reduce((acc, item) => {
    const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
    if (modeloEtapas.length > 0) return acc + modeloEtapas.filter(e => acaoEtapas[e.id] === 'agendar').length;
    return acc + (acaoItens[item.id] === 'agendar' ? 1 : 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/atendimentos/${id}`} className="text-muted hover:text-neutral-700">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pagamento</h1>
          <p className="text-neutral-600">{atendimento.cliente_nome} — Atendimento #{atendimento.id}</p>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Dados do Cliente */}
      <div className="card bg-info-50 border border-info-200">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-info-600">Cliente</p>
            <p className="font-semibold text-info-900">{atendimento.cliente_nome}</p>
          </div>
          {atendimento.cliente_cpf && (
            <div>
              <p className="text-sm text-info-600">CPF</p>
              <p className="font-medium text-info-800">{atendimento.cliente_cpf}</p>
            </div>
          )}
          {atendimento.cliente_telefone && (
            <div>
              <p className="text-sm text-info-600">Telefone</p>
              <p className="font-medium text-info-800">{atendimento.cliente_telefone}</p>
            </div>
          )}
          {saldoInfo > 0 && (
            <div className="ml-auto">
              <p className="text-sm text-info-600">Saldo disponível</p>
              <p className="font-semibold text-info-800">{formatarMoeda(saldoInfo)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ─── ESQUERDA: Pagar ─── */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Pagar</h2>

            {/* Seleção de itens pendentes */}
            {itensPendentes.length > 0 ? (
              <>
                <p className="text-xs text-muted mb-3">
                  Selecione o que será cobrado nesta cobrança, até o nível de sessão.
                </p>

                <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg overflow-hidden mb-4">
                  {itensPendentes.map((item) => {
                    const selecionado = itensSelecionados.has(item.id);
                    const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');
                    const faceEtapas = (item.etapas ?? []).filter(e => e.tipo === 'face');
                    const valorExibido = calcularValorItemPagamento(item, etapasPagamento);
                    const label = item.dente_unico
                      ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                      : item.procedimento_nome;
                    // Sessões já pagas em pagamentos anteriores (etapa_label = pagamento parcial)
                    const sessoesParcialmentePagas = item.etapa_label
                      ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
                      : null;

                    return (
                      <div key={item.id} className={selecionado ? 'bg-info-50' : 'bg-neutral-50'}>
                        <div className="px-4 py-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => toggleItemPagamento(item.id)}
                              className="w-4 h-4 accent-primary shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium ${selecionado ? 'text-foreground' : 'text-neutral-500'}`}>
                                {label}
                              </span>
                              {sessoesParcialmentePagas && (
                                <span className="ml-2 text-xs text-success-600 font-medium">
                                  · {item.etapa_label} já pago
                                </span>
                              )}
                              {selecionado && modeloEtapas.length > 0 && !sessoesParcialmentePagas && (
                                <span className="ml-2 text-xs text-muted">
                                  ({modeloEtapas.filter(e => etapasPagamento.has(e.id)).length}/{modeloEtapas.length} sessão/ões)
                                </span>
                              )}
                            </div>
                            <span className={`text-sm font-semibold shrink-0 ${selecionado ? 'text-foreground' : 'text-neutral-400'}`}>
                              {formatarMoeda(valorExibido)}
                            </span>
                          </label>

                          {selecionado && faceEtapas.length > 0 && (
                            <div className="mt-1.5 ml-7 text-xs text-muted">
                              {faceEtapas.length} face(s): {faceEtapas.map(e => `${e.dente}-${FACE_LABEL[e.face] ?? e.face}`).join(', ')}
                            </div>
                          )}
                        </div>

                        {/* Sessões (modelo etapas) — mostra todas; já pagas bloqueadas */}
                        {selecionado && modeloEtapas.length > 0 && (
                          <div className="ml-7 mr-4 mb-3 border border-neutral-200 rounded-lg overflow-hidden">
                            {modeloEtapas.map((etapa) => {
                              const jaFoiPaga = sessoesParcialmentePagas?.has(etapa.nome ?? '') ?? false;
                              const etapaSel = etapasPagamento.has(etapa.id);
                              return (
                                <div key={etapa.id} className={`px-3 py-2 border-b border-neutral-100 last:border-b-0 ${jaFoiPaga ? 'bg-success-50' : etapaSel ? '' : 'bg-neutral-50'}`}>
                                  <label className={`flex items-center gap-2 ${jaFoiPaga ? 'cursor-default' : 'cursor-pointer'}`}>
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
                                      className="w-3.5 h-3.5 accent-primary-600 shrink-0"
                                    />
                                    <span className={`text-xs font-medium flex-1 ${jaFoiPaga ? 'text-success-700' : etapaSel ? 'text-foreground' : 'text-neutral-500'}`}>
                                      {etapa.nome ?? `Sessão ${modeloEtapas.indexOf(etapa) + 1}`}
                                    </span>
                                    {jaFoiPaga && (
                                      <span className="text-xs font-medium text-success-600 bg-success-100 px-1.5 py-0.5 rounded">Pago</span>
                                    )}
                                    {etapa.valor != null && !jaFoiPaga && (
                                      <span className={`text-xs font-semibold ${etapaSel ? 'text-foreground' : 'text-neutral-400'}`}>
                                        {formatarMoeda(etapa.valor)}
                                      </span>
                                    )}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-sm border-t border-neutral-200 pt-3 mb-4">
                  <span className="text-muted">{itensSelecionados.size} item(s) selecionado(s)</span>
                  <span className="font-bold text-lg">{formatarMoeda(valorSelecionado)}</span>
                </div>
              </>
            ) : (
              <div className="py-4 text-center text-sm text-success-700 bg-success-50 rounded-lg mb-4">
                Todos os procedimentos já foram cobertos.
              </div>
            )}

            {/* Formulário de pagamento */}
            {atendimento.status === 'aguardando_pagamento' && (
              <form onSubmit={handleRegistrarPagamento} className="space-y-4 border-t border-neutral-200 pt-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
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
                      className="input flex-1"
                      required
                    />
                    {valorSelecionado > 0 && (
                      <button
                        type="button"
                        onClick={() => setValorPagamento(valorSelecionado.toFixed(2))}
                        className="btn btn-secondary whitespace-nowrap text-sm"
                      >
                        Usar seleção
                      </button>
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

                <button
                  type="submit"
                  disabled={!valorPagamento || registrando}
                  className="btn btn-primary w-full disabled:opacity-50"
                >
                  {registrando ? 'Registrando...' : 'Confirmar Pagamento'}
                </button>
              </form>
            )}
          </div>

          {/* Histórico de pagamentos */}
          {pagamentos.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Pagamentos Registrados</h2>
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-surface-secondary">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Data/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Método</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Valor</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-200">
                  {pagamentos.map((pag) => (
                    <>
                      <tr key={pag.id} className={pag.cancelado ? 'opacity-50 bg-neutral-50' : ''}>
                        <td className="px-4 py-3 text-neutral-600 text-sm">{formatarDataHora(pag.created_at)}</td>
                        <td className="px-4 py-3 text-sm">
                          {METODOS_PAGAMENTO.find(m => m.value === pag.metodo)?.label || pag.metodo}
                          {pag.observacoes && (
                            <span className="ml-1 text-muted text-xs">— {pag.observacoes}</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${pag.cancelado ? 'line-through text-neutral-400' : 'text-success-600'}`}>
                          {formatarMoeda(pag.valor)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {pag.cancelado ? (
                            <span className="text-xs font-medium text-error-600 bg-error-50 px-2 py-1 rounded">
                              Cancelado
                            </span>
                          ) : (
                            <button
                              onClick={() => { setCancelandoId(pag.id); setMotivoCancelamento(''); }}
                              className="text-sm text-error-600 hover:text-error-800"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                      {pag.cancelado && pag.motivo_cancelamento && (
                        <tr key={`${pag.id}-motivo`} className="bg-error-50">
                          <td colSpan={4} className="px-4 py-2 text-xs text-error-700">
                            <span className="font-medium">Motivo:</span> {pag.motivo_cancelamento}
                          </td>
                        </tr>
                      )}
                      {cancelandoId === pag.id && (
                        <tr key={`${pag.id}-cancel`}>
                          <td colSpan={4} className="px-4 py-3 bg-warning-50 border-l-4 border-warning-400">
                            <p className="text-sm font-medium text-warning-800 mb-2">Informe o motivo:</p>
                            <div className="flex gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={motivoCancelamento}
                                onChange={(e) => setMotivoCancelamento(e.target.value)}
                                placeholder="Ex: Digitação errada, pagamento duplicado..."
                                className="input flex-1 text-sm"
                              />
                              <button
                                onClick={() => handleCancelarPagamento(pag.id)}
                                disabled={!motivoCancelamento.trim()}
                                className="btn btn-primary text-sm disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button onClick={() => setCancelandoId(null)} className="btn btn-secondary text-sm">
                                Voltar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
                <tfoot className="bg-success-50">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-semibold text-success-700">Total Pago</td>
                    <td className="px-4 py-3 text-right font-bold text-lg text-success-700">
                      {formatarMoeda(totalPago)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ─── DIREITA: Procedimentos ─── */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Procedimentos</h2>
          <p className="text-xs text-muted mb-4">
            Defina o que será feito hoje, agendado para outra sessão ou deixado pendente.
            Somente procedimentos pagos podem ser feitos hoje.
          </p>

          <div className="space-y-2">
            {atendimento.itens.map((item) => {
              const pago = item.status === 'pago';
              const modeloEtapas = (item.etapas ?? []).filter(e => e.tipo === 'modelo');

              // Procedimento com sessões: exibe cada sessão como linha independente
              if (modeloEtapas.length > 0) {
                const nomeBase = item.dente_unico
                  ? `${item.procedimento_nome} • Dente ${item.dente_unico}`
                  : item.procedimento_nome;
                return (
                  <div key={item.id} className="border border-neutral-200 rounded-lg overflow-hidden">
                    {/* Cabeçalho do procedimento */}
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-100 border-b border-neutral-200">
                      <div className="flex items-center gap-2">
                        <StatusBadge type="item" status={item.status} />
                        <span className="text-xs font-semibold text-neutral-700">{nomeBase}</span>
                      </div>
                      <span className="text-xs text-muted">{modeloEtapas.length} sessão/ões</span>
                    </div>
                    {/* Sessões */}
                    {(() => {
                      // Sessões pagas: se há etapa_label (pagamento total ou parcial),
                      // apenas as sessões listadas estão pagas. Sem etapa_label → todas pagas se pago=true.
                      const sessoesPagas = item.etapa_label
                        ? new Set(item.etapa_label.split(', ').map(s => s.trim()))
                        : (pago ? null : new Set<string>()); // null = todas pagas; empty set = nenhuma
                      return (
                        <div className="divide-y divide-neutral-100">
                          {modeloEtapas.map((etapa) => {
                            const acao = acaoEtapas[etapa.id] ?? 'pendente';
                            // null = todas pagas; set = verifica por nome
                            const sessaoPaga = sessoesPagas === null
                              ? true
                              : sessoesPagas.has(etapa.nome ?? '');
                            return (
                              <div
                                key={etapa.id}
                                className={`px-3 py-2.5 transition-colors ${
                                  acao === 'hoje'
                                    ? 'bg-success-50'
                                    : acao === 'agendar'
                                    ? 'bg-warning-50'
                                    : sessaoPaga
                                    ? 'bg-info-50'
                                    : 'bg-surface'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium">{etapa.nome ?? `Sessão ${modeloEtapas.indexOf(etapa) + 1}`}</span>
                                    {pago && !sessaoPaga && (
                                      <span className="text-xs text-warning-600 font-medium shrink-0">· não pago</span>
                                    )}
                                  </div>
                                  {etapa.valor != null && (
                                    <span className="text-sm font-semibold shrink-0">{formatarMoeda(etapa.valor)}</span>
                                  )}
                                </div>
                                <div className="flex gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'hoje' }))}
                                    disabled={!sessaoPaga}
                                    className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                                      acao === 'hoje'
                                        ? 'bg-success-600 border-success-600 text-white'
                                        : sessaoPaga
                                        ? 'border-success-400 text-success-700 hover:bg-success-100'
                                        : 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                                    }`}
                                  >
                                    Fazer hoje
                                  </button>
                                  <button
                                    onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'agendar' }))}
                                    className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                                      acao === 'agendar'
                                        ? 'bg-warning-500 border-warning-500 text-white'
                                        : 'border-warning-400 text-warning-700 hover:bg-warning-50'
                                    }`}
                                  >
                                    Agendar
                                  </button>
                                  {acao !== 'pendente' && (
                                    <button
                                      onClick={() => setAcaoEtapas(prev => ({ ...prev, [etapa.id]: 'pendente' }))}
                                      className="text-xs px-3 py-1 rounded-full font-medium border border-neutral-300 text-neutral-500 hover:bg-neutral-50 transition-colors"
                                    >
                                      Pendente
                                    </button>
                                  )}
                                </div>
                                {acao === 'agendar' && (
                                  <div className="mt-2">
                                    <input
                                      type="date"
                                      value={datasEtapasAgendamento[etapa.id] ?? ''}
                                      onChange={e => setDatasEtapasAgendamento(prev => ({ ...prev, [etapa.id]: e.target.value }))}
                                      className="input text-sm py-1"
                                    />
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
              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-3 transition-colors ${
                    acao === 'hoje'
                      ? 'border-success-300 bg-success-50'
                      : acao === 'agendar'
                      ? 'border-warning-300 bg-warning-50'
                      : pago
                      ? 'border-info-200 bg-info-50'
                      : 'border-neutral-200 bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <StatusBadge type="item" status={item.status} />
                      <span className="text-sm font-medium">{nomeProcedimento(item)}</span>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatarMoeda(item.valor)}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'hoje' }))}
                      disabled={!pago}
                      className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                        acao === 'hoje'
                          ? 'bg-success-600 border-success-600 text-white'
                          : pago
                          ? 'border-success-400 text-success-700 hover:bg-success-100'
                          : 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      Fazer hoje
                    </button>
                    <button
                      onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'agendar' }))}
                      className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                        acao === 'agendar'
                          ? 'bg-warning-500 border-warning-500 text-white'
                          : 'border-warning-400 text-warning-700 hover:bg-warning-50'
                      }`}
                    >
                      Agendar
                    </button>
                    {acao !== 'pendente' && (
                      <button
                        onClick={() => setAcaoItens(prev => ({ ...prev, [item.id]: 'pendente' }))}
                        className="text-xs px-3 py-1 rounded-full font-medium border border-neutral-300 text-neutral-500 hover:bg-neutral-50 transition-colors"
                      >
                        Deixar pendente
                      </button>
                    )}
                  </div>
                  {acao === 'agendar' && (
                    <div className="mt-2">
                      <input
                        type="date"
                        value={datasAgendamento[item.id] ?? ''}
                        onChange={e => setDatasAgendamento(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="input text-sm py-1"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumo */}
          {(hojeCount > 0 || agendarCount > 0) && (
            <div className="mt-4 flex gap-4 text-sm border-t border-neutral-200 pt-3">
              {hojeCount > 0 && (
                <span className="text-success-700 font-medium">{hojeCount} para fazer hoje</span>
              )}
              {agendarCount > 0 && (
                <span className="text-warning-700 font-medium">{agendarCount} para agendar</span>
              )}
            </div>
          )}

          {/* Enviar para execução */}
          {atendimento.status === 'aguardando_pagamento' && temPagamentoAtivo && (
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <button
                onClick={handleEnviarParaExecucao}
                disabled={enviando}
                className="btn btn-primary w-full disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Enviar para Execução →'}
              </button>
              {hojeCount === 0 && (
                <p className="text-xs text-muted text-center mt-2">
                  Nenhum procedimento marcado para hoje — apenas os agendamentos serão processados.
                </p>
              )}
            </div>
          )}

          {atendimento.status === 'em_execucao' && (
            <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg text-sm text-success-700 text-center">
              Atendimento em execução.{' '}
              <Link href={`/atendimentos/${id}`} className="font-medium underline">
                Ver atendimento →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
