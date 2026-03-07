'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import LoadingState from '@/components/ui/LoadingState';
import EmptyState from '@/components/ui/EmptyState';
import Table, { TableColumn } from '@/components/ui/Table';
import Button from '@/components/ui/Button';
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
    } finally {
      setLoading(false);
    }
  }

  function limparFiltros() {
    setFiltroDataInicio('');
    setFiltroDataFim('');
  }

  const columns: TableColumn<Comissao>[] = [
    { key: 'created_at', header: 'Data', render: (c) => formatarData(c.created_at) },
    { key: 'cliente_nome', header: 'Cliente' },
    { key: 'procedimento_nome', header: 'Procedimento' },
    {
      key: 'tipo', header: 'Tipo', align: 'center',
      render: (c) => (
        <Badge color={c.tipo === 'venda' ? 'green' : 'blue'} size="sm">
          {c.tipo === 'venda' ? 'Venda' : 'Execução'}
        </Badge>
      ),
    },
    { key: 'valor_base', header: 'Valor Base', align: 'right', render: (c) => formatarMoeda(c.valor_base) },
    { key: 'percentual', header: '%', align: 'right', render: (c) => `${c.percentual}%` },
    { key: 'valor_comissao', header: 'Comissão', align: 'right', render: (c) => <span className="font-semibold">{formatarMoeda(c.valor_comissao)}</span> },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader title="Minhas Comissões" icon="💰" />

      {/* Cards de Totais */}
      {dados && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon="💵" label="Comissão de Venda" value={formatarMoeda(dados.totais.venda)} color="border-green-500" />
          <StatCard icon="🔧" label="Comissão de Execução" value={formatarMoeda(dados.totais.execucao)} color="border-blue-500" />
          <StatCard icon="💰" label="Total Geral" value={formatarMoeda(dados.totais.geral)} color="border-purple-500" />
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="font-semibold mb-3">Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Data Início</label>
            <input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data Fim</label>
            <input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2" />
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={limparFiltros}>Limpar Filtros</Button>
          </div>
        </div>
      </div>

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
