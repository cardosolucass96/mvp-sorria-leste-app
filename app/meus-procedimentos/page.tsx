'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, Search, Activity, FileText, Layers3, ListTree } from 'lucide-react';
import { PageHeader, StatCard, Badge, LoadingState, Tabs, Alert, Table, Button, Input, Select } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { StatusBadge, ProntuarioDrawer } from '@/components/domain';
import { formatarData, formatarDentes, formatarMoeda } from '@/lib/utils/formatters';
import { getClinicDateKey, getClinicMonthKey, getStoredUtcInstantMillis } from '@/lib/time';
import usePageTitle from '@/lib/utils/usePageTitle';
interface Procedimento {
  id: number;
  item_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_id: number;
  cliente_nome: string;
  dentes: string | null;
  quantidade: number;
  status: string;
  tipo: 'avaliacao' | 'execucao';
  valor: number | null;
  valor_final: number | null;
  created_at: string;
  concluido_at: string | null;
}

type PeriodoProcedimentos = 'hoje' | 'mes' | 'todos' | 'custom';
type ModoVisualizacao = 'procedimentos' | 'clientes';

interface ClienteAgrupado {
  cliente_id: number;
  cliente_nome: string;
  quantidade: number;
  quantidade_avaliacao: number;
  quantidade_execucao: number;
  procedimentos: Procedimento[];
}

