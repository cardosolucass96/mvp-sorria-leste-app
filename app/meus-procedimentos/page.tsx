'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ClipboardList, Search, Activity } from 'lucide-react';
import { PageHeader, StatCard, Badge, LoadingState, Tabs, Alert, Table } from '@/components/ui';
import type { TableColumn } from '@/components/ui/Table';
import { StatusBadge } from '@/components/domain';
import { formatarData } from '@/lib/utils/formatters';
import usePageTitle from '@/lib/utils/usePageTitle';
interface Procedimento {
  id: number;
  item_id: number;
  atendimento_id: number;
  procedimento_nome: string;
  cliente_nome: string;
  dentes: string | null;
  quantidade: number;
  status: string;
  tipo: 'avaliacao' | 'execucao';
  created_at: string;
  concluido_at: string | null;
}

export default function MeusProcedimentosPage() {
  usePageTitle('Meus Procedimentos');
  const { user, hasRole } = useAuth();
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<string>('todos');

  const carregarProcedimentos = useCallback(async () => {
    if (!user) return;
    
    try {
      const res = await fetch(`/api/meus-procedimentos?usuario_id=${user.id}`);
      const data = await res.json();
      setProcedimentos(data);
    } catch (error) {
      console.error('Erro ao carregar procedimentos:', error);
      setError('Erro ao carregar procedimentos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    carregarProcedimentos();
  }, [carregarProcedimentos]);

  const formatarDentes = (dentes: string | null) => {
    if (!dentes) return null;
    try {
      const arr = JSON.parse(dentes);
      return arr.join(', ');
    } catch {
      return dentes;
    }
  };

  const procedimentosFiltrados = procedimentos.filter((p) => {
    if (filtro === 'todos') return true;
    return p.tipo === filtro;
  });

  const totalAvaliados = procedimentos.filter(p => p.tipo === 'avaliacao').length;
  const totalExecutados = procedimentos.filter(p => p.tipo === 'execucao').length;

  const tabs = [
    { key: 'todos', label: 'Todos', count: procedimentos.length },
    ...(hasRole(['avaliador', 'admin']) ? [{ key: 'avaliacao', label: 'Avaliações', count: totalAvaliados }] : []),
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<ClipboardList className="w-6 h-6" />}
          label="Total de Procedimentos"
          value={procedimentos.length}
          color="border-info-400"
        />
        
        {hasRole(['avaliador', 'admin']) && (
          <StatCard
            icon={<Search className="w-6 h-6" />}
            label="Avaliações Realizadas"
            value={totalAvaliados}
            color="border-evaluation-500"
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
      <Tabs tabs={tabs} activeTab={filtro} onTabChange={setFiltro} variant="pills" />

      {/* Lista de procedimentos */}
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
            render: (proc) => <span className="text-neutral-700">{proc.cliente_nome}</span>,
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
              : <span className="text-neutral-400">-</span>,
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
        data={procedimentosFiltrados}
        keyExtractor={(proc) => `${proc.tipo}-${proc.item_id}`}
        emptyMessage="Nenhum procedimento encontrado"
        emptyIcon="📭"
        caption="Meus procedimentos"
      />
    </div>
  );
}
