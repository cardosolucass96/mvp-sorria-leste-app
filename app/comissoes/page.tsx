'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import Tabs from '@/components/ui/Tabs';
import Table, { TableColumn } from '@/components/ui/Table';
import LoadingState from '@/components/ui/LoadingState';
import Button from '@/components/ui/Button';
import { formatarMoeda, formatarData } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';

interface ResumoComissao {
  usuario_id: number;
  usuario_nome: string;
  total_venda: number;
  total_execucao: number;
  total_geral: number;
  quantidade: number;
}

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

export default function ComissoesPage() {
  usePageTitle('Comissões');
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [resumo, setResumo] = useState<ResumoComissao[]>([]);
  const [detalhes, setDetalhes] = useState<ComissoesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'resumo' | 'detalhes'>('resumo');
  const [filtroUsuario, setFiltroUsuario] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  useEffect(() => {
    // Verificar permissão - admin real pode ver (mesmo em modo dentista)
    if (user && !isAdmin) {
      router.push('/meus-procedimentos');
      return;
    }
    carregarDados();
  }, [user, viewMode, filtroUsuario, filtroDataInicio, filtroDataFim]);

  async function carregarDados() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (filtroUsuario) params.append('usuario_id', filtroUsuario);
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);

      if (viewMode === 'resumo') {
        params.append('resumo', 'true');
        const response = await fetch(`/api/comissoes?${params}`);
        const data = await response.json();
        setResumo(data);
      } else {
        const response = await fetch(`/api/comissoes?${params}`);
        const data = await response.json();
        setDetalhes(data);
      }
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
    } finally {
      setLoading(false);
    }
  }

  function limparFiltros() {
    setFiltroUsuario('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
  }

  const resumoColumns: TableColumn<ResumoComissao>[] = [
    { key: 'usuario_nome', header: 'Usuário' },
    { key: 'total_venda', header: 'Comissão Venda', align: 'right', render: (r) => <span className="text-green-600">{formatarMoeda(r.total_venda)}</span> },
    { key: 'total_execucao', header: 'Comissão Execução', align: 'right', render: (r) => <span className="text-blue-600">{formatarMoeda(r.total_execucao)}</span> },
    { key: 'total_geral', header: 'Total', align: 'right', render: (r) => <span className="font-bold">{formatarMoeda(r.total_geral)}</span> },
    { key: 'quantidade', header: 'Qtd. Procedimentos', align: 'center' },
    {
      key: 'acoes', header: 'Ações', align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => { setFiltroUsuario(r.usuario_id.toString()); setViewMode('detalhes'); }}>
          Ver Detalhes
        </Button>
      ),
    },
  ];

  const detalheColumns: TableColumn<Comissao>[] = [
    { key: 'created_at', header: 'Data', render: (c) => formatarData(c.created_at) },
    { key: 'usuario_nome', header: 'Usuário' },
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
      <PageHeader title="Comissões" icon="💰" />

      {/* Tabs Resumo/Detalhes */}
      <Tabs
        tabs={[
          { key: 'resumo', label: 'Resumo' },
          { key: 'detalhes', label: 'Detalhes' },
        ]}
        activeTab={viewMode}
        onChange={(key) => setViewMode(key as 'resumo' | 'detalhes')}
      />

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

      {/* View Resumo */}
      {viewMode === 'resumo' && (
        <Table columns={resumoColumns} data={resumo} keyExtractor={(r) => r.usuario_id} emptyMessage="Nenhuma comissão encontrada" caption="Resumo de comissões" />
      )}

      {/* View Detalhes */}
      {viewMode === 'detalhes' && detalhes && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon="💵" label="Comissão de Venda" value={formatarMoeda(detalhes.totais.venda)} color="border-green-500" />
            <StatCard icon="🔧" label="Comissão de Execução" value={formatarMoeda(detalhes.totais.execucao)} color="border-blue-500" />
            <StatCard icon="💰" label="Total Geral" value={formatarMoeda(detalhes.totais.geral)} color="border-purple-500" />
          </div>
          <Table columns={detalheColumns} data={detalhes.comissoes} keyExtractor={(c) => c.id} emptyMessage="Nenhuma comissão encontrada" caption="Detalhes de comissões" />
        </>
      )}
    </div>
  );
}
