'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Banknote, DollarSign, Wrench } from 'lucide-react';
import { PageHeader, Alert, StatCard, Badge, Tabs, Table, LoadingState, Button, FilterBar } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
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
  const [error, setError] = useState('');
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
      setError('Erro ao carregar comissões');
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
    { key: 'usuario_nome', label: 'Usuário' },
    { key: 'total_venda', label: 'Comissão Venda', align: 'right', render: (r) => <span className="text-success-600">{formatarMoeda(r.total_venda)}</span> },
    { key: 'total_execucao', label: 'Comissão Execução', align: 'right', render: (r) => <span className="text-info-600">{formatarMoeda(r.total_execucao)}</span> },
    { key: 'total_geral', label: 'Total', align: 'right', render: (r) => <span className="font-bold">{formatarMoeda(r.total_geral)}</span> },
    { key: 'quantidade', label: 'Qtd. Procedimentos', align: 'center' },
    {
      key: 'acoes', label: 'Ações', align: 'center',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => { setFiltroUsuario(r.usuario_id.toString()); setViewMode('detalhes'); }}>
          Ver Detalhes
        </Button>
      ),
    },
  ];

  const detalheColumns: TableColumn<Comissao>[] = [
    { key: 'created_at', label: 'Data', render: (c) => formatarData(c.created_at) },
    { key: 'usuario_nome', label: 'Usuário' },
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

      <PageHeader title="Comissões" icon={<Banknote className="w-7 h-7" />} />

      {/* Tabs Resumo/Detalhes */}
      <Tabs
        tabs={[
          { key: 'resumo', label: 'Resumo' },
          { key: 'detalhes', label: 'Detalhes' },
        ]}
        activeTab={viewMode}
        onTabChange={(key) => setViewMode(key as 'resumo' | 'detalhes')}
      />

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

      {/* View Resumo */}
      {viewMode === 'resumo' && (
        <Table columns={resumoColumns} data={resumo} keyExtractor={(r) => r.usuario_id} emptyMessage="Nenhuma comissão encontrada" caption="Resumo de comissões" />
      )}

      {/* View Detalhes */}
      {viewMode === 'detalhes' && detalhes && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={<DollarSign className="w-6 h-6" />} label="Comissão de Venda" value={formatarMoeda(detalhes.totais.venda)} color="border-success-500" />
            <StatCard icon={<Wrench className="w-6 h-6" />} label="Comissão de Execução" value={formatarMoeda(detalhes.totais.execucao)} color="border-info-500" />
            <StatCard icon={<Banknote className="w-6 h-6" />} label="Total Geral" value={formatarMoeda(detalhes.totais.geral)} color="border-purple-500" />
          </div>
          <Table columns={detalheColumns} data={detalhes.comissoes} keyExtractor={(c) => c.id} emptyMessage="Nenhuma comissão encontrada" caption="Detalhes de comissões" />
        </>
      )}
    </div>
  );
}