export default function MeusProcedimentosPage() {
  usePageTitle('Meus Procedimentos');
  const { user, hasRole } = useAuth();
  const unitFetch = useUnitFetch();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<string>('todos');
  const [drawerClienteId, setDrawerClienteId] = useState<number | null>(null);
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>(() => getClinicDateKey());
  const [filtroDataFim, setFiltroDataFim] = useState<string>(() => getClinicDateKey());
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoProcedimentos>('hoje');
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('clientes');
  const [filtroStatus, setFiltroStatus] = useState<string>('');

  const carregarProcedimentos = useCallback(async () => {
    if (!user) return;
    
    try {
      const res = await unitFetch(`/api/meus-procedimentos?usuario_id=${user.id}`);
      const data = await res.json();
      setProcedimentos(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
      setError('Erro ao carregar procedimentos');
    } finally {
      setLoading(false);
    }
  }, [user, unitFetch]);

  useEffect(() => {
    carregarProcedimentos();
  }, [carregarProcedimentos]);

  const aplicarPeriodo = useCallback((periodo: Exclude<PeriodoProcedimentos, 'custom'>) => {
    const hoje = getClinicDateKey();

    if (periodo === 'hoje') {
      setFiltroDataInicio(hoje);
      setFiltroDataFim(hoje);
      setPeriodoSelecionado('hoje');
      return;
    }

    if (periodo === 'todos') {
      setFiltroDataInicio('');
      setFiltroDataFim('');
      setPeriodoSelecionado('todos');
      return;
    }

    const inicioMes = `${getClinicMonthKey()}-01`;
    setFiltroDataInicio(inicioMes);
    setFiltroDataFim(hoje);
    setPeriodoSelecionado('mes');
  }, []);

  function handleChangeDataInicio(value: string) {
    setFiltroDataInicio(value);
    setPeriodoSelecionado('custom');
  }

  function handleChangeDataFim(value: string) {
    setFiltroDataFim(value);
    setPeriodoSelecionado('custom');
  }

  function isProcedimentoDentroDoPeriodo(procedimento: Procedimento) {
    const dataReferencia = procedimento.concluido_at || procedimento.created_at;
    const timestamp = getStoredUtcInstantMillis(dataReferencia);
    if (timestamp === null) return false;

    if (filtroDataInicio) {
      const inicio = getStoredUtcInstantMillis(`${filtroDataInicio}T00:00:00.000Z`);
      if (inicio !== null && timestamp < inicio) return false;
    }

    if (filtroDataFim) {
      const fim = getStoredUtcInstantMillis(`${filtroDataFim}T23:59:59.999Z`);
      if (fim !== null && timestamp > fim) return false;
    }

    return true;
  }

  const procedimentosFiltrados = procedimentos.filter((p) => {
    if (!isProcedimentoDentroDoPeriodo(p)) return false;
    if (filtroStatus && p.status !== filtroStatus) return false;
    if (filtro === 'todos') return true;
    return p.tipo === filtro;
  });

  const procedimentosAvaliados = procedimentosFiltrados.filter((p) => p.tipo === 'avaliacao');
  const totalAvaliados = procedimentosAvaliados.length;
  const totalAvaliacoesRealizadas = new Set(procedimentosAvaliados.map((p) => p.cliente_id)).size;
  const valorProcedimentosAvaliados = procedimentosAvaliados.reduce((total, procedimento) => (
    total + Number(procedimento.valor_final ?? procedimento.valor ?? 0)
  ), 0);
  const totalExecutados = procedimentosFiltrados.filter(p => p.tipo === 'execucao').length;

  const procedimentosAgrupadosPorCliente = useMemo<ClienteAgrupado[]>(() => {
    const grupos = new Map<number, ClienteAgrupado>();

    for (const procedimento of procedimentosFiltrados) {
      const atual = grupos.get(procedimento.cliente_id) ?? {
        cliente_id: procedimento.cliente_id,
        cliente_nome: procedimento.cliente_nome,
        quantidade: 0,
        quantidade_avaliacao: 0,
        quantidade_execucao: 0,
        procedimentos: [],
      };

      atual.quantidade += 1;
      atual.quantidade_avaliacao += procedimento.tipo === 'avaliacao' ? 1 : 0;
      atual.quantidade_execucao += procedimento.tipo === 'execucao' ? 1 : 0;
      atual.procedimentos.push(procedimento);

      grupos.set(procedimento.cliente_id, atual);
    }

    return Array.from(grupos.values()).sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      return a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR');
    });
  }, [procedimentosFiltrados]);

  const tabs = [
    { key: 'todos', label: 'Todos', count: procedimentosFiltrados.length },
    ...(hasRole(['avaliador', 'admin']) ? [{ key: 'avaliacao', label: 'Avaliações', count: totalAvaliacoesRealizadas }] : []),
    ...(hasRole(['executor', 'admin']) ? [{ key: 'execucao', label: 'Execuções', count: totalExecutados }] : []),
  ];

  if (loading) {
    return <LoadingState mode="spinner" text="Carregando..." />;
  }

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title="Meus Procedimentos"
        icon={<ClipboardList className="w-7 h-7" />}
        description="Histórico de procedimentos que você avaliou ou executou"
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {hasRole(['avaliador', 'admin']) ? (
          <>
            <StatCard
              icon={<ClipboardList className="w-6 h-6" />}
              label="Procedimentos Avaliados"
              value={totalAvaliados}
              color="border-info-400"
            />
            <StatCard
              icon={<FileText className="w-6 h-6" />}
              label="Valor em Procedimentos Avaliados"
              value={formatarMoeda(valorProcedimentosAvaliados)}
              color="border-primary/40"
            />
            <StatCard
              icon={<Search className="w-6 h-6" />}
              label="Avaliações Realizadas"
              value={totalAvaliacoesRealizadas}
              color="border-evaluation-500"
            />
          </>
        ) : (
          <StatCard
            icon={<ClipboardList className="w-6 h-6" />}
            label="Total de Procedimentos"
            value={procedimentosFiltrados.length}
            color="border-info-400"
          />
        )}

        {hasRole(['executor', 'admin']) && (
          <StatCard
            icon={<Activity className="w-6 h-6" />}
            label="Procedimentos Executados"
            value={totalExecutados}
            color="border-success-400"
          />
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={periodoSelecionado === 'hoje' ? 'primary' : 'secondary'}
            onClick={() => aplicarPeriodo('hoje')}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant={periodoSelecionado === 'mes' ? 'primary' : 'secondary'}
            onClick={() => aplicarPeriodo('mes')}
          >
            Deste mês
          </Button>
          <Button
            size="sm"
            variant={periodoSelecionado === 'todos' ? 'primary' : 'secondary'}
            onClick={() => aplicarPeriodo('todos')}
          >
            Todos
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-44">
            <Input
              label="Data início"
              name="dataInicio"
              type="date"
              value={filtroDataInicio}
              onChange={handleChangeDataInicio}
            />
          </div>
          <div className="w-44">
            <Input
              label="Data fim"
              name="dataFim"
              type="date"
              value={filtroDataFim}
              onChange={handleChangeDataFim}
            />
          </div>
          <div className="w-52">
            <Select
              label="Status"
              name="status"
              value={filtroStatus}
              onChange={setFiltroStatus}
              placeholder="Todos"
              options={[
                { value: 'pendente', label: 'Pendente' },
                { value: 'pago', label: 'Pago' },
                { value: 'executando', label: 'Executando' },
                { value: 'concluido', label: 'Concluído' },
              ]}
            />
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={filtro} onTabChange={setFiltro} variant="pills" />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Visualização</p>
          <p className="text-xs text-muted-foreground">
            Alterne entre a lista detalhada por procedimento e o agrupamento por cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={modoVisualizacao === 'clientes' ? 'primary' : 'secondary'}
            onClick={() => setModoVisualizacao('clientes')}
          >
            <Layers3 className="mr-2 h-4 w-4" />
            Por cliente
          </Button>
          <Button
            size="sm"
            variant={modoVisualizacao === 'procedimentos' ? 'primary' : 'secondary'}
            onClick={() => setModoVisualizacao('procedimentos')}
          >
            <ListTree className="mr-2 h-4 w-4" />
            Por procedimento
          </Button>
        </div>
      </div>

      {modoVisualizacao === 'procedimentos' ? (
        <Table<Procedimento>
          columns={[
            {
              key: 'procedimento',
              label: 'Procedimento',
              render: (proc) => (
                <div>
                  <div className="font-medium text-foreground">{proc.procedimento_nome}</div>
                  <div className="text-xs text-muted">Atendimento #{proc.atendimento_id}</div>
                </div>
              ),
            },
            {
              key: 'cliente',
              label: 'Paciente',
              render: (proc) => <span className="text-foreground">{proc.cliente_nome}</span>,
            },
            {
              key: 'tipo',
              label: 'Tipo',
              align: 'center',
              render: (proc) => proc.tipo === 'avaliacao'
                ? <Badge color="evaluation">Avaliação</Badge>
                : <Badge color="green">Execução</Badge>,
            },
            {
              key: 'dentes',
              label: 'Dentes',
              align: 'center',
              render: (proc) => proc.dentes
                ? <span className="text-primary-600 font-medium">{formatarDentes(proc.dentes)}</span>
                : <span className="text-muted-foreground">-</span>,
            },
            {
              key: 'status',
              label: 'Status',
              align: 'center',
              render: (proc) => <StatusBadge type="item" status={proc.status} showIcon />,
            },
            {
              key: 'data',
              label: 'Data',
              align: 'right',
              render: (proc) => <span className="text-sm text-muted">{formatarData(proc.concluido_at || proc.created_at)}</span>,
            },
            {
              key: 'acoes',
              label: '',
              align: 'right',
              render: (proc) => (
                <button
                  type="button"
                  onClick={() => setDrawerClienteId(proc.cliente_id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-md transition-colors"
                  title="Ver prontuário"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prontuário</span>
                </button>
              ),
            },
          ] as TableColumn<Procedimento>[]}
          data={procedimentosFiltrados}
          keyExtractor={(proc) => `${proc.tipo}-${proc.item_id}`}
          emptyMessage="Nenhum procedimento encontrado"
          emptyIcon="📭"
          caption="Meus procedimentos por procedimento"
        />
      ) : procedimentosAgrupadosPorCliente.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhum procedimento encontrado.
        </div>
      ) : (
        <div className="space-y-4">
          {procedimentosAgrupadosPorCliente.map((grupo) => (
            <details
              key={grupo.cliente_id}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              open
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{grupo.cliente_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {grupo.quantidade} procedimento(s)
                    {grupo.quantidade_avaliacao > 0 ? ` · ${grupo.quantidade_avaliacao} avaliação` : ''}
                    {grupo.quantidade_execucao > 0 ? ` · ${grupo.quantidade_execucao} execução` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.preventDefault();
                    setDrawerClienteId(grupo.cliente_id);
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Prontuário
                </Button>
              </summary>

              <div className="border-t border-border px-4 py-4">
                <Table<Procedimento>
                  columns={[
                    {
                      key: 'procedimento',
                      label: 'Procedimento',
                      render: (proc) => (
                        <div>
                          <div className="font-medium text-foreground">{proc.procedimento_nome}</div>
                          <div className="text-xs text-muted">Atendimento #{proc.atendimento_id}</div>
                        </div>
                      ),
                    },
                    {
                      key: 'tipo',
                      label: 'Tipo',
                      align: 'center',
                      render: (proc) => proc.tipo === 'avaliacao'
                        ? <Badge color="evaluation">Avaliação</Badge>
                        : <Badge color="green">Execução</Badge>,
                    },
                    {
                      key: 'dentes',
                      label: 'Dentes',
                      align: 'center',
                      render: (proc) => proc.dentes
                        ? <span className="text-primary-600 font-medium">{formatarDentes(proc.dentes)}</span>
                        : <span className="text-muted-foreground">-</span>,
                    },
                    {
                      key: 'status',
                      label: 'Status',
                      align: 'center',
                      render: (proc) => <StatusBadge type="item" status={proc.status} showIcon />,
                    },
                    {
                      key: 'data',
                      label: 'Data',
                      align: 'right',
                      render: (proc) => <span className="text-sm text-muted">{formatarData(proc.concluido_at || proc.created_at)}</span>,
                    },
                  ] as TableColumn<Procedimento>[]}
                  data={grupo.procedimentos}
                  keyExtractor={(proc) => `${proc.tipo}-${proc.item_id}`}
                  emptyMessage="Nenhum procedimento para este paciente"
                  caption={`Procedimentos do paciente ${grupo.cliente_nome}`}
                  className="border-0 shadow-none"
                />
              </div>
            </details>
          ))}
        </div>
      )}

      <ProntuarioDrawer
        clienteId={drawerClienteId}
        open={drawerClienteId !== null}
        onClose={() => setDrawerClienteId(null)}
      />
    </div>
  );
}
