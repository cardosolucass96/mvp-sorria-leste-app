'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora, formatarMoeda, nomeProcedimentoItem } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
import type { Usuario } from '@/lib/types';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import { Button, Card, Input } from '@/components/ui';

type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'crediario' | 'afins_sorria';
type DestinoStatus = 'fazer_hoje' | 'agendar' | 'pago_sem_data' | 'nao_pago_sem_data';

interface Etapa {
  id: number;
  item_atendimento_id: number;
  nome?: string;
  valor?: number | null;
  valor_pago?: number;
  saldo?: number;
  financeiro_status?: 'nao_pago' | 'parcial' | 'pago';
  destino_status?: string | null;
  data_agendada?: string | null;
  executor_destino_id?: number | null;
}

interface ItemAtendimento {
  id: number;
  procedimento_id: number;
  procedimento_nome: string;
  valor: number;
  valor_original: number | null;
  valor_final: number | null;
  valor_pago: number;
  desconto_valor: number;
  desconto_motivo: string | null;
  status: string;
  executor_id: number | null;
  dente_unico: string | null;
  etapas?: Etapa[];
  financeiro_status?: 'nao_pago' | 'parcial' | 'pago';
  saldo?: number;
  destino_status?: string | null;
  destino_data_agendada?: string | null;
  destino_executor_id?: number | null;
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
  status: string;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

interface LinhaCobranca {
  key: string;
  itemId: number;
  etapaModeloId: number | null;
  label: string;
  valor: number;
  valorPago: number;
  saldo: number;
  financeiroStatus: 'nao_pago' | 'parcial' | 'pago';
  destinoStatus: DestinoStatus;
  dataAgendada: string;
  executorId: string;
}

const METODOS_PAGAMENTO: Array<{ value: MetodoPagamento; label: string }> = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Cartão Débito' },
  { value: 'cartao_credito', label: 'Cartão Crédito' },
  { value: 'crediario', label: 'Crediário' },
  { value: 'afins_sorria', label: 'Afins Sorria' },
];

function linhaKey(itemId: number, etapaModeloId: number | null) {
  return `${itemId}:${etapaModeloId ?? 'item'}`;
}

