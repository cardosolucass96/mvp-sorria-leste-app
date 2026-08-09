'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardClock,
  ListChecks,
  Settings2,
} from 'lucide-react';
import { Alert, Badge, Button, FilterBar, LoadingState, PageHeader, StatCard, Table, Tabs } from '@/components/ui';
import type { BadgeProps, TableColumn } from '@/components/ui';
import { useUnitFetch } from '@/lib/hooks/useUnitFetch';
import { formatarDataHora, formatarMoeda } from '@/lib/utils/formatters';
import type { ProcedimentoClienteOperacional } from '@/lib/v2/types';
import usePageTitle from '@/lib/utils/usePageTitle';

type QueueKey =
  | 'aguardando_decisao'
  | 'aguardando_pagamento'
  | 'aguardando_agendamento'
  | 'agendados'
  | 'em_execucao'
  | 'executados_com_saldo'
  | 'concluidos';

type QueueCounts = Record<QueueKey, number>;

interface ProceduresResponse {
  items: ProcedimentoClienteOperacional[];
  total: number;
}

interface DashboardResponse {
  filas: QueueCounts | null;
}

const QUEUES: Array<{ key: QueueKey; label: string }> = [
  { key: 'aguardando_decisao', label: 'Aguardando decisão' },
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { key: 'aguardando_agendamento', label: 'Aguardando agendamento' },
  { key: 'agendados', label: 'Agendados' },
  { key: 'em_execucao', label: 'Em execução' },
  { key: 'executados_com_saldo', label: 'Executados com saldo' },
  { key: 'concluidos', label: 'Concluídos' },
];

const BADGE_COLORS: Record<string, BadgeProps['color']> = {
  proposto: 'amber',
  aceito: 'green',
  recusado: 'red',
  cancelado: 'gray',
  nao_pago: 'red',
  parcial: 'amber',
  quitado: 'green',
  estornado: 'gray',
  sem_agendamento: 'amber',
  agendado: 'blue',
  nao_iniciado: 'gray',
  em_execucao: 'purple',
  concluido: 'green',
};

const LABELS: Record<string, string> = {
  proposto: 'Proposto',
  aceito: 'Aceito',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  nao_pago: 'Não pago',
  parcial: 'Parcial',
  quitado: 'Quitado',
  estornado: 'Estornado',
  sem_agendamento: 'Sem agendamento',
  agendado: 'Agendado',
  nao_iniciado: 'Não iniciado',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
};

function StatusBadge({ status }: { status: string }) {
  return <Badge color={BADGE_COLORS[status] ?? 'gray'}>{LABELS[status] ?? status}</Badge>;
}

