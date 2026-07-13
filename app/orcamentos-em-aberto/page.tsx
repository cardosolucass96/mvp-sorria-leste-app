'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CalendarPlus2,
  ClipboardList,
  FileText,
  MessageCircle,
  Search,
  Wallet,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora, formatarMoeda, formatarTelefone } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

type SituacaoAgendamento = 'sem_agendamento' | 'agendamento_sem_data' | 'agendado_com_data';

interface SummaryResponse {
  valor_total_aberto: number;
  orcamentos_abertos: number;
  subprocedimentos_abertos: number;
  sem_agendamento: number;
  agendamento_sem_data: number;
  agendado_com_data: number;
}

interface SubprocedimentoItem {
  key: string;
  item_id: number | null;
  procedimento_id: number;
  procedimento_nome: string;
  etapa_modelo_id: number | null;
  etapa_label: string | null;
  valor_total: number;
  valor_pago: number;
  saldo_aberto: number;
  situacao_agendamento: SituacaoAgendamento;
  agendamento_id: number | null;
  agendamento_status: string | null;
  data_agendada: string | null;
  referencia_em: string;
}

interface OrcamentoGrupo {
  atendimento_id: number;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  orcamento_em: string;
  valor_total_aberto: number;
  subprocedimentos: SubprocedimentoItem[];
}

interface OrcamentosEmAbertoResponse {
  summary: SummaryResponse;
  items: OrcamentoGrupo[];
}

const SITUACAO_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'sem_agendamento', label: 'Sem agendamento' },
  { value: 'agendamento_sem_data', label: 'Agendamento sem data' },
  { value: 'agendado_com_data', label: 'Agendado com data' },
];

const SITUACAO_LABELS: Record<SituacaoAgendamento, string> = {
  sem_agendamento: 'Sem agendamento',
  agendamento_sem_data: 'Agendamento sem data',
  agendado_com_data: 'Agendado com data',
};

const SITUACAO_BADGE_COLORS: Record<SituacaoAgendamento, 'red' | 'amber' | 'green'> = {
  sem_agendamento: 'red',
  agendamento_sem_data: 'amber',
  agendado_com_data: 'green',
};

function buildVisibleSummary(items: OrcamentoGrupo[]): SummaryResponse {
  return items.reduce<SummaryResponse>((acc, group) => {
    acc.valor_total_aberto += group.valor_total_aberto;
    acc.orcamentos_abertos += 1;

    for (const subprocedimento of group.subprocedimentos) {
      acc.subprocedimentos_abertos += 1;
      if (subprocedimento.situacao_agendamento === 'sem_agendamento') {
        acc.sem_agendamento += 1;
      } else if (subprocedimento.situacao_agendamento === 'agendamento_sem_data') {
        acc.agendamento_sem_data += 1;
      } else {
        acc.agendado_com_data += 1;
      }
    }

    return acc;
  }, {
    valor_total_aberto: 0,
    orcamentos_abertos: 0,
    subprocedimentos_abertos: 0,
    sem_agendamento: 0,
    agendamento_sem_data: 0,
    agendado_com_data: 0,
  });
}

function getSubprocedimentoLabel(subprocedimento: SubprocedimentoItem) {
  return subprocedimento.etapa_label
    ? `${subprocedimento.procedimento_nome} — ${subprocedimento.etapa_label}`
    : subprocedimento.procedimento_nome;
}

