'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Banknote, DollarSign } from 'lucide-react';
import { PageHeader, Alert, StatCard, Badge, LoadingState, Table, FilterBar } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { formatarMoeda, formatarData } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface Comissao {
  id: number;
  atendimento_id: number;
  usuario_id: number;
  usuario_nome: string;
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

export default function MinhasComissoesPage() {
  usePageTitle('Minhas Comissões');
  const { user } = useAuth();
  const [dados, setDados] = useState<ComissoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  useEffect(() => {
    if (user?.id) {
      carregarDados();
    }
  }, [user?.id, filtroDataInicio, filtroDataFim]);

  async function carregarDados() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('usuario_id', user!.id.toString());
      
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);

      const response = await fetch(`/api/comissoes?${params}`);
      const data = await response.json();
      setDados(data);
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
      setError('Erro ao carregar comissões');
    } finally {
      setLoading(false);
    }
  }

  function limparFiltros() {
    setFiltroDataInicio('');
    setFiltroDataFim('');
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

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader title="Minhas Comissões" icon={<Banknote className="w-7 h-7" />} />

      {/* Cards de Totais */}
      {dados && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard icon={<DollarSign className="w-6 h-6" />} label="Comissão de Venda" value={formatarMoeda(dados.totais.venda)} color="border-success-500" />
          <StatCard icon={<Banknote className="w-6 h-6" />} label="Total Geral" value={formatarMoeda(dados.totais.geral)} color="border-evaluation-500" />
        </div>
      )}

      {/* Filtros */}
      <FilterBar
        fields={[
          { type: 'date', name: 'dataInicio', label: 'Data Início' },
          { type: 'date', name: 'dataFim', label: 'Data Fim' },
        ]}
        values={{ dataInicio: filtroDataInicio, dataFim: filtroDataFim }}
        onChange={(name, value) => {
          if (name === 'dataInicio') setFiltroDataInicio(value);
          if (name === 'dataFim') setFiltroDataFim(value);
        }}
        onClear={limparFiltros}
      />

      {/* Lista de Comissões */}
      <Table
        columns={columns}
        data={dados?.comissoes ?? []}
        keyExtractor={(c) => c.id}
        emptyMessage="Nenhuma comissão encontrada"
        caption="Minhas comissões"
      />
    </div>
  );
}