export default function CentralProcedimentos() {
  usePageTitle('Central de procedimentos');
  const unitFetch = useUnitFetch();
  const [activeQueue, setActiveQueue] = useState<QueueKey>('aguardando_decisao');
  const [items, setItems] = useState<ProcedimentoClienteOperacional[]>([]);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ fila: activeQueue, limit: '100' });
      if (search.trim()) params.set('busca', search.trim());
      const [proceduresResponse, dashboardResponse] = await Promise.all([
        unitFetch(`/api/v2/procedimentos?${params}`),
        unitFetch('/api/v2/dashboard'),
      ]);
      const procedures = await proceduresResponse.json() as ProceduresResponse & { error?: string };
      const dashboard = await dashboardResponse.json() as DashboardResponse & { error?: string };
      if (!proceduresResponse.ok) throw new Error(procedures.error || 'Erro ao carregar procedimentos');
      if (!dashboardResponse.ok) throw new Error(dashboard.error || 'Erro ao carregar filas');
      setItems(procedures.items ?? []);
      setCounts(dashboard.filas);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar a central');
    } finally {
      setLoading(false);
    }
  }, [activeQueue, search, unitFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const totalOpen = useMemo(
    () => (counts?.aguardando_decisao ?? 0) + (counts?.aguardando_pagamento ?? 0) + (counts?.aguardando_agendamento ?? 0),
    [counts],
  );
  const columns: TableColumn<ProcedimentoClienteOperacional>[] = [
    {
      key: 'cliente_nome',
      label: 'Paciente',
      render: (item) => (
        <Link className="font-medium text-foreground hover:text-primary" href={`/clientes/${item.cliente_id}`}>
          {item.cliente_nome}
        </Link>
      ),
    },
    {
      key: 'nome_snapshot',
      label: 'Procedimento',
      render: (item) => (
        <div>
          <p className="font-medium text-foreground">{item.nome_snapshot}</p>
          <p className="text-xs text-muted-foreground">{item.origem === 'acrescimo_execucao' ? 'Acréscimo em execução' : 'Orçamento'}</p>
        </div>
      ),
    },
    { key: 'status_comercial', label: 'Comercial', render: (item) => <StatusBadge status={item.status_comercial} /> },
    { key: 'status_financeiro', label: 'Financeiro', render: (item) => <StatusBadge status={item.status_financeiro} /> },
    { key: 'status_agenda', label: 'Agenda', render: (item) => <StatusBadge status={item.status_agenda} /> },
    { key: 'status_clinico', label: 'Clínico', render: (item) => <StatusBadge status={item.status_clinico} /> },
    {
      key: 'saldo',
      label: 'Saldo',
      align: 'right',
      render: (item) => (
        <div>
          <p className="font-semibold text-foreground">{formatarMoeda((item.valor_final_centavos - item.valor_recebido_centavos) / 100)}</p>
          <p className="text-xs text-muted-foreground">de {formatarMoeda(item.valor_final_centavos / 100)}</p>
        </div>
      ),
    },
    { key: 'created_at', label: 'Criado em', render: (item) => formatarDataHora(item.created_at) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de procedimentos"
        description="Acompanhe decisão, pagamento, agenda e execução como dimensões independentes."
        icon={<ListChecks className="size-7" />}
        actions={
          <Link href="/configuracoes/procedimentos">
            <Button variant="secondary" icon={<Settings2 className="size-4" />}>Catálogo</Button>
          </Link>
        }
      />
      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<ClipboardClock className="size-5" />} label="Pendências operacionais" value={totalOpen} color="border-warning-500" />
        <StatCard icon={<CircleDollarSign className="size-5" />} label="Aguardando pagamento" value={counts?.aguardando_pagamento ?? 0} color="border-error-500" />
        <StatCard icon={<CalendarDays className="size-5" />} label="Agendados" value={counts?.agendados ?? 0} color="border-info-500" />
        <StatCard icon={<CheckCircle2 className="size-5" />} label="Concluídos" value={counts?.concluidos ?? 0} color="border-success-500" />
      </div>
      <Alert type="info">
        Um procedimento pode aparecer em mais de uma fila ao mesmo tempo; isso é intencional e evita esconder pendências.
      </Alert>
      <Tabs
        variant="underline"
        activeTab={activeQueue}
        onTabChange={(key) => setActiveQueue(key as QueueKey)}
        tabs={QUEUES.map((queue) => ({ key: queue.key, label: queue.label, count: counts?.[queue.key] ?? 0 }))}
      />
      <FilterBar
        fields={[{ type: 'text', name: 'busca', label: 'Buscar', placeholder: 'Paciente ou procedimento' }]}
        values={{ busca: search }}
        onChange={(_name, value) => setSearch(value)}
        onClear={() => setSearch('')}
      />
      {loading ? (
        <LoadingState text="Carregando procedimentos..." />
      ) : (
        <Table
          columns={columns}
          data={items}
          keyExtractor={(item) => item.id}
          emptyIcon={<Activity className="size-8 text-muted-foreground/50" />}
          emptyMessage="Nenhum procedimento nesta fila"
          caption={`Procedimentos da fila ${activeQueue}`}
        />
      )}
    </div>
  );
}