export default function OrcamentosEmAbertoPage() {
  usePageTitle('Orçamentos em Aberto');
  const router = useRouter();
  const unitFetch = useUnitFetch();
  const { user, isLoading, hasRole } = useAuth();
  const canAccess = hasRole(['admin', 'atendente']);

  const [items, setItems] = useState<OrcamentoGrupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [situacaoFiltro, setSituacaoFiltro] = useState('');

  useEffect(() => {
    if (!isLoading && user && !canAccess) {
      router.replace('/agenda');
    }
  }, [canAccess, isLoading, router, user]);

  const carregarDados = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError('');

    try {
      const res = await unitFetch('/api/orcamentos-em-aberto');
      const data = await res.json() as OrcamentosEmAbertoResponse | { error?: string };
      if (!res.ok) {
        setError(
          !Array.isArray(data) && typeof data === 'object' && data !== null && 'error' in data
            ? data.error || 'Erro ao carregar orçamentos em aberto'
            : 'Erro ao carregar orçamentos em aberto'
        );
        return;
      }

      const response = data as OrcamentosEmAbertoResponse;
      setItems(response.items ?? []);
    } catch {
      setError('Erro ao carregar orçamentos em aberto');
    } finally {
      setLoading(false);
    }
  }, [canAccess, unitFetch]);

  useEffect(() => {
    if (!isLoading && user && canAccess) {
      void carregarDados();
    }
  }, [canAccess, carregarDados, isLoading, user]);

  const visibleItems = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return items
      .map((item) => {
        const subprocedimentos = item.subprocedimentos.filter((subprocedimento) => {
          if (situacaoFiltro && subprocedimento.situacao_agendamento !== situacaoFiltro) {
            return false;
          }

          if (!termo) {
            return true;
          }

          const tokens = [
            item.cliente_nome,
            subprocedimento.procedimento_nome,
            subprocedimento.etapa_label,
            SITUACAO_LABELS[subprocedimento.situacao_agendamento],
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return tokens.includes(termo);
        });

        if (subprocedimentos.length === 0) {
          return null;
        }

        return {
          ...item,
          subprocedimentos,
          valor_total_aberto: Number(
            subprocedimentos.reduce((total, subprocedimento) => total + subprocedimento.saldo_aberto, 0).toFixed(2)
          ),
        };
      })
      .filter((item): item is OrcamentoGrupo => item !== null);
  }, [busca, items, situacaoFiltro]);

  const visibleSummary = useMemo(
    () => buildVisibleSummary(visibleItems),
    [visibleItems]
  );

  function limparFiltros() {
    setBusca('');
    setSituacaoFiltro('');
  }

  function abrirCliente(clienteId: number) {
    router.push(`/clientes/${clienteId}`);
  }

  function abrirFollowup(clienteId: number) {
    const params = new URLSearchParams({
      open: '1',
      cliente_id: String(clienteId),
      tipo: 'orcamento',
    });
    router.push(`/followup?${params.toString()}`);
  }

  function abrirNovoAgendamento(grupo: OrcamentoGrupo, subprocedimento: SubprocedimentoItem) {
    if (!subprocedimento.item_id) return;

    const params = new URLSearchParams({
      open: '1',
      cliente_id: String(grupo.cliente_id),
      tipo: 'procedimento',
      procedimento_id: String(subprocedimento.procedimento_id),
      item_origem_id: String(subprocedimento.item_id),
      atendimento_origem_id: String(grupo.atendimento_id),
    });

    if (subprocedimento.etapa_modelo_id != null) {
      params.set('etapa_modelo_id', String(subprocedimento.etapa_modelo_id));
      if (subprocedimento.etapa_label) {
        params.set('etapa_label', subprocedimento.etapa_label);
      }
    }

    router.push(`/agenda?${params.toString()}`);
  }

  function editarAgendamento(agendamentoId: number) {
    router.push(`/agenda?edit=${agendamentoId}`);
  }

  if (isLoading || (loading && items.length === 0 && !error)) {
    return <LoadingState text="Carregando orçamentos em aberto..." />;
  }

  if (!user || !canAccess) {
    return <LoadingState text="Redirecionando..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <PageHeader
        title="Orçamentos em Aberto"
        description="Orçamentos gerados na avaliação com saldo pendente e próximo passo operacional."
        icon={<FileText className="w-7 h-7" />}
        actions={(
          <Button variant="outline" onClick={() => void carregarDados()}>
            Atualizar
          </Button>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet className="w-5 h-5" />}
          label="Valor em aberto"
          value={formatarMoeda(visibleSummary.valor_total_aberto)}
          color="border-primary/40"
        />
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="Orçamentos"
          value={visibleSummary.orcamentos_abertos}
          color="border-info-500/40"
          iconColor="text-info-600"
        />
        <StatCard
          icon={<ClipboardList className="w-5 h-5" />}
          label="Subprocedimentos"
          value={visibleSummary.subprocedimentos_abertos}
          color="border-warning-500/40"
          iconColor="text-warning-600"
        />
        <StatCard
          icon={<CalendarDays className="w-5 h-5" />}
          label="Sem agendamento"
          value={visibleSummary.sem_agendamento}
          color="border-error-500/40"
          iconColor="text-error-600"
        />
      </div>

      <FilterBar
        fields={[
          {
            type: 'text',
            name: 'busca',
            label: 'Busca',
            placeholder: 'Cliente, procedimento ou etapa',
          },
          {
            type: 'select',
            name: 'situacao',
            label: 'Situação',
            placeholder: 'Todos',
            options: SITUACAO_OPTIONS,
          },
        ]}
        values={{
          busca,
          situacao: situacaoFiltro,
        }}
        onChange={(name, value) => {
          if (name === 'busca') setBusca(value);
          if (name === 'situacao') setSituacaoFiltro(value);
        }}
        onClear={limparFiltros}
      />

      {visibleItems.length === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8" />}
          title="Nenhum orçamento em aberto encontrado"
          description="Ajuste os filtros ou aguarde novos orçamentos gerados na avaliação."
        />
      ) : (
        <div className="space-y-4">
          {visibleItems.map((item) => (
            <section
              key={item.atendimento_id}
              className="rounded-xl border border-border bg-card text-card-foreground shadow-sm"
            >
              <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">{item.cliente_nome}</h2>
                    <Badge color="orange">#{item.atendimento_id}</Badge>
                    <Badge color="gray">{item.subprocedimentos.length} subprocedimento(s)</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Telefone: {formatarTelefone(item.cliente_telefone)}</span>
                    <span>Orçamento em: {formatarDataHora(item.orcamento_em)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:min-w-[280px]">
                  <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total em aberto</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {formatarMoeda(item.valor_total_aberto)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => abrirCliente(item.cliente_id)}>
                      Abrir cliente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<MessageCircle className="w-4 h-4" />}
                      onClick={() => abrirFollowup(item.cliente_id)}
                    >
                      Abrir followup
                    </Button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border">
                {item.subprocedimentos.map((subprocedimento) => (
                  <div
                    key={subprocedimento.key}
                    className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          {getSubprocedimentoLabel(subprocedimento)}
                        </p>
                        <Badge color={SITUACAO_BADGE_COLORS[subprocedimento.situacao_agendamento]}>
                          {SITUACAO_LABELS[subprocedimento.situacao_agendamento]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Total: {formatarMoeda(subprocedimento.valor_total)}</span>
                        <span>Pago: {formatarMoeda(subprocedimento.valor_pago)}</span>
                        <span className="font-medium text-foreground">
                          Em aberto: {formatarMoeda(subprocedimento.saldo_aberto)}
                        </span>
                        <span>
                          {subprocedimento.data_agendada
                            ? `Data agendada: ${formatarDataHora(subprocedimento.data_agendada)}`
                            : 'Sem data agendada'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {subprocedimento.agendamento_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<CalendarDays className="w-4 h-4" />}
                          onClick={() => editarAgendamento(subprocedimento.agendamento_id!)}
                        >
                          Editar agendamento
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<CalendarPlus2 className="w-4 h-4" />}
                          onClick={() => abrirNovoAgendamento(item, subprocedimento)}
                          disabled={subprocedimento.item_id == null}
                        >
                          Novo agendamento
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
