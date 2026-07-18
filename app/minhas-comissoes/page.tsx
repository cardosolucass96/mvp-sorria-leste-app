'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { Banknote, DollarSign, Layers3, ListTree, ClipboardList, Users } from 'lucide-react';
import { PageHeader, Alert, StatCard, Badge, LoadingState, Table, Button, Input } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda, formatarData } from '@/lib/utils/formatters';
import { getClinicDateKey, getClinicMonthKey } from '@/lib/time';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Comissao {
  id: number;
  atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
  cliente_id: number;
  tipo: string;
  percentual: number;
  valor_base: number;
  valor_comissao: number;
  procedimento_nome: string;
  cliente_nome: string;
  created_at: string;
}

interface ComissoesData {
  comissoes: Comissao[];
  totais: {
    venda: number;
    execucao: number;
    geral: number;
  };
}

type PeriodoComissoes = 'hoje' | 'mes' | 'todos' | 'custom';
type ModoVisualizacao = 'procedimentos' | 'clientes';

interface ClienteAgrupado {
  cliente_nome: string;
  total_comissao: number;
  total_valor_base: number;
  quantidade: number;
  quantidade_venda: number;
  quantidade_execucao: number;
  comissoes: Comissao[];
}

export default function MinhasComissoesPage() {
  usePageTitle('Minhas Comissões');
  const { user } = useAuth();
  const unitFetch = useUnitFetch();
  const [dados, setDados] = useState<ComissoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>(() => getClinicDateKey());
  const [filtroDataFim, setFiltroDataFim] = useState<string>(() => getClinicDateKey());
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoComissoes>('hoje');
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacao>('clientes');

  const aplicarPeriodo = useCallback((periodo: Exclude<PeriodoComissoes, 'custom'>) => {
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

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('usuario_id', user!.id.toString());
      
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);

      const response = await unitFetch(`/api/comissoes?${params}`);
      const data = await response.json();
      setDados(data);
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
      setError('Erro ao carregar comissões');
    } finally {
      setLoading(false);
    }
  }, [filtroDataFim, filtroDataInicio, unitFetch, user]);

  useEffect(() => {
    if (user?.id) {
      void carregarDados();
    }
  }, [carregarDados, user?.id]);

  function handleChangeDataInicio(value: string) {
    setFiltroDataInicio(value);
    setPeriodoSelecionado('custom');
  }

  function handleChangeDataFim(value: string) {
    setFiltroDataFim(value);
    setPeriodoSelecionado('custom');
  }

  const columns: TableColumn<Comissao>[] = [
    { key: 'created_at', label: 'Data', render: (c) => formatarData(c.created_at) },
    { key: 'cliente_nome', label: 'Cliente' },
    { key: 'procedimento_nome', label: 'Procedimento' },
    {
      key: 'tipo', label: 'Tipo', align: 'center',
      render: (c) => (
        <Badge color={c.tipo === 'venda' ? 'green' : 'blue'} size="sm">
          {c.tipo === 'venda' ? 'Venda' : 'Execução'}
        </Badge>
      ),
    },
    { key: 'valor_base', label: 'Valor Base', align: 'right', render: (c) => formatarMoeda(c.valor_base) },
    { key: 'percentual', label: '%', align: 'right', render: (c) => `${c.percentual}%` },
    { key: 'valor_comissao', label: 'Comissão', align: 'right', render: (c) => <span className="font-semibold">{formatarMoeda(c.valor_comissao)}</span> },
  ];

  const comissoesAgrupadasPorCliente = useMemo<ClienteAgrupado[]>(() => {
    const grupos = new Map<string, ClienteAgrupado>();

    for (const comissao of dados?.comissoes ?? []) {
      const key = comissao.cliente_nome.trim() || 'Cliente não identificado';
      const atual = grupos.get(key) ?? {
        cliente_nome: key,
        total_comissao: 0,
        total_valor_base: 0,
        quantidade: 0,
        quantidade_venda: 0,
        quantidade_execucao: 0,
        comissoes: [],
      };

      atual.total_comissao += comissao.valor_comissao;
      atual.total_valor_base += comissao.valor_base;
      atual.quantidade += 1;
      atual.quantidade_venda += comissao.tipo === 'venda' ? 1 : 0;
      atual.quantidade_execucao += comissao.tipo === 'execucao' ? 1 : 0;
      atual.comissoes.push(comissao);

      grupos.set(key, atual);
    }

    return Array.from(grupos.values()).sort((a, b) => {
      if (b.total_comissao !== a.total_comissao) {
        return b.total_comissao - a.total_comissao;
      }
      return a.cliente_nome.localeCompare(b.cliente_nome, 'pt-BR');
    });
  }, [dados?.comissoes]);

  const procedimentosVendidos = useMemo(
    () => (dados?.comissoes ?? []).filter((comissao) => comissao.tipo === 'venda').length,
    [dados?.comissoes]
  );

  const totalVendas = useMemo(
    () => (dados?.comissoes ?? [])
      .filter((comissao) => comissao.tipo === 'venda')
      .reduce((total, comissao) => total + comissao.valor_base, 0),
    [dados?.comissoes]
  );

  const pacientesVendidos = useMemo(
    () => new Set(
      (dados?.comissoes ?? [])
        .filter((comissao) => comissao.tipo === 'venda')
        .map((comissao) => comissao.cliente_id)
    ).size,
    [dados?.comissoes]
  );

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader title="Minhas Comissões" icon={<Banknote className="w-7 h-7" />} />

      {/* Cards de Totais */}
      {dados && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={<Banknote className="w-6 h-6" />} label="Total de Vendas" value={formatarMoeda(totalVendas)} color="border-warning-500" />
          <StatCard icon={<DollarSign className="w-6 h-6" />} label="Comissão de Venda" value={formatarMoeda(dados.totais.venda)} color="border-success-500" />
          <StatCard icon={<ClipboardList className="w-6 h-6" />} label="Procedimentos Vendidos" value={procedimentosVendidos} color="border-info-500" />
          <StatCard icon={<Users className="w-6 h-6" />} label="Pacientes Vendidos" value={pacientesVendidos} color="border-primary/40" />
        </div>
      )}

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
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Visualização</p>
          <p className="text-xs text-muted-foreground">
            Altere entre a lista detalhada por procedimento e o agrupamento por cliente.
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
        <Table
          columns={columns}
          data={dados?.comissoes ?? []}
          keyExtractor={(c) => c.id}
          emptyMessage="Nenhuma comissão encontrada"
          caption="Minhas comissões por procedimento"
        />
      ) : comissoesAgrupadasPorCliente.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhuma comissão encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {comissoesAgrupadasPorCliente.map((grupo) => (
            <details
              key={grupo.cliente_nome}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              open
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{grupo.cliente_nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {grupo.quantidade} procedimento(s)
                    {grupo.quantidade_venda > 0 ? ` · ${grupo.quantidade_venda} venda` : ''}
                    {grupo.quantidade_execucao > 0 ? ` · ${grupo.quantidade_execucao} execução` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color="blue" size="sm">
                    Base {formatarMoeda(grupo.total_valor_base)}
                  </Badge>
                  <Badge color="green" size="sm">
                    Comissão {formatarMoeda(grupo.total_comissao)}
                  </Badge>
                </div>
              </summary>

              <div className="border-t border-border px-4 py-4">
                <Table
                  columns={columns.filter((col) => col.key !== 'cliente_nome')}
                  data={grupo.comissoes}
                  keyExtractor={(c) => c.id}
                  emptyMessage="Nenhuma comissão para este cliente"
                  caption={`Comissões do cliente ${grupo.cliente_nome}`}
                  className="border-0 shadow-none"
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
