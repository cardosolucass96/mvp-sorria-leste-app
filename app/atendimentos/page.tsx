'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import LoadingState from '@/components/ui/LoadingState';
import Alert from '@/components/ui/Alert';
import Table, { TableColumn } from '@/components/ui/Table';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { StatusBadge, ViewModeToggle } from '@/components/domain';
import { STATUS_CONFIG, STATUS_ORDER } from '@/lib/constants/status';
import { formatarDataHora } from '@/lib/utils/formatters';
import type { AtendimentoStatus } from '@/lib/types';

interface Atendimento {
  id: number;
  cliente_nome: string;
  cliente_telefone?: string;
  avaliador_nome?: string | null;
  status: AtendimentoStatus;
  created_at: string;
  total?: number;
  qtd_itens?: number;
}
import usePageTitle from '@/lib/utils/usePageTitle';

export default function AtendimentosPage() {
  usePageTitle('Atendimentos');
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>('kanban');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const carregarAtendimentos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (busca) params.append('busca', busca);
      if (filtroStatus) params.append('status', filtroStatus);
      
      const res = await fetch(`/api/atendimentos?${params}`);
      const data = await res.json();
      setAtendimentos(data);
    } catch (error) {
      console.error('Erro ao carregar atendimentos:', error);
      setError('Erro ao carregar atendimentos');
    } finally {
      setLoading(false);
    }
  }, [busca, filtroStatus]);

  useEffect(() => {
    carregarAtendimentos();
  }, [carregarAtendimentos]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    carregarAtendimentos();
  };

  const atendimentosPorStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = atendimentos.filter((a) => a.status === status);
    return acc;
  }, {} as Record<AtendimentoStatus, Atendimento[]>);

  const listaColumns: TableColumn<Atendimento>[] = [
    { key: 'id', label: 'ID', render: (a) => `#${a.id}` },
    {
      key: 'cliente', label: 'Cliente',
      render: (a) => (
        <div>
          <div className="font-medium text-foreground">{a.cliente_nome}</div>
          <div className="text-sm text-muted">{a.cliente_telefone}</div>
        </div>
      ),
    },
    { key: 'avaliador_nome', label: 'Avaliador', render: (a) => a.avaliador_nome || '-' },
    { key: 'status', label: 'Status', align: 'center', render: (a) => <StatusBadge status={a.status} type="atendimento" /> },
    { key: 'created_at', label: 'Criado em', render: (a) => formatarDataHora(a.created_at) },
    { key: 'acoes', label: 'Ações', align: 'right', render: (a) => <Link href={`/atendimentos/${a.id}`} className="text-info-600 hover:text-info-800 text-sm">Ver detalhes</Link> },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      <PageHeader
        title="Atendimentos"
        icon="📋"
        description="Pipeline de atendimentos"
        actions={
          <div className="flex gap-2">
            <ViewModeToggle
              options={[
                { key: 'kanban', label: 'Kanban' },
                { key: 'lista', label: 'Lista' },
              ]}
              active={viewMode}
              onChange={(key) => setViewMode(key as 'kanban' | 'lista')}
            />
            <Link href="/atendimentos/novo" className="btn btn-primary">
              + Novo Atendimento
            </Link>
          </div>
        }
      />

      {/* Busca e Filtros */}
      <div className="card">
        <form onSubmit={handleBuscar} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Buscar cliente"
              name="busca"
              value={busca}
              onChange={(value) => setBusca(value)}
              placeholder="Nome ou CPF do cliente..."
            />
          </div>
          {viewMode === 'lista' && (
            <div className="min-w-[180px]">
              <Select
                label="Status"
                name="filtroStatus"
                value={filtroStatus}
                onChange={(value) => setFiltroStatus(value)}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_CONFIG[s].label }))}
                placeholder="Todos"
              />
            </div>
          )}
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </div>

      {/* Kanban */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="flex-shrink-0 w-72 bg-surface-muted rounded-lg">
                <div className={`p-3 rounded-t-lg ${cfg.bgCor}`}>
                  <div className="flex justify-between items-center">
                    <h3 className={`font-semibold ${cfg.cor}`}>{cfg.label}</h3>
                    <span className={`text-sm px-2 py-0.5 rounded-full ${cfg.bgCor} ${cfg.cor}`}>
                      {atendimentosPorStatus[status].length}
                    </span>
                  </div>
                </div>
                <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {atendimentosPorStatus[status].length === 0 ? (
                    <div className="p-4 text-center text-neutral-400 text-sm">Nenhum atendimento</div>
                  ) : (
                    atendimentosPorStatus[status].map((atendimento) => (
                      <Link key={atendimento.id} href={`/atendimentos/${atendimento.id}`}
                        className="block bg-surface rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow border border-neutral-200">
                        <div className="font-medium text-foreground mb-1">{atendimento.cliente_nome}</div>
                        {atendimento.cliente_telefone && (
                          <div className="text-sm text-muted mb-2">📞 {atendimento.cliente_telefone}</div>
                        )}
                        <div className="flex justify-between items-center text-xs text-neutral-400">
                          <span>#{atendimento.id}</span>
                          <span>{formatarDataHora(atendimento.created_at).split(' ')[0]}</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista */}
      {viewMode === 'lista' && (
        <Table
          columns={listaColumns}
          data={atendimentos}
          keyExtractor={(a) => a.id}
          emptyMessage="Nenhum atendimento encontrado"
          caption="Atendimentos"
        />
      )}

      <div className="text-sm text-muted">
        Total: {atendimentos.length} atendimento(s)
      </div>
    </div>
  );
}