function getEtapaModeloId(etapaVirtualId: number, itemId: number) {
  return etapaVirtualId - itemId * 100000;
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
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [salvandoDestinos, setSalvandoDestinos] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [selecoesPagamento, setSelecoesPagamento] = useState<Record<string, { selected: boolean; amount: string }>>({});
  const [destinos, setDestinos] = useState<Record<string, { status: DestinoStatus; data: string; executorId: string }>>({});
  const [descontoEditando, setDescontoEditando] = useState<Record<number, { valor: string; motivo: string }>>({});

  useEffect(() => {
    void carregarDados();
    void carregarExecutores();
  }, [carregarDados, id]);

  const carregarExecutores = async () => {
    try {
      const res = await fetch('/api/usuarios');
      if (!res.ok) return;
      const data: Usuario[] = await res.json();
      setExecutores(data.filter((usuario) => usuario.role === 'executor' || usuario.role === 'admin'));
    } catch {
      // noop
    }
  };

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true);
      const [resAtendimento, resPagamentos] = await Promise.all([
        unitFetch(`/api/atendimentos/${id}`),
        unitFetch(`/api/atendimentos/${id}/pagamentos`),
      ]);
      if (!resAtendimento.ok) throw new Error('Atendimento não encontrado');
      const atendimentoData: Atendimento = await resAtendimento.json();
      const pagamentosData: Pagamento[] = await resPagamentos.json();
      setAtendimento(atendimentoData);
      setPagamentos(pagamentosData);

      const novasSelecoes: Record<string, { selected: boolean; amount: string }> = {};
      const novosDestinos: Record<string, { status: DestinoStatus; data: string; executorId: string }> = {};
      const novosDescontos: Record<number, { valor: string; motivo: string }> = {};

      for (const item of atendimentoData.itens) {
        novosDescontos[item.id] = {
          valor: String((item.valor_final ?? item.valor).toFixed(2)),
          motivo: item.desconto_motivo ?? '',
        };

        if ((item.etapas ?? []).length > 0) {
          for (const etapa of item.etapas ?? []) {
            const etapaModeloId = getEtapaModeloId(etapa.id, item.id);
            const key = linhaKey(item.id, etapaModeloId);
            const saldo = etapa.saldo ?? Math.max(0, (etapa.valor ?? 0) - (etapa.valor_pago ?? 0));
            novasSelecoes[key] = {
              selected: saldo > 0,
              amount: saldo > 0 ? saldo.toFixed(2) : '',
            };
            novosDestinos[key] = {
              status: (etapa.destino_status as DestinoStatus | null) ?? ((etapa.financeiro_status === 'pago' || saldo === 0) ? 'fazer_hoje' : 'nao_pago_sem_data'),
              data: etapa.data_agendada ?? '',
              executorId: etapa.executor_destino_id ? String(etapa.executor_destino_id) : (item.executor_id ? String(item.executor_id) : ''),
            };
          }
          continue;
        }

        const key = linhaKey(item.id, null);
        const saldo = item.saldo ?? Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago);
        novasSelecoes[key] = {
          selected: saldo > 0,
          amount: saldo > 0 ? saldo.toFixed(2) : '',
        };
        novosDestinos[key] = {
          status: (item.destino_status as DestinoStatus | null) ?? ((item.financeiro_status === 'pago' || saldo === 0) ? 'fazer_hoje' : 'nao_pago_sem_data'),
          data: item.destino_data_agendada ?? '',
          executorId: item.destino_executor_id ? String(item.destino_executor_id) : (item.executor_id ? String(item.executor_id) : ''),
        };
      }

      setSelecoesPagamento(novasSelecoes);
      setDestinos(novosDestinos);
      setDescontoEditando(novosDescontos);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar pagamento');
    } finally {
      setLoading(false);
    }
  }, [id, unitFetch]);

  const linhas = useMemo<LinhaCobranca[]>(() => {
    if (!atendimento) return [];
    const resultado: LinhaCobranca[] = [];
    for (const item of atendimento.itens) {
      if ((item.etapas ?? []).length > 0) {
        for (const etapa of item.etapas ?? []) {
          const etapaModeloId = getEtapaModeloId(etapa.id, item.id);
          const key = linhaKey(item.id, etapaModeloId);
          resultado.push({
            key,
            itemId: item.id,
            etapaModeloId,
            label: `${nomeProcedimentoItem(item)} — ${etapa.nome}`,
            valor: etapa.valor ?? 0,
            valorPago: etapa.valor_pago ?? 0,
            saldo: etapa.saldo ?? Math.max(0, (etapa.valor ?? 0) - (etapa.valor_pago ?? 0)),
            financeiroStatus: etapa.financeiro_status ?? 'nao_pago',
            destinoStatus: destinos[key]?.status ?? 'nao_pago_sem_data',
            dataAgendada: destinos[key]?.data ?? '',
            executorId: destinos[key]?.executorId ?? '',
          });
        }
        continue;
      }

      const key = linhaKey(item.id, null);
      resultado.push({
        key,
        itemId: item.id,
        etapaModeloId: null,
        label: nomeProcedimentoItem(item),
        valor: item.valor_final ?? item.valor,
        valorPago: item.valor_pago,
        saldo: item.saldo ?? Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago),
        financeiroStatus: item.financeiro_status ?? 'nao_pago',
        destinoStatus: destinos[key]?.status ?? 'nao_pago_sem_data',
        dataAgendada: destinos[key]?.data ?? '',
        executorId: destinos[key]?.executorId ?? '',
      });
    }
    return resultado;
  }, [atendimento, destinos]);

  const totalSelecionado = useMemo(() => {
    return Object.entries(selecoesPagamento).reduce((sum, [key, selecionado]) => {
      if (!selecionado.selected) return sum;
      const linha = linhas.find((item) => item.key === key);
      if (!linha) return sum;
      const valor = Number(selecionado.amount.replace(',', '.'));
      if (!Number.isFinite(valor)) return sum;
      return sum + valor;
    }, 0);
  }, [linhas, selecoesPagamento]);

  const handleSalvarDesconto = async (itemId: number) => {
    const dados = descontoEditando[itemId];
    const valor = Number(dados.valor.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      setError('Valor de desconto inválido');
      return;
    }

    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_final: valor, desconto_motivo: dados.motivo || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar desconto');
      }
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar desconto');
    }
  };

  const handleRegistrarPagamento = async (event: React.FormEvent) => {
    event.preventDefault();
    const alocacoes = Object.entries(selecoesPagamento)
      .filter(([, selecao]) => selecao.selected)
      .map(([key, selecao]) => {
        const linha = linhas.find((item) => item.key === key);
        if (!linha) return null;
        const valor = Number(selecao.amount.replace(',', '.'));
        if (!Number.isFinite(valor) || valor <= 0) return null;
        return {
          item_id: linha.itemId,
          etapa_modelo_id: linha.etapaModeloId,
          valor,
        };
      })
      .filter(Boolean);

    if (alocacoes.length === 0) {
      setError('Selecione ao menos um item ou sessão para cobrar');
      return;
    }

    setRegistrando(true);
    setError('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: Number(totalSelecionado.toFixed(2)),
          metodo: metodoPagamento,
          observacoes: observacoesPagamento || null,
          alocacoes,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar pagamento');
      }
      setObservacoesPagamento('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar pagamento');
    } finally {
      setRegistrando(false);
    }
  };

  const handleSalvarDestinos = async () => {
    if (!atendimento) return;
    const payload = linhas.map((linha) => ({
      item_id: linha.itemId,
      etapa_modelo_id: linha.etapaModeloId,
      destino_status: destinos[linha.key]?.status ?? 'nao_pago_sem_data',
      data_agendada: destinos[linha.key]?.data || null,
      executor_id: destinos[linha.key]?.executorId ? Number(destinos[linha.key].executorId) : null,
    }));

    setSalvandoDestinos(true);
    setError('');
    try {
      const resSelecao = await unitFetch(`/api/atendimentos/${id}/selecionar-hoje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinos: payload }),
      });
      if (!resSelecao.ok) {
        const data = await resSelecao.json();
        throw new Error(data.error || 'Erro ao salvar destinos');
      }

      const resStatus = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'em_execucao' }),
      });
      if (!resStatus.ok) {
        const data = await resStatus.json();
        throw new Error(data.error || 'Erro ao liberar execução');
      }

      router.push(`/atendimentos/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar destinos');
    } finally {
      setSalvandoDestinos(false);
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
        throw new Error(data.error || 'Erro ao cancelar pagamento');
      }
      setCancelandoId(null);
      setMotivoCancelamento('');
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar pagamento');
    }
  };

  if (loading) return <LoadingState text="Carregando pagamento..." />;

  if (!atendimento) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Atendimento não encontrado</p>
        <Link href="/atendimentos" className="text-primary hover:text-primary-700">
          Voltar para atendimentos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Atendimento #{atendimento.id}</p>
          <h1 className="text-3xl font-semibold">{atendimento.cliente_nome}</h1>
        </div>
        <Link href={`/atendimentos/${id}`} className="text-sm text-primary hover:text-primary-700">
          Voltar ao atendimento
        </Link>
      </div>

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Etapa 1</p>
            <h2 className="text-2xl font-semibold">Registrar cobrança</h2>
            <p className="text-sm text-muted-foreground">
              Selecione exatamente o que está sendo cobrado agora. O destino clínico vem na etapa seguinte.
            </p>
          </div>

          <div className="space-y-4">
            {atendimento.itens.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">{nomeProcedimentoItem(item)}</p>
                    <p className="text-sm text-muted-foreground">
                      Tabela {formatarMoeda(item.valor_original ?? item.valor_final ?? item.valor)}
                      {' · '}
                      Final {formatarMoeda(item.valor_final ?? item.valor)}
                      {' · '}
                      Pago {formatarMoeda(item.valor_pago)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Saldo {formatarMoeda(item.saldo ?? Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_180px_1fr_120px]">
                  <Input
                    label="Valor final"
                    name={`desconto-valor-${item.id}`}
                    value={descontoEditando[item.id]?.valor ?? ''}
                    onChange={(value) => setDescontoEditando((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], valor: value },
                    }))}
                  />
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => void handleSalvarDesconto(item.id)}
                    >
                      Salvar desconto
                    </Button>
                  </div>
                  <Input
                    label="Motivo do desconto"
                    name={`desconto-motivo-${item.id}`}
                    value={descontoEditando[item.id]?.motivo ?? ''}
                    onChange={(value) => setDescontoEditando((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], motivo: value },
                    }))}
                  />
                  <div className="flex items-end text-sm text-muted-foreground">
                    {item.desconto_valor > 0 ? `Desconto ${formatarMoeda(item.desconto_valor)}` : 'Sem desconto'}
                  </div>
                </div>

                <div className="space-y-2">
                  {((item.etapas ?? []).length > 0 ? item.etapas ?? [] : [null]).map((etapa, index) => {
                    const etapaModeloId = etapa ? getEtapaModeloId(etapa.id, item.id) : null;
                    const key = linhaKey(item.id, etapaModeloId);
                    const linha = linhas.find((current) => current.key === key);
                    if (!linha) return null;
                    return (
                      <div key={key} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_100px_140px_120px]">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selecoesPagamento[key]?.selected ?? false}
                            onChange={(event) => setSelecoesPagamento((prev) => ({
                              ...prev,
                              [key]: {
                                ...prev[key],
                                selected: event.target.checked,
                              },
                            }))}
                            className="mt-1"
                          />
                          <div>
                            <p className="font-medium">{etapa ? etapa.nome : nomeProcedimentoItem(item)}</p>
                            <p className="text-sm text-muted-foreground">
                              Valor {formatarMoeda(linha.valor)} · Pago {formatarMoeda(linha.valorPago)} · Saldo {formatarMoeda(linha.saldo)}
                            </p>
                          </div>
                        </label>
                        <div className="text-sm text-muted-foreground flex items-center">
                          {linha.financeiroStatus === 'pago' ? 'Pago' : linha.financeiroStatus === 'parcial' ? 'Parcial' : 'Não pago'}
                        </div>
                        <Input
                          name={`cobrar-${key}`}
                          label={index === 0 ? 'Cobrar agora' : 'Cobrar agora'}
                          value={selecoesPagamento[key]?.amount ?? ''}
                          onChange={(value) => setSelecoesPagamento((prev) => ({
                            ...prev,
                            [key]: {
                              ...prev[key],
                              amount: value,
                            },
                          }))}
                          disabled={!(selecoesPagamento[key]?.selected ?? false)}
                        />
                        <div className="text-right text-sm text-muted-foreground flex items-center justify-end">
                          {formatarMoeda(Number(selecoesPagamento[key]?.amount || 0))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleRegistrarPagamento} className="rounded-xl border border-border p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Forma de pagamento</span>
                <select
                  value={metodoPagamento}
                  onChange={(event) => setMetodoPagamento(event.target.value as MetodoPagamento)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2"
                >
                  {METODOS_PAGAMENTO.map((metodo) => (
                    <option key={metodo.value} value={metodo.value}>{metodo.label}</option>
                  ))}
                </select>
              </label>
              <Input
                label="Observações"
                name="observacoes_pagamento"
                value={observacoesPagamento}
                onChange={setObservacoesPagamento}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total desta cobrança: {formatarMoeda(totalSelecionado)}</p>
              <Button type="submit" loading={registrando}>Registrar cobrança</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Resumo</p>
              <h2 className="text-2xl font-semibold">Financeiro</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Total</span><strong>{formatarMoeda(atendimento.total)}</strong></div>
              <div className="flex items-center justify-between"><span>Pago</span><strong className="text-success-600">{formatarMoeda(atendimento.total_pago)}</strong></div>
              <div className="flex items-center justify-between"><span>Pendente</span><strong className="text-error-600">{formatarMoeda(Math.max(0, atendimento.total - atendimento.total_pago))}</strong></div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Etapa 2</p>
              <h2 className="text-2xl font-semibold">Destino operacional</h2>
              <p className="text-sm text-muted-foreground">
                Decida o que será feito hoje e o que vira agenda ou fila futura.
              </p>
            </div>

            <div className="space-y-3">
              {linhas.map((linha) => (
                <div key={linha.key} className="rounded-lg border border-border p-3 space-y-3">
                  <div>
                    <p className="font-medium">{linha.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatarMoeda(linha.valor)} · pago {formatarMoeda(linha.valorPago)} · saldo {formatarMoeda(linha.saldo)}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Destino</span>
                      <select
                        value={destinos[linha.key]?.status ?? 'nao_pago_sem_data'}
                        onChange={(event) => setDestinos((prev) => ({
                          ...prev,
                          [linha.key]: {
                            ...prev[linha.key],
                            status: event.target.value as DestinoStatus,
                          },
                        }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2"
                      >
                        <option value="fazer_hoje">Fazer hoje</option>
                        <option value="agendar">Agendar</option>
                        <option value="pago_sem_data">Pago sem data</option>
                        <option value="nao_pago_sem_data">Não pago sem data</option>
                      </select>
                    </label>
                    <Input
                      label="Data futura"
                      name={`data-${linha.key}`}
                      type="date"
                      value={destinos[linha.key]?.data ?? ''}
                      onChange={(value) => setDestinos((prev) => ({
                        ...prev,
                        [linha.key]: {
                          ...prev[linha.key],
                          data: value,
                        },
                      }))}
                    />
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Executor</span>
                      <select
                        value={destinos[linha.key]?.executorId ?? ''}
                        onChange={(event) => setDestinos((prev) => ({
                          ...prev,
                          [linha.key]: {
                            ...prev[linha.key],
                            executorId: event.target.value,
                          },
                        }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2"
                      >
                        <option value="">Sem executor</option>
                        {executores.map((executor) => (
                          <option key={executor.id} value={executor.id}>{executor.nome}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={() => void handleSalvarDestinos()} loading={salvandoDestinos}>
              Salvar destinos e liberar execução
            </Button>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Histórico</p>
              <h2 className="text-2xl font-semibold">Pagamentos</h2>
            </div>
            <div className="space-y-3">
              {pagamentos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>}
              {pagamentos.map((pagamento) => (
                <div key={pagamento.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{formatarMoeda(pagamento.valor)} · {pagamento.metodo}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatarDataHora(pagamento.created_at)}
                        {pagamento.recebido_por_nome ? ` · ${pagamento.recebido_por_nome}` : ''}
                      </p>
                    </div>
                    <span className={pagamento.cancelado ? 'text-error-600 text-sm' : 'text-success-600 text-sm'}>
                      {pagamento.cancelado ? 'Cancelado' : 'Ativo'}
                    </span>
                  </div>
                  {pagamento.observacoes && <p className="text-sm text-muted-foreground">{pagamento.observacoes}</p>}
                  {!pagamento.cancelado && (
                    cancelandoId === pagamento.id ? (
                      <div className="space-y-2">
                        <Input
                          label="Motivo do cancelamento"
                          name={`motivo-cancelamento-${pagamento.id}`}
                          value={motivoCancelamento}
                          onChange={setMotivoCancelamento}
                        />
                        <div className="flex gap-2">
                          <Button variant="danger" onClick={() => void handleCancelarPagamento(pagamento.id)}>
                            Confirmar cancelamento
                          </Button>
                          <Button variant="secondary" onClick={() => { setCancelandoId(null); setMotivoCancelamento(''); }}>
                            Fechar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="secondary" onClick={() => setCancelandoId(pagamento.id)}>
                        Cancelar pagamento
                      </Button>
                    )
                  )}
                  {pagamento.cancelado && pagamento.motivo_cancelamento && (
                    <p className="text-sm text-muted-foreground">Motivo: {pagamento.motivo_cancelamento}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
