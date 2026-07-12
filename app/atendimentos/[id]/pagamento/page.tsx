'use client';

import React, { useEffect, useMemo, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora, formatarMoeda, nomeProcedimentoItem } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import usePageTitle from '@/lib/utils/usePageTitle';
import { apiFetch } from '@/lib/utils/apiFetch';
import { getExecutorDestinoInicial } from '@/lib/utils/destinoExecutor';
import { isExecutorDisponivel } from '@/lib/utils/usuariosProfissionais';
import { roundMoney } from '@/lib/helpers/pagamentoFlow';
import type { Usuario } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import Alert from '@/components/ui/Alert';
import LoadingState from '@/components/ui/LoadingState';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Divider,
  Input,
  Select,
  Textarea,
} from '@/components/ui';

type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'crediario' | 'afins_sorria';
type DestinoStatus = 'fazer_hoje' | 'agendar' | 'pago_sem_data' | 'nao_pago_sem_data';
type DestinoAcao = 'fazer_hoje' | 'agendar' | 'deixar_data_em_aberto';

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
  pagamento_grupo_id: number | null;
  valor: number;
  metodo: string;
  observacoes: string | null;
  recebido_por_nome?: string;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
}

interface PagamentoGrupo {
  id: string;
  pagamento_grupo_id: number | null;
  pagamento_representante_id: number;
  valor_total: number;
  observacoes: string | null;
  recebido_por_nome?: string | null;
  cancelado: number;
  motivo_cancelamento: string | null;
  created_at: string;
  formas: Pagamento[];
}

interface FormaPagamentoState {
  id: string;
  metodo: MetodoPagamento;
  valor: string;
}

interface Atendimento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  status: string;
  motivo_saida: string | null;
  itens: ItemAtendimento[];
  total: number;
  total_pago: number;
}

interface SelecionarHojeResponse {
  agendamentos_criados: number;
  itens_hoje: number;
  status_final: string;
}

interface ApiErrorResponse {
  error?: string;
}

interface LinhaCobranca {
  key: string;
  itemId: number;
  etapaModeloId: number | null;
  groupLabel: string;
  label: string;
  valor: number;
  valorPago: number;
  saldo: number;
  financeiroStatus: 'nao_pago' | 'parcial' | 'pago';
  destinoStatus: DestinoAcao;
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

const DESTINO_OPTIONS = [
  { value: 'agendar', label: 'Agendar' },
  { value: 'deixar_data_em_aberto', label: 'Deixar data em aberto' },
  { value: 'fazer_hoje', label: 'Fazer hoje' },
] as const;

function linhaKey(itemId: number, etapaModeloId: number | null) {
  return `${itemId}:${etapaModeloId ?? 'item'}`;
}

function getEtapaModeloId(etapaVirtualId: number, itemId: number) {
  return etapaVirtualId - itemId * 100000;
}

function parseValor(value: string) {
  return Number(value.replace(',', '.'));
}

function criarFormaPagamento(idSuffix: number): FormaPagamentoState {
  return {
    id: `forma-${idSuffix}`,
    metodo: 'pix',
    valor: '',
  };
}

function getMetodoLabel(metodo: string) {
  return METODOS_PAGAMENTO.find((item) => item.value === metodo)?.label ?? metodo;
}

function getFinanceiroBadge(status: LinhaCobranca['financeiroStatus'], saldo: number) {
  if (saldo <= 0 || status === 'pago') {
    return { color: 'green' as const, label: 'Pago' };
  }
  if (status === 'parcial') {
    return { color: 'amber' as const, label: 'Parcial' };
  }
  return { color: 'gray' as const, label: 'Pendente' };
}

function getOperacaoBadge(status: ItemAtendimento['status']) {
  if (status === 'pendente' || status === 'pago') {
    return null;
  }

  if (status === 'concluido') {
    return { color: 'blue' as const, label: 'Concluído' };
  }

  if (status === 'executando') {
    return { color: 'purple' as const, label: 'Em execução' };
  }

  return null;
}

function getResumoFinanceiroPartes(pago: number, pendente: number, pendenteLabel = 'Pendente') {
  const partes: string[] = [];
  if (pago > 0) {
    partes.push(`Pago ${formatarMoeda(pago)}`);
  }
  if (pendente > 0) {
    partes.push(`${pendenteLabel} ${formatarMoeda(pendente)}`);
  }
  return partes;
}

function getDestinoOptionsByLinha(linha: LinhaCobranca) {
  if (linha.saldo > 0) {
    return DESTINO_OPTIONS
      .filter((option) => option.value !== 'fazer_hoje')
      .map((option) => ({ value: option.value, label: option.label }));
  }

  return DESTINO_OPTIONS.map((option) => ({ value: option.value, label: option.label }));
}

function mapDestinoStatusParaAcao(destinoStatus: string | null | undefined, financeiroStatus: LinhaCobranca['financeiroStatus'], saldo: number): DestinoAcao {
  if (destinoStatus === 'fazer_hoje' || destinoStatus === 'agendar') return destinoStatus;
  if (destinoStatus === 'pago_sem_data' || destinoStatus === 'nao_pago_sem_data') {
    return 'deixar_data_em_aberto';
  }
  return saldo > 0 || financeiroStatus === 'nao_pago' || financeiroStatus === 'parcial' ? 'agendar' : 'fazer_hoje';
}

function getDestinoStatusSeguro(linha: LinhaCobranca, status: DestinoAcao): DestinoAcao {
  const options = getDestinoOptionsByLinha(linha);
  if (options.some((option) => option.value === status)) {
    return status;
  }
  return linha.saldo > 0 ? 'agendar' : 'fazer_hoje';
}

function mapAcaoParaDestinoStatus(linha: LinhaCobranca, acao: DestinoAcao): DestinoStatus {
  if (acao === 'deixar_data_em_aberto') {
    return linha.saldo > 0 ? 'nao_pago_sem_data' : 'pago_sem_data';
  }
  if (acao === 'agendar') return 'agendar';
  return 'fazer_hoje';
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
  const { currentUnidade } = useAuth();

  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoGrupo[]>([]);
  const [executores, setExecutores] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [salvandoDestinos, setSalvandoDestinos] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('pix');
  const [observacoesPagamento, setObservacoesPagamento] = useState('');
  const [multiplasFormas, setMultiplasFormas] = useState(false);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoState[]>([
    { id: 'forma-1', metodo: 'pix', valor: '' },
    { id: 'forma-2', metodo: 'cartao_credito', valor: '' },
  ]);
  const [selecoesPagamento, setSelecoesPagamento] = useState<Record<string, { selected: boolean }>>({});
  const [destinos, setDestinos] = useState<Record<string, { status: DestinoAcao; data: string; executorId: string }>>({});
  const [descontoEditando, setDescontoEditando] = useState<Record<number, { valor: string; motivo: string }>>({});
  const [descontosAbertos, setDescontosAbertos] = useState<Record<number, boolean>>({});
  const [valorSessaoEditando, setValorSessaoEditando] = useState<Record<string, string>>({});
  const [salvandoSessaoId, setSalvandoSessaoId] = useState<string | null>(null);
  const [errosSessao, setErrosSessao] = useState<Record<string, string>>({});

  const carregarExecutores = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (currentUnidade) {
        params.set('unidade_id', String(currentUnidade));
      }

      const res = await apiFetch(`/api/usuarios${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) return;
      const data: Usuario[] = await res.json();
      setExecutores(data.filter(isExecutorDisponivel));
    } catch {
      setExecutores([]);
    }
  }, [currentUnidade]);

  const carregarDados = useCallback(async () => {
    try {
      setLoading(true);
      const [resAtendimento, resPagamentos] = await Promise.all([
        unitFetch(`/api/atendimentos/${id}`),
        unitFetch(`/api/atendimentos/${id}/pagamentos?grouped=1`),
      ]);
      if (!resAtendimento.ok) throw new Error('Atendimento não encontrado');
      const atendimentoData: Atendimento = await resAtendimento.json();
      const pagamentosData: PagamentoGrupo[] = await resPagamentos.json();
      setAtendimento(atendimentoData);
      setPagamentos(Array.isArray(pagamentosData) ? pagamentosData : []);

      const novasSelecoes: Record<string, { selected: boolean }> = {};
      const novosDestinos: Record<string, { status: DestinoAcao; data: string; executorId: string }> = {};
      const novosDescontos: Record<number, { valor: string; motivo: string }> = {};

      for (const item of atendimentoData.itens) {
        const baseline = item.valor_original ?? item.valor_final ?? item.valor;
        novosDescontos[item.id] = {
          valor: String((item.desconto_valor ?? Math.max(0, baseline - (item.valor_final ?? item.valor))).toFixed(2)),
          motivo: item.desconto_motivo ?? '',
        };

        if ((item.etapas ?? []).length > 0) {
          for (const etapa of item.etapas ?? []) {
            const etapaModeloId = getEtapaModeloId(etapa.id, item.id);
            const key = linhaKey(item.id, etapaModeloId);
            const saldo = etapa.saldo ?? Math.max(0, (etapa.valor ?? 0) - (etapa.valor_pago ?? 0));
            novasSelecoes[key] = {
              selected: saldo > 0,
            };
            novosDestinos[key] = {
              status: mapDestinoStatusParaAcao(
                etapa.destino_status,
                etapa.financeiro_status ?? 'nao_pago',
                saldo
              ),
              data: etapa.data_agendada ?? '',
              executorId: getExecutorDestinoInicial(
                etapa.destino_status,
                etapa.executor_destino_id,
                item.executor_id
              ),
            };
          }
          continue;
        }

        const key = linhaKey(item.id, null);
        const saldo = item.saldo ?? Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago);
        novasSelecoes[key] = {
          selected: saldo > 0,
        };
        novosDestinos[key] = {
          status: mapDestinoStatusParaAcao(
            item.destino_status,
            item.financeiro_status ?? 'nao_pago',
            saldo
          ),
          data: item.destino_data_agendada ?? '',
          executorId: getExecutorDestinoInicial(
            item.destino_status,
            item.destino_executor_id,
            item.executor_id
          ),
        };
      }

      setSelecoesPagamento(novasSelecoes);
      setDestinos(novosDestinos);
      setDescontoEditando(novosDescontos);
      setValorSessaoEditando({});
      setErrosSessao({});
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar pagamento');
    } finally {
      setLoading(false);
    }
  }, [id, unitFetch]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  useEffect(() => {
    void carregarExecutores();
  }, [carregarExecutores]);

  const linhas = useMemo<LinhaCobranca[]>(() => {
    if (!atendimento) return [];
    const resultado: LinhaCobranca[] = [];
    for (const item of atendimento.itens) {
      if ((item.etapas ?? []).length > 0) {
        for (const etapa of item.etapas ?? []) {
          const etapaModeloId = getEtapaModeloId(etapa.id, item.id);
          const key = linhaKey(item.id, etapaModeloId);
          const saldo = etapa.saldo ?? Math.max(0, (etapa.valor ?? 0) - (etapa.valor_pago ?? 0));
          resultado.push({
            key,
            itemId: item.id,
            etapaModeloId,
            groupLabel: nomeProcedimentoItem(item),
            label: etapa.nome ?? 'Sessão',
            valor: etapa.valor ?? 0,
            valorPago: etapa.valor_pago ?? 0,
            saldo,
            financeiroStatus: etapa.financeiro_status ?? 'nao_pago',
            destinoStatus: destinos[key]?.status ?? (saldo > 0 ? 'agendar' : 'fazer_hoje'),
            dataAgendada: destinos[key]?.data ?? '',
            executorId: destinos[key]?.executorId ?? '',
          });
        }
        continue;
      }

      const key = linhaKey(item.id, null);
      const saldo = item.saldo ?? Math.max(0, (item.valor_final ?? item.valor) - item.valor_pago);
      resultado.push({
        key,
        itemId: item.id,
        etapaModeloId: null,
        groupLabel: nomeProcedimentoItem(item),
        label: nomeProcedimentoItem(item),
        valor: item.valor_final ?? item.valor,
        valorPago: item.valor_pago,
        saldo,
        financeiroStatus: item.financeiro_status ?? 'nao_pago',
        destinoStatus: destinos[key]?.status ?? (saldo > 0 ? 'agendar' : 'fazer_hoje'),
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
      return sum + linha.saldo;
    }, 0);
  }, [linhas, selecoesPagamento]);

  const totalFormasPagamento = useMemo(() => {
    return formasPagamento.reduce((sum, forma) => {
      const valor = parseValor(forma.valor || '0');
      return Number.isFinite(valor) ? sum + valor : sum;
    }, 0);
  }, [formasPagamento]);

  const formasPreenchidas = useMemo(() => {
    return formasPagamento.filter((forma) => parseValor(forma.valor || '0') > 0);
  }, [formasPagamento]);

  const linhasMap = useMemo(() => {
    return new Map(linhas.map((linha) => [linha.key, linha]));
  }, [linhas]);

  const linhasPorItem = useMemo(() => {
    const mapa = new Map<number, LinhaCobranca[]>();
    for (const linha of linhas) {
      const atual = mapa.get(linha.itemId) ?? [];
      atual.push(linha);
      mapa.set(linha.itemId, atual);
    }
    return mapa;
  }, [linhas]);

  const linhasSelecionadasCount = useMemo(() => {
    return Object.values(selecoesPagamento).filter((selecao) => selecao.selected).length;
  }, [selecoesPagamento]);

  const procedimentosSelecionadosCount = useMemo(() => {
    const itemIdsSelecionados = new Set<number>();

    for (const [key, selecao] of Object.entries(selecoesPagamento)) {
      if (!selecao.selected) continue;
      const linha = linhasMap.get(key);
      if (!linha) continue;
      itemIdsSelecionados.add(linha.itemId);
    }

    return itemIdsSelecionados.size;
  }, [linhasMap, selecoesPagamento]);

  const selecionouApenasSessoes = useMemo(() => {
    const linhasSelecionadas = Object.entries(selecoesPagamento)
      .filter(([, selecao]) => selecao.selected)
      .map(([key]) => linhasMap.get(key))
      .filter((linha): linha is LinhaCobranca => Boolean(linha));

    return linhasSelecionadas.length > 0 && linhasSelecionadas.every((linha) => linha.etapaModeloId !== null);
  }, [linhasMap, selecoesPagamento]);

  const itensPagamentoPendentes = useMemo(() => {
    if (!atendimento) return [];
    return atendimento.itens.filter((item) => {
      const itemLinhas = linhasPorItem.get(item.id) ?? [];
      return itemLinhas.some((linha) => linha.saldo > 0);
    });
  }, [atendimento, linhasPorItem]);

  const resumoDestinos = useMemo(() => {
    return linhas.reduce((acc, linha) => {
      const status = getDestinoStatusSeguro(
        linha,
        destinos[linha.key]?.status ?? (linha.saldo > 0 ? 'agendar' : 'fazer_hoje')
      );
      acc[status] += 1;
      return acc;
    }, {
      fazer_hoje: 0,
      agendar: 0,
      deixar_data_em_aberto: 0,
    });
  }, [destinos, linhas]);

  const executoresOptions = useMemo(() => {
    return executores.map((executor) => ({
      value: String(executor.id),
      label: executor.nome,
    }));
  }, [executores]);

  const handleSalvarDesconto = async (itemId: number) => {
    const dados = descontoEditando[itemId];
    const desconto = parseValor(dados.valor);
    if (!Number.isFinite(desconto) || desconto < 0) {
      setError('Desconto inválido');
      return;
    }

    const item = atendimento?.itens.find((atual) => atual.id === itemId);
    if (!item) return;

    const baseline = item.valor_original ?? item.valor_final ?? item.valor;
    const valorFinal = Number((baseline - desconto).toFixed(2));

    if (valorFinal < 0) {
      setError('O desconto não pode deixar o valor final negativo.');
      return;
    }

    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor_final: valorFinal, desconto_motivo: dados.motivo || null }),
      });
      if (!res.ok) {
        const data = await res.json() as ApiErrorResponse;
        throw new Error(data.error || 'Erro ao salvar desconto');
      }
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar desconto');
    }
  };

  const abrirEdicaoSessao = (linha: LinhaCobranca) => {
    setValorSessaoEditando((prev) => ({
      ...prev,
      [linha.key]: Number(linha.valor).toFixed(2),
    }));
    setErrosSessao((prev) => {
      const next = { ...prev };
      delete next[linha.key];
      return next;
    });
  };

  const cancelarEdicaoSessao = (linhaKey: string) => {
    setValorSessaoEditando((prev) => {
      const next = { ...prev };
      delete next[linhaKey];
      return next;
    });
    setErrosSessao((prev) => {
      const next = { ...prev };
      delete next[linhaKey];
      return next;
    });
  };

  const handleSalvarValorSessao = async (linha: LinhaCobranca) => {
    if (!atendimento) return;
    const valorTexto = valorSessaoEditando[linha.key];
    if (valorTexto === undefined) return;

    const valor = parseValor(valorTexto);
    if (!Number.isFinite(valor) || valor < 0) {
      setErrosSessao((prev) => ({ ...prev, [linha.key]: 'Valor da sessão inválido' }));
      return;
    }

    if (linha.etapaModeloId === null) {
      setErrosSessao((prev) => ({ ...prev, [linha.key]: 'Sessão sem etapa não pode ser editada aqui' }));
      return;
    }

    setSalvandoSessaoId(linha.key);
    setError('');
    try {
      const res = await unitFetch(`/api/atendimentos/${id}/itens/${linha.itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa_modelo_id: linha.etapaModeloId,
          etapa_valor: Number(valor.toFixed(2)),
        }),
      });
      if (!res.ok) {
        const data = await res.json() as ApiErrorResponse;
        throw new Error(data.error || 'Erro ao salvar valor da sessão');
      }
      cancelarEdicaoSessao(linha.key);
      await carregarDados();
    } catch (err) {
      setErrosSessao((prev) => ({
        ...prev,
        [linha.key]: err instanceof Error ? err.message : 'Erro ao salvar valor da sessão',
      }));
    } finally {
      setSalvandoSessaoId(null);
    }
  };

  const handleAdicionarForma = () => {
    setFormasPagamento((prev) => [...prev, criarFormaPagamento(prev.length + 1)]);
  };

  const handleRemoverForma = (formaId: string) => {
    setFormasPagamento((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((forma) => forma.id !== formaId);
    });
  };

  const handleRegistrarPagamento = async (event: React.FormEvent) => {
    event.preventDefault();
    const alocacoes: Array<{ item_id: number; etapa_modelo_id: number | null; valor: number }> = [];

    for (const [key, selecao] of Object.entries(selecoesPagamento)) {
      if (!selecao.selected) continue;
      const linha = linhasMap.get(key);
      if (!linha) continue;

      alocacoes.push({
        item_id: linha.itemId,
        etapa_modelo_id: linha.etapaModeloId,
        valor: linha.saldo,
      });
    }

    if (alocacoes.length === 0) {
      setError('Selecione ao menos um item ou sessão para cobrar');
      return;
    }

    setRegistrando(true);
    setError('');
    try {
      let payload: Record<string, unknown>;

      if (multiplasFormas) {
        if (formasPreenchidas.length === 0) {
          setError('Informe ao menos uma forma de pagamento.');
          setRegistrando(false);
          return;
        }

        if (formasPreenchidas.some((forma) => !Number.isFinite(parseValor(forma.valor)) || parseValor(forma.valor) <= 0)) {
          setError('Todas as formas de pagamento precisam ter valor maior que zero.');
          setRegistrando(false);
          return;
        }

        if (Math.abs(totalFormasPagamento - totalSelecionado) > 0.01) {
          setError('A soma das formas de pagamento precisa ser igual ao total selecionado.');
          setRegistrando(false);
          return;
        }

        payload = {
          valor_total: Number(totalSelecionado.toFixed(2)),
          observacoes: observacoesPagamento || null,
          alocacoes,
          formas: formasPreenchidas.map((forma) => ({
            metodo: forma.metodo,
            valor: Number(parseValor(forma.valor).toFixed(2)),
          })),
        };
      } else {
        const valorInformado = Number(totalSelecionado.toFixed(2));
        if (!Number.isFinite(valorInformado) || valorInformado <= 0) {
          setError('Selecione ao menos um valor para cobrar.');
          setRegistrando(false);
          return;
        }

        payload = {
          valor: valorInformado,
          metodo: metodoPagamento,
          observacoes: observacoesPagamento || null,
          alocacoes,
        };
      }

      const res = await unitFetch(`/api/atendimentos/${id}/pagamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json() as ApiErrorResponse;
        throw new Error(data.error || 'Erro ao registrar pagamento');
      }
      setObservacoesPagamento('');
      setMultiplasFormas(false);
      setFormasPagamento([
        { id: 'forma-1', metodo: 'pix', valor: '' },
        { id: 'forma-2', metodo: 'cartao_credito', valor: '' },
      ]);
      await carregarDados();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar pagamento');
    } finally {
      setRegistrando(false);
    }
  };

  const handleSalvarDestinos = async () => {
    if (!atendimento || atendimento.status !== 'aguardando_pagamento') return;
    for (const linha of linhas) {
      const statusAcao = getDestinoStatusSeguro(linha, destinos[linha.key]?.status ?? (linha.saldo > 0 ? 'agendar' : 'fazer_hoje'));
      if (statusAcao === 'agendar' && !destinos[linha.key]?.data?.trim()) {
        setError('A data futura é obrigatória para itens agendados.');
        return;
      }
    }

    const payload = linhas.map((linha) => ({
      item_id: linha.itemId,
      etapa_modelo_id: linha.etapaModeloId,
      destino_status: mapAcaoParaDestinoStatus(
        linha,
        getDestinoStatusSeguro(linha, destinos[linha.key]?.status ?? (linha.saldo > 0 ? 'agendar' : 'fazer_hoje'))
      ),
      data_agendada: destinos[linha.key]?.data || null,
      executor_id: destinos[linha.key]?.executorId ? Number(destinos[linha.key].executorId) : null,
    }));
    const acaoFinal = resumoDestinos.fazer_hoje > 0 ? 'liberar_execucao' : 'finalizar_continuacao';

    setSalvandoDestinos(true);
    setError('');
    try {
      const resSelecao = await unitFetch(`/api/atendimentos/${id}/selecionar-hoje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinos: payload, acao_final: acaoFinal }),
      });
      const dataSelecao = await resSelecao.json() as SelecionarHojeResponse | ApiErrorResponse;
      if (!resSelecao.ok) {
        const mensagemErro = 'error' in dataSelecao ? dataSelecao.error : undefined;
        throw new Error(mensagemErro || 'Erro ao salvar destinos');
      }

      const statusFinal = 'status_final' in dataSelecao ? dataSelecao.status_final : null;
      if (acaoFinal === 'finalizar_continuacao' || statusFinal === 'finalizado') {
        router.push(`/atendimentos/${id}`);
        return;
      }

      const resStatus = await unitFetch(`/api/atendimentos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'em_execucao' }),
      });
      if (!resStatus.ok) {
        const data = await resStatus.json() as ApiErrorResponse;
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
        const data = await res.json() as ApiErrorResponse;
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

  const modoSomenteHistorico = ['finalizado', 'encerrado'].includes(atendimento.status);
  const podeGerenciarDestinos = atendimento.status === 'aguardando_pagamento';
  const podeRegistrarCobranca = !modoSomenteHistorico;
  const temItensHojePlanejados = resumoDestinos.fazer_hoje > 0;
  const resumoFinanceiro = useMemo(() => {
    const total = roundMoney(atendimento.total);
    const pago = roundMoney(atendimento.total_pago);
    return {
      total,
      pago,
      pendente: roundMoney(Math.max(0, total - pago)),
    };
  }, [atendimento.total, atendimento.total_pago]);
  const descricaoCabecalho = modoSomenteHistorico
    ? 'Atendimento em revisão financeira. Consulte cobranças registradas e, se necessário, cancele o grupo com motivo.'
    : podeGerenciarDestinos
      ? 'Agrupe a cobrança por procedimento e defina o destino operacional antes de liberar a execução.'
      : 'Revise as cobranças do atendimento e registre ajustes financeiros, se necessário.';
  const labelAcaoDestinos = temItensHojePlanejados
    ? 'Salvar destinos e liberar execução'
    : 'Salvar destinos e finalizar atendimento';
  const mensagemModoHistorico = atendimento.motivo_saida === 'continuacao'
    ? 'Este atendimento foi finalizado como continuação/retorno. Os procedimentos seguiram para agenda ou ficaram sem data, e esta tela permanece apenas para revisão e cancelamento de cobranças.'
    : 'Este atendimento está em modo de revisão financeira. Novas cobranças e liberações operacionais ficam desativadas, mas o histórico e o cancelamento continuam disponíveis.';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href={`/atendimentos/${id}`} className="text-sm text-primary hover:text-primary-700">
          Voltar ao atendimento
        </Link>
      </div>

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <Card noPadding>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Atendimento #{atendimento.id}</p>
            <h1 className="text-3xl font-semibold">{atendimento.cliente_nome}</h1>
            <p className="text-sm text-muted-foreground">
              {descricaoCabecalho}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-semibold leading-tight text-foreground md:text-3xl">{formatarMoeda(resumoFinanceiro.total)}</p>
            </div>
            <div className="rounded-xl border border-border bg-success-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pago</p>
              <p className="mt-1 text-2xl font-semibold leading-tight text-success-600 md:text-3xl">
                {formatarMoeda(resumoFinanceiro.pago)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-warning-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendente</p>
              <p className="mt-1 text-2xl font-semibold leading-tight text-warning-600 md:text-3xl">
                {formatarMoeda(resumoFinanceiro.pendente)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {modoSomenteHistorico && (
        <Alert type="info">{mensagemModoHistorico}</Alert>
      )}

      {podeRegistrarCobranca && (
      <div className={cn('grid gap-6', podeGerenciarDestinos ? 'lg:grid-cols-2' : 'lg:grid-cols-1')}>
        <Card noPadding className="overflow-hidden">
          <CardHeader>
            <CardTitle>Pagamento</CardTitle>
            <CardDescription>
              Selecione o que entra nesta cobrança. O total soma automaticamente e o método vale para todos os itens confirmados agora.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-6">
            {itensPagamentoPendentes.length === 0 && (
              <div className="rounded-xl border border-border bg-success-500/10 p-6 text-sm text-success-600">
                Nenhum procedimento com pagamento pendente nesta etapa.
              </div>
            )}

            {itensPagamentoPendentes.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border border-border bg-background',
                  (linhasPorItem.get(item.id) ?? []).some((linha) => linha.saldo > 0 && selecoesPagamento[linha.key]?.selected) &&
                    'border-primary/35 bg-primary/5'
                )}
              >
                {(() => {
                  const itemLinhas = linhasPorItem.get(item.id) ?? [];
                  const linhasPendentes = itemLinhas.filter((linha) => linha.saldo > 0);
                  const linhaUnica = linhasPendentes.length === 1 ? linhasPendentes[0] : null;
                  const linhaUnicaSelecionada = linhaUnica ? (selecoesPagamento[linhaUnica.key]?.selected ?? false) : false;
                  const itemSaldo = linhasPendentes.reduce((sum, linha) => sum + linha.saldo, 0);
                  const linhasSelecionadas = linhasPendentes.filter((linha) => selecoesPagamento[linha.key]?.selected);
                  const valorSelecionadoItem = linhasPendentes.reduce((sum, linha) => {
                    const selecao = selecoesPagamento[linha.key];
                    if (!selecao?.selected) return sum;
                    return sum + linha.saldo;
                  }, 0);
                  const linhasQuitadas = itemLinhas.filter((linha) => linha.saldo <= 0).length;
                  const quantidadeVisualLinhas = item.etapas?.length ?? itemLinhas.length;
                  const itemBadge = getFinanceiroBadge(item.financeiro_status ?? 'nao_pago', itemSaldo);
                  const operacaoBadge = getOperacaoBadge(item.status);
                  const descontoDigitado = parseValor(descontoEditando[item.id]?.valor ?? '0');
                  const descontoPreview = Number.isFinite(descontoDigitado) ? descontoDigitado : 0;
                  const mostrarCheckboxCabecalho = !(item.etapas?.length === 1);
                  const resumoCabecalho = item.valor_final != null && item.valor_final !== item.valor
                    ? [`Final ${formatarMoeda(item.valor_final)}`]
                    : [];

                  return (
                    <div className="flex flex-col gap-4 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {linhaUnica ? (
                              mostrarCheckboxCabecalho ? (
                                <Checkbox
                                  label={nomeProcedimentoItem(item)}
                                  name={`selecionar-header-${linhaUnica.key}`}
                                  checked={linhaUnicaSelecionada}
                                  onChange={(checked) => setSelecoesPagamento((prev) => ({
                                    ...prev,
                                    [linhaUnica.key]: {
                                      selected: checked,
                                    },
                                  }))}
                                  hint={linhaUnica.valorPago > 0 ? `Pago ${formatarMoeda(linhaUnica.valorPago)}` : undefined}
                                />
                              ) : (
                                <p className="font-semibold">{nomeProcedimentoItem(item)}</p>
                              )
                            ) : (
                              <p className="font-semibold">{nomeProcedimentoItem(item)}</p>
                            )}
                            <Badge color={itemBadge.color} size="sm">{itemBadge.label}</Badge>
                            {operacaoBadge && (
                              <Badge color={operacaoBadge.color} size="sm">{operacaoBadge.label}</Badge>
                            )}
                            {item.desconto_valor > 0 && (
                              <Badge color="orange" size="sm">Desconto {formatarMoeda(item.desconto_valor)}</Badge>
                            )}
                            {itemLinhas.length > 1 && linhasQuitadas > 0 && (
                              <Badge color="gray" size="sm">
                                {item.etapas?.length
                                  ? `${linhasQuitadas}/${quantidadeVisualLinhas} sessões cobertas`
                                  : `${linhasQuitadas}/${quantidadeVisualLinhas} linhas já cobertas`}
                              </Badge>
                            )}
                            {itemLinhas.length > 1 && linhasQuitadas === 0 && (
                              <Badge color="gray" size="sm">
                                {item.etapas?.length ? `${quantidadeVisualLinhas} sessões` : `${quantidadeVisualLinhas} linhas`}
                              </Badge>
                            )}
                          </div>
                          {resumoCabecalho.length > 0 && (
                            <p className="text-sm text-muted-foreground">{resumoCabecalho.join(' · ')}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <div className="flex items-center gap-2 justify-end flex-nowrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="h-7 flex-shrink-0 px-2 py-1"
                              onClick={() => setDescontosAbertos((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                            >
                              Desconto
                            </Button>
                            <p
                              className={cn(
                                'text-xl font-semibold',
                                linhaUnica && !linhaUnicaSelecionada ? 'text-muted-foreground' : 'text-foreground'
                              )}
                            >
                              {formatarMoeda(valorSelecionadoItem > 0 ? valorSelecionadoItem : itemSaldo)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {item.desconto_valor > 0 && !descontosAbertos[item.id] && (
                              <p className="text-sm text-muted-foreground">
                                Desconto aplicado: {formatarMoeda(item.desconto_valor)}
                              </p>
                            )}
                            {linhasPendentes.length > 1 && (
                              <p className="text-sm text-muted-foreground">
                                {item.etapas?.length
                                  ? `${linhasSelecionadas.length}/${linhasPendentes.length} sessao(oes) selecionada(s)`
                                  : `${linhasSelecionadas.length}/${linhasPendentes.length} linha(s) selecionada(s)`}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {descontosAbertos[item.id] && (
                        <div className="grid gap-3 rounded-xl border border-border bg-background p-4 md:grid-cols-[1fr_1fr_180px]">
                          <Input
                            label="Desconto (R$)"
                            name={`desconto-valor-${item.id}`}
                            value={descontoEditando[item.id]?.valor ?? ''}
                            onChange={(value) => setDescontoEditando((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], valor: value },
                            }))}
                            hint={`Valor final: ${formatarMoeda(Math.max(0, (item.valor_original ?? item.valor_final ?? item.valor) - descontoPreview))}`}
                          />
                          <Input
                            label="Motivo do desconto"
                            name={`desconto-motivo-${item.id}`}
                            value={descontoEditando[item.id]?.motivo ?? ''}
                            onChange={(value) => setDescontoEditando((prev) => ({
                              ...prev,
                              [item.id]: { ...prev[item.id], motivo: value },
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
                        </div>
                      )}

                      {item.etapas?.length ? (
                        <div className="flex flex-col gap-2">
                          {linhasPendentes.map((linha) => {
                            const selecionado = selecoesPagamento[linha.key]?.selected ?? false;
                            const financeiroBadge = getFinanceiroBadge(linha.financeiroStatus, linha.saldo);
                            const resumoLinha = linha.valorPago > 0 ? [`Pago ${formatarMoeda(linha.valorPago)}`] : [];
                            const editandoSessao = valorSessaoEditando[linha.key] !== undefined;

                            return (
                              <div
                                key={linha.key}
                                className={cn(
                                  'rounded-xl border p-3',
                                  selecionado && 'border-primary/30 bg-background'
                                )}
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                  <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <Checkbox
                                      label={linhasPendentes.length > 1 ? linha.label : 'Selecionar'}
                                      name={`selecionar-${linha.key}`}
                                      checked={selecionado}
                                      onChange={(checked) => setSelecoesPagamento((prev) => ({
                                      ...prev,
                                      [linha.key]: {
                                        selected: checked,
                                      },
                                        }))}
                                      hint={[...resumoLinha].filter(Boolean).join(' · ')}
                                    />

                                    {!linhaUnica && (
                                      <div className="pt-1">
                                        <Badge color={financeiroBadge.color} size="sm">{financeiroBadge.label}</Badge>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 md:justify-end">
                                    {editandoSessao ? (
                                      <div className="flex w-full flex-col gap-2 md:w-auto">
                                        <Input
                                          label="Valor da sessão"
                                          name={`valor-sessao-${linha.key}`}
                                          value={valorSessaoEditando[linha.key] ?? ''}
                                          onChange={(value) => setValorSessaoEditando((prev) => ({
                                            ...prev,
                                            [linha.key]: value,
                                          }))}
                                          disabled={salvandoSessaoId === linha.key}
                                        />
                                        {errosSessao[linha.key] && (
                                          <p className="text-xs text-error-600">{errosSessao[linha.key]}</p>
                                        )}
                                        <div className="flex gap-2">
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            className="min-w-[80px] flex-1 md:max-w-[120px]"
                                            onClick={() => void handleSalvarValorSessao(linha)}
                                            loading={salvandoSessaoId === linha.key}
                                          >
                                            Salvar
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="secondary"
                                            className="min-w-[80px] flex-1 md:max-w-[120px]"
                                            onClick={() => cancelarEdicaoSessao(linha.key)}
                                            disabled={salvandoSessaoId === linha.key}
                                          >
                                            Fechar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="xs"
                                          className="h-auto px-2 py-1"
                                          onClick={() => abrirEdicaoSessao(linha)}
                                          title="Clique para editar valor da sessão"
                                        >
                                          Editar
                                        </Button>
                                        <p className={cn(
                                          'text-lg font-semibold',
                                          selecionado ? 'text-foreground' : 'text-muted-foreground'
                                        )}>
                                          {formatarMoeda(linha.saldo)}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ))}
          </CardContent>

          <Divider className="my-0" />

          <CardFooter className="flex-col items-stretch gap-4 p-6 pt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {procedimentosSelecionadosCount} procedimento(s) selecionado(s)
                {linhasSelecionadasCount !== procedimentosSelecionadosCount
                  ? ` · ${linhasSelecionadasCount} ${selecionouApenasSessoes ? 'sessões' : 'linhas'}`
                  : ''}
              </span>
              <span className="text-2xl font-bold text-foreground">{formatarMoeda(totalSelecionado)}</span>
            </div>

            <form onSubmit={handleRegistrarPagamento} className="flex flex-col gap-4">
              {!multiplasFormas ? (
                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                  <Select
                    label="Forma de pagamento"
                    name="metodo_pagamento"
                    options={METODOS_PAGAMENTO}
                    value={metodoPagamento}
                    onChange={(value) => setMetodoPagamento(value as MetodoPagamento)}
                  />
                  <Input
                    label="Observações"
                    name="observacoes_pagamento"
                    value={observacoesPagamento}
                    onChange={setObservacoesPagamento}
                    placeholder="Ex: entrada do tratamento"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Mais de uma forma de pagamento</p>
                      <p className="text-sm text-muted-foreground">
                        Divida o total selecionado em quantas formas precisar. A soma precisa fechar exatamente.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={handleAdicionarForma}>
                      Adicionar forma
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    {formasPagamento.map((forma, index) => (
                      <div key={forma.id} className="grid gap-3 rounded-xl border border-border bg-background p-3 md:col-span-2 md:grid-cols-[minmax(0,1fr)_180px_120px]">
                        <Select
                          label={`Forma ${index + 1}`}
                          name={`forma-metodo-${forma.id}`}
                          options={METODOS_PAGAMENTO}
                          value={forma.metodo}
                          onChange={(value) => setFormasPagamento((prev) => prev.map((atual) => (
                            atual.id === forma.id ? { ...atual, metodo: value as MetodoPagamento } : atual
                          )))}
                        />
                        <Input
                          label="Valor"
                          name={`forma-valor-${forma.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={forma.valor}
                          onChange={(value) => setFormasPagamento((prev) => prev.map((atual) => (
                            atual.id === forma.id ? { ...atual, valor: value } : atual
                          )))}
                          placeholder="0,00"
                        />
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => handleRemoverForma(forma.id)}
                            disabled={formasPagamento.length <= 2}
                          >
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                    <Textarea
                      label="Observações da cobrança"
                      name="observacoes_pagamento_composto"
                      value={observacoesPagamento}
                      onChange={setObservacoesPagamento}
                      placeholder="Ex: parte no PIX, parte no cartão"
                      rows={3}
                    />
                    <div className="rounded-xl border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Fechamento</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Total selecionado</span>
                          <span className="font-semibold">{formatarMoeda(totalSelecionado)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Soma das formas</span>
                          <span className={cn('font-semibold', Math.abs(totalFormasPagamento - totalSelecionado) <= 0.01 ? 'text-success-600' : 'text-warning-600')}>
                            {formatarMoeda(totalFormasPagamento)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">
                  Precisa dividir em mais de uma forma?
                </p>
                <button
                  type="button"
                  className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  onClick={() => setMultiplasFormas((prev) => !prev)}
                >
                  {multiplasFormas ? 'Usar uma forma só' : 'Abrir divisão'}
                </button>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  {multiplasFormas
                    ? 'A confirmação só libera quando a soma das formas bater exatamente com o total selecionado.'
                    : 'O método escolhido vale para todos os itens desta cobrança.'}
                </p>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={registrando}
                  disabled={
                    totalSelecionado <= 0 ||
                    (multiplasFormas && Math.abs(totalFormasPagamento - totalSelecionado) > 0.01)
                  }
                >
                  Confirmar pagamento
                </Button>
              </div>
            </form>
          </CardFooter>
        </Card>

        {podeGerenciarDestinos && (
        <Card noPadding className="overflow-hidden">
          <CardHeader>
            <CardTitle>Destino</CardTitle>
            <CardDescription>
              Defina o destino de cada item.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 pt-6">
            {atendimento.itens.map((item) => (
              <div key={`destino-${item.id}`} className="rounded-xl border border-border bg-background">
                {(() => {
                  const itemLinhas = linhasPorItem.get(item.id) ?? [];
                  const saldoItem = itemLinhas.reduce((sum, linha) => sum + linha.saldo, 0);
                  const quantidadeVisualLinhas = item.etapas?.length ?? itemLinhas.length;
                  const linhaUnica = itemLinhas.length === 1;
                  const financeiroItemBadge = getFinanceiroBadge(item.financeiro_status ?? 'nao_pago', saldoItem);
                  const operacaoItemBadge = getOperacaoBadge(item.status);
                  const resumoFinanceiroItem = getResumoFinanceiroPartes(item.valor_pago, saldoItem);

                  return (
                    <div className="flex flex-col gap-4 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{nomeProcedimentoItem(item)}</p>
                          <Badge color={financeiroItemBadge.color} size="sm">{financeiroItemBadge.label}</Badge>
                          {operacaoItemBadge && (
                            <Badge color={operacaoItemBadge.color} size="sm">{operacaoItemBadge.label}</Badge>
                          )}
                          {itemLinhas.length > 1 && (
                            <Badge color="gray" size="sm">
                              {item.etapas?.length ? `${quantidadeVisualLinhas} sessões` : `${quantidadeVisualLinhas} linhas`}
                            </Badge>
                          )}
                        </div>
                        {resumoFinanceiroItem.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {resumoFinanceiroItem.join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        {itemLinhas.map((linha) => {
                          const statusSeguro = getDestinoStatusSeguro(linha, destinos[linha.key]?.status ?? (linha.saldo > 0 ? 'agendar' : 'fazer_hoje'));
                          const mostrarData = statusSeguro === 'agendar';
                          const mostrarExecutor = ['fazer_hoje', 'agendar'].includes(statusSeguro);
                          const financeiroBadge = getFinanceiroBadge(linha.financeiroStatus, linha.saldo);
                          const executorValue = destinos[linha.key]?.executorId ?? '';

                          return (
                            <div key={linha.key} className="rounded-xl border border-border p-3">
                              <div className="flex flex-col gap-3">
                                    {!linhaUnica && (
                                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div className="flex flex-col gap-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge color={financeiroBadge.color} size="sm">{financeiroBadge.label}</Badge>
                                            <p className="font-medium">{linha.label}</p>
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {formatarMoeda(linha.valor)}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                <div className={cn(
                                  'grid gap-3',
                                  mostrarData && mostrarExecutor
                                    ? 'md:grid-cols-3'
                                    : mostrarData || mostrarExecutor
                                      ? 'md:grid-cols-2'
                                      : 'md:grid-cols-1'
                                )}>
                                      <Select
                                        label="Destino"
                                        name={`destino-${linha.key}`}
                                        options={getDestinoOptionsByLinha(linha)}
                                        value={statusSeguro}
                                        onChange={(value) => setDestinos((prev) => ({
                                          ...prev,
                                          [linha.key]: {
                                            ...prev[linha.key],
                                        status: value as DestinoAcao,
                                      },
                                    }))}
                                  />

                                  {mostrarData && (
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
                                  )}

                                  {mostrarExecutor && (
                                    <Select
                                      label="Executor"
                                      name={`executor-${linha.key}`}
                                      options={executoresOptions}
                                      value={executorValue}
                                      onChange={(value) => setDestinos((prev) => ({
                                        ...prev,
                                        [linha.key]: {
                                          ...prev[linha.key],
                                          executorId: value,
                                        },
                                      }))}
                                      placeholder="Sem executor"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </CardContent>

          <Divider className="my-0" />

          <CardFooter className="flex-col items-stretch gap-4 p-6 pt-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">Fazer hoje</p>
              <p className="mt-1 font-semibold">{resumoDestinos.fazer_hoje}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">Agendar</p>
              <p className="mt-1 font-semibold">{resumoDestinos.agendar}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <p className="text-muted-foreground">Sem data</p>
                <p className="mt-1 font-semibold">{resumoDestinos.deixar_data_em_aberto}</p>
              </div>
            </div>

            <Button className="w-full" onClick={() => void handleSalvarDestinos()} loading={salvandoDestinos}>
              {labelAcaoDestinos}
            </Button>
          </CardFooter>
        </Card>
        )}
      </div>
      )}

      <Card noPadding>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Histórico</p>
            <CardTitle>Pagamentos registrados</CardTitle>
            <CardDescription>
              Revise as cobranças já feitas e, se necessário, cancele o grupo inteiro.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 pt-0">
          {pagamentos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>}
          {pagamentos.map((pagamento) => (
            <div key={pagamento.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{formatarMoeda(pagamento.valor_total)}</p>
                    <Badge color={pagamento.cancelado ? 'red' : 'green'} size="sm">
                      {pagamento.cancelado ? 'Cancelado' : pagamento.formas.length > 1 ? 'Cobrança composta' : getMetodoLabel(pagamento.formas[0]?.metodo ?? '')}
                    </Badge>
                    {pagamento.formas.length > 1 && (
                      <Badge color="gray" size="sm">{pagamento.formas.length} formas</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatarDataHora(pagamento.created_at)}
                    {pagamento.recebido_por_nome ? ` · ${pagamento.recebido_por_nome}` : ''}
                  </p>
                </div>
                <Badge color={pagamento.cancelado ? 'red' : 'green'} size="sm">
                  {pagamento.cancelado ? 'Inativo' : 'Ativo'}
                </Badge>
              </div>

              {pagamento.formas.length > 0 && (
                <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3">
                  {pagamento.formas.map((forma) => (
                    <div key={forma.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color={forma.cancelado ? 'red' : 'gray'} size="sm">
                          {getMetodoLabel(forma.metodo)}
                        </Badge>
                        <span className="text-muted-foreground">{formatarDataHora(forma.created_at)}</span>
                      </div>
                      <span className="font-medium">{formatarMoeda(forma.valor)}</span>
                    </div>
                  ))}
                </div>
              )}

              {pagamento.observacoes && <p className="text-sm text-muted-foreground">{pagamento.observacoes}</p>}
              {!pagamento.cancelado && (
                cancelandoId === pagamento.pagamento_representante_id ? (
                  <div className="space-y-2">
                    <Input
                      label="Motivo do cancelamento do grupo"
                      name={`motivo-cancelamento-${pagamento.pagamento_representante_id}`}
                      value={motivoCancelamento}
                      onChange={setMotivoCancelamento}
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => void handleCancelarPagamento(pagamento.pagamento_representante_id)}>
                        Confirmar cancelamento
                      </Button>
                      <Button variant="secondary" onClick={() => { setCancelandoId(null); setMotivoCancelamento(''); }}>
                        Fechar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setCancelandoId(pagamento.pagamento_representante_id)}>
                    Cancelar cobrança
                  </Button>
                )
              )}
              {Boolean(pagamento.cancelado) && pagamento.motivo_cancelamento && (
                <p className="text-sm text-muted-foreground">Motivo: {pagamento.motivo_cancelamento}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
